import sqlite3
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from app.database.connection import get_db
from app.core.security import get_current_user
from app.core.config import ahora_peru_str
from app.models.schemas import (
    ActividadModel,
    AsignacionResponsableModel,
    ReordenarActividadesModel,
    ComentarioCreate,
    ComentarioUpdate,
    ActividadesLoteModel,
    RestaurarSnapshotProyectoModel
)

router = APIRouter(tags=["Actividades y WBS"])

# 1. Funciones auxiliares de orden natural y calendario laboral
def clave_orden_natural_wbs(row_dict):
    cod_limpio = str(row_dict.get("codigo", "")).rstrip(".")
    partes = []
    for p in cod_limpio.split("."):
        if p.isdigit():
            partes.append(int(p))
        else:
            partes.append(p)
    return partes

def obtener_set_feriados(db: sqlite3.Connection) -> set:
    try:
        rows = db.execute("SELECT fecha FROM feriados_institucionales").fetchall()
        return {r[0] for r in rows}
    except Exception:
        return set()

def es_dia_laborable(dt: datetime.date, feriados_set: set) -> bool:
    if dt.weekday() >= 5:
        return False
    return dt.isoformat() not in feriados_set

def calcular_fecha_fin_habil(fecha_ini_date: datetime.date, dias_habiles: int, feriados_set: set) -> datetime.date:
    if dias_habiles <= 1:
        return fecha_ini_date
    cur = fecha_ini_date
    contados = 1
    while contados < dias_habiles:
        cur += timedelta(days=1)
        if es_dia_laborable(cur, feriados_set):
            contados += 1
    return cur

def reestructurar_codigos_wbs(proyecto_id: int, db: sqlite3.Connection, lista_ordenada_manual: Optional[List[dict]] = None):
    if lista_ordenada_manual is not None:
        actividades_secuencia = lista_ordenada_manual
    else:
        rows = db.execute("""
            SELECT codigo, descripcion, responsable, estado, avance, fecha_inicio, fecha_fin, dias, predecesores 
            FROM actividades 
            WHERE proyecto_id = ?
        """, (proyecto_id,)).fetchall()

        if not rows:
            return

        actividades_secuencia = sorted(rows, key=clave_orden_natural_wbs)

    if not actividades_secuencia:
        return

    mapeo_nuevos_codigos = {}
    stack_jerarquia = []
    conteo_hijos = {}

    for act in actividades_secuencia:
        cod_antiguo = str(act["codigo"]).rstrip(".")
        partes = cod_antiguo.split(".")
        nivel_orig = len(partes)

        while stack_jerarquia and stack_jerarquia[-1][0] >= nivel_orig:
            stack_jerarquia.pop()

        if not stack_jerarquia:
            conteo_hijos[""] = conteo_hijos.get("", 0) + 1
            nuevo_cod = str(conteo_hijos[""])
        else:
            padre_nuevo = stack_jerarquia[-1][1]
            conteo_hijos[padre_nuevo] = conteo_hijos.get(padre_nuevo, 0) + 1
            nuevo_cod = f"{padre_nuevo}.{conteo_hijos[padre_nuevo]}"

        stack_jerarquia.append((nivel_orig, nuevo_cod))
        mapeo_nuevos_codigos[cod_antiguo] = nuevo_cod

    actividades_renumeradas = []
    for act in actividades_secuencia:
        cod_ant = str(act["codigo"]).rstrip(".")
        nuevo_cod = mapeo_nuevos_codigos[cod_ant]

        preds_antiguos = [p.strip().rstrip(".") for p in (act["predecesores"] or "").split(",") if p.strip()]
        preds_nuevos = [mapeo_nuevos_codigos[p] for p in preds_antiguos if p in mapeo_nuevos_codigos]
        predecesores_str = ", ".join(preds_nuevos)

        actividades_renumeradas.append((
            proyecto_id,
            nuevo_cod,
            act["descripcion"],
            act["responsable"],
            act["estado"],
            act["avance"],
            act["fecha_inicio"],
            act["fecha_fin"],
            act["dias"],
            predecesores_str
        ))

    db.execute("DELETE FROM actividades WHERE proyecto_id = ?", (proyecto_id,))
    db.executemany("""
        INSERT INTO actividades (proyecto_id, codigo, descripcion, responsable, estado, avance, fecha_inicio, fecha_fin, dias, predecesores)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, actividades_renumeradas)

# 2. Obtener actividades de un proyecto ordenadas por WBS
@router.get("/proyectos/{proyecto_id}/actividades")
def obtener_actividades_proyecto(proyecto_id: int, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute("SELECT * FROM actividades WHERE proyecto_id = ?", (proyecto_id,)).fetchall()
    acts = [dict(r) for r in rows]
    return sorted(acts, key=clave_orden_natural_wbs)

# 3. Crear o actualizar actividad
@router.post("/actividades")
def guardar_actividad(act: ActividadModel, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    try:
        p_id = int(act.proyecto_id) if act.proyecto_id is not None else 1
        cod = str(act.codigo).strip().rstrip(".")
        desc = str(act.descripcion).strip()
        resp = str(act.responsable or "No asignado").strip()
        est = str(act.estado or "No iniciado").strip()
        if est == "Pendiente":
            est = "No iniciado"
        av = int(act.avance if act.avance is not None else 0)
        f_ini = str(act.fecha_inicio or "").strip()
        f_fin = str(act.fecha_fin or "").strip()
        dias_val = int(act.dias if act.dias is not None else 1)
        pred = str(act.predecesores or "").strip()

        proy_info = db.execute("SELECT duration_mode, unidad_tiempo, horas_por_dia FROM proyectos WHERE id = ?", (p_id,)).fetchone()
        es_modo_horas = bool(proy_info and (proy_info["duration_mode"] == "hours" or proy_info["unidad_tiempo"] == "HORAS"))

        if es_modo_horas and f_ini:
            try:
                partes_ini = f_ini.split("/")
                dt_ini = datetime(int(partes_ini[2]), int(partes_ini[1]), int(partes_ini[0])).date()
                horas_dia = int(proy_info["horas_por_dia"] or 8)
                dias_habiles_necesarios = max(1, (dias_val + horas_dia - 1) // horas_dia)
                feriados_db = obtener_set_feriados(db)
                dt_fin_calculada = calcular_fecha_fin_habil(dt_ini, dias_habiles_necesarios, feriados_db)
                f_fin = dt_fin_calculada.strftime("%d/%m/%Y")
            except Exception:
                pass

        es_gestor = db.execute("""
            SELECT 1 FROM proyectos p 
            LEFT JOIN proyecto_usuarios pu ON p.id = pu.proyecto_id AND pu.usuario_id = ?
            WHERE p.id = ? AND (p.creador_id = ? OR pu.es_gestor = 1 OR pu.permiso = 'GESTOR')
        """, (user["id"], p_id, user["id"])).fetchone()

        es_admin_o_gestor = bool(es_gestor or user.get("rol") == "ADMIN_TI")

        existe = db.execute("""
            SELECT * FROM actividades 
            WHERE proyecto_id = ? AND (codigo = ? OR codigo = ?)
        """, (p_id, cod, f"{cod}.")).fetchone()

        if not es_admin_o_gestor:
            u_nombre = (user.get("nombre_completo") or "").strip().lower()
            u_user = (user.get("username") or "").strip().lower()
            resp_db = (existe["responsable"] or "").strip().lower() if existe else ""

            es_responsable_valido = bool(
                (u_nombre and u_nombre in resp_db) or 
                (u_user and u_user in resp_db)
            )

            if not existe or not es_responsable_valido:
                raise HTTPException(status_code=403, detail="Acceso restringido: Solo el Gestor o el Responsable asignado pueden actualizar el avance de esta actividad.")

        ahora_str = ahora_peru_str()

        if existe:
            cambios = []
            if existe["descripcion"] != desc:
                cambios.append(f"Descripción: '{desc}'")
            if (existe["responsable"] or "No asignado") != resp:
                cambios.append(f"Resp: '{resp}'")
            if existe["estado"] != est:
                cambios.append(f"Estado: '{est}'")
            if int(existe["avance"] or 0) != av:
                cambios.append(f"Avance: {av}%")
            if existe["fecha_inicio"] != f_ini or existe["fecha_fin"] != f_fin:
                cambios.append(f"Fechas: {f_ini} al {f_fin} ({dias_val}d)")

            detalle_cambio = f"Modificó [{cod}]: " + (", ".join(cambios) if cambios else "Actualización general")

            if es_admin_o_gestor:
                db.execute("""
                    UPDATE actividades 
                    SET descripcion = ?, responsable = ?, estado = ?, avance = ?, 
                        fecha_inicio = ?, fecha_fin = ?, dias = ?, predecesores = ?
                    WHERE proyecto_id = ? AND (codigo = ? OR codigo = ?)
                """, (desc, resp, est, av, f_ini, f_fin, dias_val, pred, p_id, cod, f"{cod}."))
            else:
                db.execute("""
                    UPDATE actividades 
                    SET estado = ?, avance = ?
                    WHERE proyecto_id = ? AND (codigo = ? OR codigo = ?)
                """, (est, av, p_id, cod, f"{cod}."))

            db.execute("""
                INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle) 
                VALUES (?, ?, ?, 'Modificación Actividad', ?)
            """, (p_id, ahora_str, user["username"], detalle_cambio))
        else:
            if not es_admin_o_gestor:
                raise HTTPException(status_code=403, detail="Solo un Gestor del Proyecto puede crear nuevas actividades.")
            
            db.execute("""
                INSERT INTO actividades (proyecto_id, codigo, descripcion, responsable, estado, avance, fecha_inicio, fecha_fin, dias, predecesores)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (p_id, cod, desc, resp, est, av, f_ini, f_fin, dias_val, pred))

            db.execute("""
                INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle) 
                VALUES (?, ?, ?, 'Creación Actividad', ?)
            """, (p_id, ahora_str, user["username"], f"Creó [{cod}]: '{desc}' | Inicio: {f_ini} | Días: {dias_val}"))

        db.commit()
        return {"mensaje": "Actividad guardada correctamente"}
    except HTTPException as he:
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error en base de datos: {str(e)}")

# 4. Eliminar actividad y renumerar WBS
@router.delete("/proyectos/{proyecto_id}/actividades/{codigo}")
def eliminar_actividad(
    proyecto_id: int, 
    codigo: str, 
    user: dict = Depends(get_current_user), 
    db: sqlite3.Connection = Depends(get_db)
):
    es_gestor = db.execute("""
        SELECT 1 FROM proyectos p 
        LEFT JOIN proyecto_usuarios pu ON p.id = pu.proyecto_id AND pu.usuario_id = ?
        WHERE p.id = ? AND (p.creador_id = ? OR pu.es_gestor = 1 OR pu.permiso = 'GESTOR')
    """, (user["id"], proyecto_id, user["id"])).fetchone()

    if not es_gestor and user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo un Gestor del Proyecto puede eliminar actividades.")

    cod_limpio = codigo.rstrip(".")
    
    db.execute("""
        DELETE FROM actividades 
        WHERE proyecto_id = ? AND (codigo = ? OR codigo = ? OR codigo LIKE ?)
    """, (proyecto_id, cod_limpio, f"{cod_limpio}.", f"{cod_limpio}.%"))
    
    reestructurar_codigos_wbs(proyecto_id, db)

    db.execute("""
        INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle) 
        VALUES (?, ?, ?, 'Eliminación Actividad', ?)
    """, (proyecto_id, ahora_peru_str(), user["username"], f"Eliminó [{codigo}] y reestructuró correlativamente el WBS"))
    
    db.commit()
    return {"mensaje": "Actividad eliminada y jerarquía reestructurada correlativamente"}

# 5. Reorganizar actividades mediante Drag and Drop
@router.put("/proyectos/{proyecto_id}/reordenar-actividades")
def reordenar_actividades_proyecto(
    proyecto_id: int,
    data: ReordenarActividadesModel,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    es_gestor = db.execute("""
        SELECT 1 FROM proyectos p 
        LEFT JOIN proyecto_usuarios pu ON p.id = pu.proyecto_id AND pu.usuario_id = ?
        WHERE p.id = ? AND (p.creador_id = ? OR pu.es_gestor = 1 OR pu.permiso = 'GESTOR')
    """, (user["id"], proyecto_id, user["id"])).fetchone()

    if not es_gestor and user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo un Gestor del Proyecto puede reorganizar actividades.")

    rows = db.execute("SELECT * FROM actividades WHERE proyecto_id = ?", (proyecto_id,)).fetchall()
    if not rows:
        return {"mensaje": "Sin actividades para reorganizar"}

    def clave_wbs(r):
        return [int(p) if p.isdigit() else p for p in str(r["codigo"]).rstrip(".").split(".")]
    
    filas_ordenadas = sorted(rows, key=clave_wbs)

    arbol_raices = []
    mapa_nodos = {}

    for r in filas_ordenadas:
        cod = str(r["codigo"]).rstrip(".")
        nodo = {"codigo": cod, "data": dict(r), "children": []}
        mapa_nodos[cod] = nodo
        partes = cod.split(".")
        if len(partes) == 1:
            arbol_raices.append(nodo)
        else:
            padre_cod = ".".join(partes[:-1])
            if padre_cod in mapa_nodos:
                mapa_nodos[padre_cod]["children"].append(nodo)
            else:
                arbol_raices.append(nodo)

    cod_origen = str(data.codigo_origen or "").rstrip(".")
    cod_destino = str(data.codigo_destino or "").rstrip(".")
    modo = data.modo or "below"

    if cod_origen and cod_destino and cod_origen in mapa_nodos and cod_destino in mapa_nodos:
        def extraer_nodo(lista, cod_buscar):
            for idx, n in enumerate(lista):
                if n["codigo"] == cod_buscar:
                    return lista.pop(idx)
                res = extraer_nodo(n["children"], cod_buscar)
                if res is not None:
                    return res
            return None

        nodo_movido = extraer_nodo(arbol_raices, cod_origen)

        if nodo_movido:
            if modo == "inside":
                mapa_nodos[cod_destino]["children"].append(nodo_movido)
            else:
                def insertar_hermano(lista, cod_target, nodo_ins, pos):
                    for idx, n in enumerate(lista):
                        if n["codigo"] == cod_target:
                            punto = idx if pos == "above" else idx + 1
                            lista.insert(punto, nodo_ins)
                            return True
                        if insertar_hermano(n["children"], cod_target, nodo_ins, pos):
                            return True
                    return False

                insertar_hermano(arbol_raices, cod_destino, nodo_movido, modo)

    mapeo_codigos = {}
    actividades_nuevas = []

    def aplanar_y_renumerar(lista, prefijo=""):
        for idx, n in enumerate(lista, start=1):
            nuevo_cod = f"{prefijo}.{idx}" if prefijo else str(idx)
            old_cod = n["codigo"]
            mapeo_codigos[old_cod] = nuevo_cod

            d = n["data"]
            d["codigo"] = nuevo_cod
            actividades_nuevas.append(d)

            aplanar_y_renumerar(n["children"], nuevo_cod)

    aplanar_y_renumerar(arbol_raices)

    for act in actividades_nuevas:
        if len(act["codigo"].split(".")) > 4:
            raise HTTPException(
                status_code=400, 
                detail=f"La actividad '{act['descripcion']}' excedería el límite máximo permitido de 4 niveles jerárquicos."
            )

    actividades_finales_db = []
    for act in actividades_nuevas:
        preds = [p.strip().rstrip(".") for p in (act.get("predecesores") or "").split(",") if p.strip()]
        preds_actualizados = [mapeo_codigos.get(p, p) for p in preds]
        predecesores_str = ", ".join(preds_actualizados)

        actividades_finales_db.append((
            proyecto_id,
            act["codigo"],
            act["descripcion"],
            act["responsable"],
            act["estado"],
            act["avance"],
            act["fecha_inicio"],
            act["fecha_fin"],
            act["dias"],
            predecesores_str
        ))

    db.execute("DELETE FROM actividades WHERE proyecto_id = ?", (proyecto_id,))
    db.executemany("""
        INSERT INTO actividades (proyecto_id, codigo, descripcion, responsable, estado, avance, fecha_inicio, fecha_fin, dias, predecesores)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, actividades_finales_db)

    db.execute("""
        INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle) 
        VALUES (?, ?, ?, 'Reorganización WBS', ?)
    """, (proyecto_id, ahora_peru_str(), user["username"], f"Reorganizó la actividad [{cod_origen}] respecto a [{cod_destino}] ({modo})"))

    db.commit()
    return {"mensaje": "Actividades reubicadas y WBS recalculado con éxito"}

# 6. Asignación directa de responsables a la actividad
@router.put("/actividades/responsable")
def actualizar_responsable_actividad(
    data: AsignacionResponsableModel,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    p_id = int(data.proyecto_id)
    cod_limpio = str(data.codigo).strip().rstrip(".")
    resp_limpio = str(data.responsable or "No asignado").strip()
    
    db.execute("""
        UPDATE actividades 
        SET responsable = ?
        WHERE proyecto_id = ? AND (codigo = ? OR codigo = ?)
    """, (resp_limpio, p_id, cod_limpio, f"{cod_limpio}."))
    
    db.execute("""
        INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle)
        VALUES (?, ?, ?, 'Asignación Responsable', ?)
    """, (p_id, ahora_peru_str(), user["username"], f"Asignó responsable(s) a [{cod_limpio}]: {resp_limpio}"))
    
    db.commit()
    return {"mensaje": "Responsable actualizado correctamente", "responsable": resp_limpio}

# 7. Gestión de Comentarios Colaborativos (Word 365)
@router.get("/proyectos/{proyecto_id}/comentarios")
def listar_comentarios_proyecto(proyecto_id: int, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute("""
        SELECT id, proyecto_id, codigo_actividad, usuario_id, autor_nombre, autor_unidad, texto, 
               fecha_creacion, fecha_edicion
        FROM comentarios_actividad
        WHERE proyecto_id = ?
        ORDER BY id ASC
    """, (int(proyecto_id),)).fetchall()
    
    def formatear_fecha_peru(f_raw):
        if not f_raw:
            return ""
        s = str(f_raw).strip()
        if "-" in s and len(s) >= 16:
            partes = s.split(" ")
            f_partes = partes[0].split("-")
            hora_partes = partes[1].split(":") if len(partes) > 1 else ["00", "00"]
            if len(f_partes) == 3:
                return f"{f_partes[2]}/{f_partes[1]}/{f_partes[0]} {hora_partes[0]}:{hora_partes[1]}"
        return s

    return [
        {
            "id": r["id"],
            "proyecto_id": r["proyecto_id"],
            "codigo_actividad": r["codigo_actividad"],
            "usuario_id": r["usuario_id"],
            "autor_nombre": r["autor_nombre"],
            "autor_unidad": r["autor_unidad"],
            "texto": r["texto"],
            "fecha_creacion": formatear_fecha_peru(r["fecha_creacion"]),
            "fecha_edicion": formatear_fecha_peru(r["fecha_edicion"])
        }
        for r in rows
    ]

@router.post("/comentarios")
def crear_comentario(data: ComentarioCreate, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    texto_limpio = data.texto.strip()
    if not texto_limpio:
        raise HTTPException(status_code=400, detail="El comentario no puede estar vacío.")
    if len(texto_limpio) > 500:
        raise HTTPException(status_code=400, detail="El comentario excede el límite permitido (500 caracteres).")

    autor_nombre = user.get("nombre_completo") or user["username"]

    t_row = db.execute("SELECT unidad_organica FROM trabajadores WHERE nombre_completo LIKE ? LIMIT 1", (f"%{autor_nombre}%",)).fetchone()
    autor_unidad = t_row["unidad_organica"] if t_row and t_row["unidad_organica"] else (user.get("rol") if user.get("rol") == "ADMIN_TI" else "")
    cod_limpio = str(data.codigo_actividad).strip().rstrip(".")

    fecha_ahora_peru = ahora_peru_str()
    db.execute("""
        INSERT INTO comentarios_actividad (proyecto_id, codigo_actividad, usuario_id, autor_nombre, autor_unidad, texto, fecha_creacion)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (int(data.proyecto_id), cod_limpio, user["id"], autor_nombre, autor_unidad, texto_limpio, fecha_ahora_peru))

    db.execute("""
        INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle)
        VALUES (?, ?, ?, 'Nuevo Comentario', ?)
    """, (int(data.proyecto_id), ahora_peru_str(), user["username"], f"Comentó en la actividad [{cod_limpio}]"))

    db.commit()
    return {"status": "success", "message": "Comentario registrado con éxito."}

@router.put("/comentarios/{comentario_id}")
def editar_comentario(comentario_id: int, data: ComentarioUpdate, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    texto_limpio = data.texto.strip()
    if not texto_limpio:
        raise HTTPException(status_code=400, detail="El comentario no puede estar vacío.")
    if len(texto_limpio) > 500:
        raise HTTPException(status_code=400, detail="El comentario excede el límite permitido (500 caracteres).")

    row = db.execute("SELECT usuario_id, proyecto_id, codigo_actividad FROM comentarios_actividad WHERE id = ?", (int(comentario_id),)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Comentario no encontrado.")

    if row["usuario_id"] != user["id"] and user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="No tiene permisos para editar este comentario.")

    fecha_ahora_peru = ahora_peru_str()
    db.execute("""
        UPDATE comentarios_actividad
        SET texto = ?, fecha_edicion = ?
        WHERE id = ?
    """, (texto_limpio, fecha_ahora_peru, int(comentario_id)))
    db.commit()

    return {"status": "success", "message": "Comentario editado con éxito."}

@router.delete("/comentarios/{comentario_id}")
def eliminar_comentario(comentario_id: int, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT usuario_id, proyecto_id, codigo_actividad FROM comentarios_actividad WHERE id = ?", (int(comentario_id),)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Comentario no encontrado.")

    es_autor = (row["usuario_id"] == user["id"])
    es_admin = (user.get("rol") == "ADMIN_TI")
    
    es_gestor = db.execute("""
        SELECT 1 FROM proyectos p
        LEFT JOIN proyecto_usuarios pu ON p.id = pu.proyecto_id AND pu.usuario_id = ?
        WHERE p.id = ? AND (p.creador_id = ? OR pu.es_gestor = 1 OR pu.permiso = 'GESTOR')
    """, (user["id"], row["proyecto_id"], user["id"])).fetchone()

    if not (es_autor or es_admin or es_gestor):
        raise HTTPException(status_code=403, detail="No tiene permisos para eliminar este comentario.")

    db.execute("DELETE FROM comentarios_actividad WHERE id = ?", (int(comentario_id),))
    db.commit()

    return {"status": "success", "message": "Comentario eliminado."}

    # 8. Creación Masiva por Lote (Pegado Inteligente desde Excel / Word)
@router.post("/proyectos/{proyecto_id}/actividades-lote")
def crear_actividades_en_lote(
    proyecto_id: int,
    data: ActividadesLoteModel,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    import re
    es_gestor = db.execute("""
        SELECT 1 FROM proyectos p 
        LEFT JOIN proyecto_usuarios pu ON p.id = pu.proyecto_id AND pu.usuario_id = ?
        WHERE p.id = ? AND (p.creador_id = ? OR pu.es_gestor = 1 OR pu.permiso = 'GESTOR')
    """, (user["id"], proyecto_id, user["id"])).fetchone()

    if not es_gestor and user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo un Gestor del Proyecto puede importar listas de actividades.")

    lineas_limpias = [l.strip() for l in (data.lineas or []) if l and l.strip()]
    if not lineas_limpias:
        raise HTTPException(status_code=400, detail="No se detectaron líneas de texto válidas.")

    feriados_set = obtener_set_feriados(db)
    hoy_habil = datetime.now().date()
    while not es_dia_laborable(hoy_habil, feriados_set):
        hoy_habil += timedelta(days=1)

    # Determinar el último código raíz existente
    existentes = db.execute("SELECT codigo, fecha_fin FROM actividades WHERE proyecto_id = ?", (proyecto_id,)).fetchall()
    if len(existentes) > 0 and len(lineas_limpias) > 1:
        raise HTTPException(
            status_code=400,
            detail="Para evitar sobrescribir su cronograma, la opción 'Pegar lista' solo está disponible en proyectos vacíos (sin actividades)."
        )

    max_raiz = 0
    ultima_fecha_fin = hoy_habil

    for r in existentes:
        cod_str = str(r["codigo"]).rstrip(".")
        if "." not in cod_str and cod_str.isdigit():
            max_raiz = max(max_raiz, int(cod_str))
        if r["fecha_fin"]:
            try:
                pf = str(r["fecha_fin"]).split("/")
                dt_f = datetime(int(pf[2]), int(pf[1]), int(pf[0])).date()
                if dt_f > ultima_fecha_fin:
                    ultima_fecha_fin = dt_f
            except Exception:
                pass

    dias_def = max(1, int(data.dias_por_defecto or 3))
    cursor_fecha = hoy_habil if not existentes else ultima_fecha_fin
    nuevas_filas = []
    contador_raiz = max_raiz
    ultimo_codigo_hoja = None

    for linea in lineas_limpias:
        # Detectar si la línea ya trae código WBS al inicio (ej. "1.1 Elaborar informe" o "- Elaborar")
        match_wbs = re.match(r"^(\d+(?:\.\d+){0,3})[\.\)\s\-]+(.+)$", linea)
        if match_wbs and len(existentes) == 0:
            cod_cand = match_wbs.group(1).rstrip(".")
            desc_limpia = match_wbs.group(2).strip()
        else:
            # Limpiar viñetas comunes (-, *, •)
            desc_limpia = re.sub(r"^[\-\*\•\›\>]+\s*", "", linea).strip()
            contador_raiz += 1
            cod_cand = str(contador_raiz)

        if not desc_limpia:
            continue

        while not es_dia_laborable(cursor_fecha, feriados_set):
            cursor_fecha += timedelta(days=1)

        dt_ini = cursor_fecha
        dt_fin = calcular_fecha_fin_habil(dt_ini, dias_def, feriados_set)

        pred_str = ""
        if data.encadenar_secuencialmente and ultimo_codigo_hoja and "." not in cod_cand:
            pred_str = ultimo_codigo_hoja

        nuevas_filas.append((
            proyecto_id,
            cod_cand,
            desc_limpia,
            user.get("nombre_completo") or "No asignado",
            "No iniciado",
            0,
            dt_ini.strftime("%d/%m/%Y"),
            dt_fin.strftime("%d/%m/%Y"),
            dias_def,
            pred_str
        ))

        ultimo_codigo_hoja = cod_cand
        if data.encadenar_secuencialmente:
            cursor_fecha = dt_fin + timedelta(days=1)

    if nuevas_filas:
        db.executemany("""
            INSERT OR REPLACE INTO actividades 
            (proyecto_id, codigo, descripcion, responsable, estado, avance, fecha_inicio, fecha_fin, dias, predecesores)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, nuevas_filas)

        reestructurar_codigos_wbs(proyecto_id, db)

        db.execute("""
            INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle)
            VALUES (?, ?, ?, 'Creación Rápida por Lote', ?)
        """, (proyecto_id, ahora_peru_str(), user["username"], f"Importó {len(nuevas_filas)} actividad(es) en bloque"))
        db.commit()

    return {"status": "success", "creadas": len(nuevas_filas), "mensaje": f"Se crearon {len(nuevas_filas)} actividades automáticamente."}

    # 9. Motor Transaccional para Deshacer (Ctrl+Z) y Rehacer (Ctrl+Y) sin fricción
@router.post("/proyectos/{proyecto_id}/restaurar-snapshot")
def restaurar_snapshot_proyecto(
    proyecto_id: int,
    data: RestaurarSnapshotProyectoModel,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    es_gestor = db.execute("""
        SELECT 1 FROM proyectos p 
        LEFT JOIN proyecto_usuarios pu ON p.id = pu.proyecto_id AND pu.usuario_id = ?
        WHERE p.id = ? AND (p.creador_id = ? OR pu.es_gestor = 1 OR pu.permiso = 'GESTOR')
    """, (user["id"], proyecto_id, user["id"])).fetchone()

    es_admin_o_gestor = bool(es_gestor or user.get("rol") == "ADMIN_TI")

    try:
        if es_admin_o_gestor:
            # El Gestor puede deshacer/rehacer cambios estructurales completos (incluso restaurar tareas eliminadas o reordenadas)
            filas_restaurar = []
            for a in data.actividades:
                cod_limpio = str(a.codigo).strip().rstrip(".")
                filas_restaurar.append((
                    proyecto_id,
                    cod_limpio,
                    str(a.descripcion or "").strip(),
                    str(a.responsable or "No asignado").strip(),
                    str(a.estado or "No iniciado").strip(),
                    int(a.avance or 0),
                    str(a.fecha_inicio or "").strip(),
                    str(a.fecha_fin or "").strip(),
                    int(a.dias or 1),
                    str(a.predecesores or "").strip()
                ))

            db.execute("DELETE FROM actividades WHERE proyecto_id = ?", (proyecto_id,))
            if filas_restaurar:
                db.executemany("""
                    INSERT INTO actividades (proyecto_id, codigo, descripcion, responsable, estado, avance, fecha_inicio, fecha_fin, dias, predecesores)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, filas_restaurar)
        else:
            # Un Responsable Asignado solo puede deshacer/rehacer el estado y avance de sus propias actividades
            u_nombre = (user.get("nombre_completo") or "").strip().lower()
            u_user = (user.get("username") or "").strip().lower()

            existentes = db.execute("SELECT codigo, responsable FROM actividades WHERE proyecto_id = ?", (proyecto_id,)).fetchall()
            mapa_resp = {str(r["codigo"]).rstrip("."): (r["responsable"] or "").lower() for r in existentes}

            for a in data.actividades:
                cod_limpio = str(a.codigo).strip().rstrip(".")
                resp_db = mapa_resp.get(cod_limpio, "")
                if (u_nombre and u_nombre in resp_db) or (u_user and u_user in resp_db):
                    db.execute("""
                        UPDATE actividades
                        SET estado = ?, avance = ?
                        WHERE proyecto_id = ? AND (codigo = ? OR codigo = ?)
                    """, (str(a.estado or "No iniciado"), int(a.avance or 0), proyecto_id, cod_limpio, f"{cod_limpio}."))

        accion_hist = "Deshacer (Ctrl+Z)" if data.operacion == "DESHACER" else "Rehacer (Ctrl+Y)"
        db.execute("""
            INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle)
            VALUES (?, ?, ?, ?, ?)
        """, (proyecto_id, ahora_peru_str(), user["username"], accion_hist, f"{accion_hist}: {data.etiqueta_accion}"))

        db.commit()
        return {"status": "success", "mensaje": f"{accion_hist} aplicado correctamente"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"No se pudo revertir la acción: {str(e)}")