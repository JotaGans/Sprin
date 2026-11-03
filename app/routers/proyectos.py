import sqlite3
from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from app.database.connection import get_db
from app.core.security import get_current_user
from app.core.config import ahora_peru_str
from app.models.schemas import (
    ProyectoCrearModel,
    ProyectoDescripcionUpdate,
    ProyectoNombreUpdate,
    ProyectoUnidadUpdate,
    ProyectoProcesoUpdate,
    PermisoProyectoUpdate
)

router = APIRouter(tags=["Proyectos"])

# 1. Listado general del Hub de Proyectos (con visibilidad, ROF y roles efectivos)
@router.get("/proyectos")
def listar_proyectos_usuario(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    u_id = user["id"]
    u_nom = user.get("nombre_completo", "")
    es_admin_ti = (user.get("rol") == "ADMIN_TI")

    # Si es Administrador TI, permitimos ver todos los proyectos directamente sin restricciones de ROF
    if es_admin_ti:
        rows = db.execute("""
            SELECT DISTINCT p.id, p.nombre, p.descripcion, p.unidad_organica, 
                   p.proceso_codigo, p.proceso_nombre, p.es_proceso_personalizado,
                   COALESCE(p.duration_mode, CASE WHEN p.unidad_tiempo = 'HORAS' THEN 'hours' ELSE 'business_days' END) as duration_mode,
                   COALESCE(p.visibilidad, 'PRIVADO') as visibilidad,
                   p.unidad_tiempo, p.horas_por_dia, p.fecha_creacion,
                   1 as es_gestor,
                   'GESTOR' as rol_efectivo
            FROM proyectos p
            ORDER BY p.id DESC
        """).fetchall()
    else:
        # Lógica estándar para operadores / usuarios regulares
        uo_row = db.execute("""
            SELECT uo.sigla
            FROM unidades_organicas uo
            LEFT JOIN trabajadores t ON uo.titular_trabajador_id = t.id
            LEFT JOIN usuarios u ON (uo.titular_usuario_id = u.id OR u.nombre_completo = t.nombre_completo OR t.correo LIKE u.username || '@%')
            WHERE u.id = ? AND uo.estado = 'ACTIVO'
            LIMIT 1
        """, (u_id,)).fetchone()

        mi_sigla_autoridad = uo_row["sigla"] if uo_row else ""
        resp_like = f"%{u_nom}%"

        query = """
            WITH RECURSIVE ArbolSubordinadas(sigla) AS (
                SELECT sigla FROM unidades_organicas WHERE sigla = ?
                UNION ALL
                SELECT uo.sigla FROM unidades_organicas uo
                JOIN ArbolSubordinadas a ON uo.sigla_padre = a.sigla
            )
            SELECT DISTINCT p.id, p.nombre, p.descripcion, p.unidad_organica, 
                   p.proceso_codigo, p.proceso_nombre, p.es_proceso_personalizado,
                   COALESCE(p.duration_mode, CASE WHEN p.unidad_tiempo = 'HORAS' THEN 'hours' ELSE 'business_days' END) as duration_mode,
                   COALESCE(p.visibilidad, 'PRIVADO') as visibilidad,
                   p.unidad_tiempo, p.horas_por_dia, p.fecha_creacion,
                   CASE 
                       WHEN pu.es_gestor = 1 OR p.creador_id = ? THEN 1 
                       ELSE 0 
                   END as es_gestor,
                   CASE 
                       WHEN pu.es_gestor = 1 OR p.creador_id = ? THEN 'GESTOR'
                       WHEN a.responsable LIKE ? THEN 'RESPONSABLE'
                       WHEN pu.permiso IS NOT NULL THEN pu.permiso
                       WHEN p.visibilidad = 'PUBLICO' AND (p.unidad_organica IN (SELECT sigla FROM ArbolSubordinadas) OR ? = 'PE') THEN 'AUTORIDAD'
                       ELSE 'VISUALIZADOR'
                   END as rol_efectivo
            FROM proyectos p
            LEFT JOIN proyecto_usuarios pu ON p.id = pu.proyecto_id AND pu.usuario_id = ?
            LEFT JOIN actividades a ON p.id = a.proyecto_id
            WHERE p.creador_id = ?
               OR pu.usuario_id = ?
               OR a.responsable LIKE ?
               OR (
                   p.visibilidad = 'PUBLICO' AND (
                       ? = 'PE'
                       OR p.unidad_organica IN (SELECT sigla FROM ArbolSubordinadas)
                   )
               )
            ORDER BY p.id DESC
        """
        rows = db.execute(query, (
            mi_sigla_autoridad, 
            u_id, 
            u_id, resp_like, mi_sigla_autoridad,
            u_id,
            u_id, u_id, resp_like,
            mi_sigla_autoridad
        )).fetchall()
    
    hoy_date = datetime.now().date()
    u_username_low = (user.get("username") or "").strip().lower()
    u_nombre_low = (user.get("nombre_completo") or "").strip().lower()

    def parsear_fecha_str(f_str):
        if not f_str:
            return None
        s = str(f_str).strip().split("T")[0]
        try:
            if "/" in s:
                partes = s.split("/")
                if len(partes) == 3:
                    if len(partes[0]) == 4:
                        return date(int(partes[0]), int(partes[1]), int(partes[2]))
                    return date(int(partes[2]), int(partes[1]), int(partes[0]))
            elif "-" in s:
                partes = s.split("-")
                if len(partes) == 3:
                    if len(partes[0]) == 4:
                        return date(int(partes[0]), int(partes[1]), int(partes[2]))
                    return date(int(partes[2]), int(partes[1]), int(partes[0]))
        except Exception:
            return None
        return None

    proyectos_resumen = []
    for r in rows:
        p_dict = dict(r)
        p_id = p_dict["id"]
        
        acts_raw = db.execute("""
            SELECT codigo, descripcion, responsable, avance, estado, fecha_inicio, fecha_fin, dias 
            FROM actividades 
            WHERE proyecto_id = ? 
            ORDER BY codigo ASC
        """, (p_id,)).fetchall()
        
        if not acts_raw:
            p_dict.update({
                "total_actividades": 0,
                "ejecutadas": 0,
                "en_proceso": 0,
                "pendientes": 0,
                "avance_global": 0,
                "vencidas_count": 0,
                "por_vencer_count": 0,
                "salud_proyecto": "EN_PLAZO",
                "alertas_responsables": [],
                "mis_tareas_proyecto": []
            })
            proyectos_resumen.append(p_dict)
            continue

        acts_dict = {}
        for a in acts_raw:
            cod = str(a["codigo"]).rstrip(".")
            acts_dict[cod] = {
                "codigo": cod,
                "descripcion": str(a["descripcion"] or ""),
                "responsable": str(a["responsable"] or "No asignado"),
                "avance": int(a["avance"] or 0),
                "estado": str(a["estado"] or "No iniciado"),
                "fecha_inicio": str(a["fecha_inicio"] or ""),
                "fecha_fin": str(a["fecha_fin"] or ""),
                "dias": int(a["dias"] or 1)
            }

        def round_half_up(n):
            return int(n + 0.5) if n >= 0 else int(n - 0.5)

        todos_cods = list(acts_dict.keys())
        for nivel_actual in [4, 3, 2, 1]:
            for cod, act in acts_dict.items():
                partes = cod.split(".")
                if len(partes) == nivel_actual:
                    hijos = [acts_dict[c] for c in todos_cods if c.startswith(f"{cod}.") and len(c.split(".")) == nivel_actual + 1]
                    if hijos:
                        prom_av = round_half_up(sum(h["avance"] for h in hijos) / len(hijos))
                        act["avance"] = prom_av
                        act["estado"] = "Ejecutado" if prom_av == 100 else ("En proceso" if prom_av > 0 else "No iniciado")

        # Evaluar actividades operativas (hojas sin subtareas) para no duplicar alertas con las fases madre
        acts_hojas = [
            act for cod, act in acts_dict.items()
            if not any(c.startswith(f"{cod}.") and c != cod for c in todos_cods)
        ]
        if not acts_hojas:
            acts_hojas = list(acts_dict.values())

        raices = [a for a in acts_dict.values() if "." not in a["codigo"]]
        pct_global = round_half_up(sum(a["avance"] for a in raices) / len(raices)) if raices else 0

        vencidas_count = 0
        por_vencer_count = 0
        alertas_responsables = []
        mis_tareas_proyecto = []

        for h in acts_hojas:
            est_h = h["estado"]
            dt_fin = parsear_fecha_str(h["fecha_fin"])
            dias_restantes = (dt_fin - hoy_date).days if dt_fin else None
            resp_str = h["responsable"]

            if est_h != "Ejecutado" and dias_restantes is not None:
                if dias_restantes < 0:
                    vencidas_count += 1
                    alertas_responsables.append({
                        "proyecto_id": p_id,
                        "proyecto_nombre": p_dict["nombre"],
                        "unidad_organica": p_dict.get("unidad_organica") or "S/U",
                        "es_gestor": p_dict.get("es_gestor", 0),
                        "codigo": h["codigo"],
                        "descripcion": h["descripcion"],
                        "responsable": resp_str,
                        "estado": est_h,
                        "avance": h["avance"],
                        "fecha_fin": h["fecha_fin"],
                        "dias_restantes": dias_restantes,
                        "tipo_alerta": "VENCIDA"
                    })
                elif dias_restantes <= 5:
                    por_vencer_count += 1
                    alertas_responsables.append({
                        "proyecto_id": p_id,
                        "proyecto_nombre": p_dict["nombre"],
                        "unidad_organica": p_dict.get("unidad_organica") or "S/U",
                        "es_gestor": p_dict.get("es_gestor", 0),
                        "codigo": h["codigo"],
                        "descripcion": h["descripcion"],
                        "responsable": resp_str,
                        "estado": est_h,
                        "avance": h["avance"],
                        "fecha_fin": h["fecha_fin"],
                        "dias_restantes": dias_restantes,
                        "tipo_alerta": "POR_VENCER"
                    })

            resp_low = resp_str.lower()
            if est_h != "Ejecutado" and ((u_nombre_low and u_nombre_low in resp_low) or (u_username_low and u_username_low in resp_low)):
                mis_tareas_proyecto.append({
                    "proyecto_id": p_id,
                    "proyecto_nombre": p_dict["nombre"],
                    "unidad_organica": p_dict.get("unidad_organica") or "S/U",
                    "es_gestor": p_dict.get("es_gestor", 0),
                    "codigo": h["codigo"],
                    "descripcion": h["descripcion"],
                    "responsable": resp_str,
                    "estado": est_h,
                    "avance": h["avance"],
                    "fecha_fin": h["fecha_fin"],
                    "dias_restantes": dias_restantes
                })

        alertas_responsables.sort(key=lambda x: x["dias_restantes"] if x["dias_restantes"] is not None else 999)
        mis_tareas_proyecto.sort(key=lambda x: x["dias_restantes"] if x["dias_restantes"] is not None else 999)

        if vencidas_count > 0:
            salud = "CRITICO"
        elif por_vencer_count > 0:
            salud = "ATENCION"
        elif pct_global == 100:
            salud = "COMPLETADO"
        else:
            salud = "EN_PLAZO"

        p_dict["total_actividades"] = len(acts_hojas)
        p_dict["ejecutadas"] = sum(1 for a in acts_hojas if a["estado"] == "Ejecutado")
        p_dict["en_proceso"] = sum(1 for a in acts_hojas if a["estado"] == "En proceso")
        p_dict["pendientes"] = sum(1 for a in acts_hojas if a["estado"] in ["No iniciado", "Pendiente"])
        p_dict["avance_global"] = pct_global
        p_dict["vencidas_count"] = vencidas_count
        p_dict["por_vencer_count"] = por_vencer_count
        p_dict["salud_proyecto"] = salud
        p_dict["alertas_responsables"] = alertas_responsables[:12]
        p_dict["mis_tareas_proyecto"] = mis_tareas_proyecto[:12]

        proyectos_resumen.append(p_dict)

    return proyectos_resumen

# 2. Creación de un proyecto en blanco o desde catálogo
@router.post("/proyectos")
def crear_nuevo_proyecto(p: ProyectoCrearModel, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    modo_duracion = str(p.duration_mode or "").strip().lower()
    if modo_duracion not in ("business_days", "hours"):
        modo_duracion = "hours" if (p.unidad_tiempo or "").upper() == "HORAS" else "business_days"

    unidad_tiempo = "HORAS" if modo_duracion == "hours" else "DIAS"
    horas_dia = int(p.horas_por_dia or 8)

    visibilidad_final = (p.visibilidad or "PRIVADO").upper().strip()
    if visibilidad_final not in ("PRIVADO", "PUBLICO"):
        visibilidad_final = "PRIVADO"

    p_cod = (p.proceso_codigo or "").strip()
    p_nom = (p.proceso_nombre or "").strip()

    # Si vino compuesto como 'E2.1.2 - Gestión por procesos', separar automáticamente
    if " - " in p_nom and not p_cod:
        partes = p_nom.split(" - ", 1)
        p_cod = partes[0].strip()
        p_nom = partes[1].strip()

    db.execute("""
        INSERT INTO proyectos (
            nombre, descripcion, unidad_organica, proceso_codigo, proceso_nombre, 
            es_proceso_personalizado, duration_mode, unidad_tiempo, horas_por_dia, 
            visibilidad, creador_id
        ) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        p.nombre.strip(), 
        p.descripcion.strip(), 
        (p.unidad_organica or "").strip(),
        p_cod,
        p_nom,
        int(p.es_proceso_personalizado or 0),
        modo_duracion,
        unidad_tiempo,
        horas_dia,
        visibilidad_final,
        user["id"]
    ))
    nuevo_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    db.execute("INSERT INTO proyecto_usuarios (proyecto_id, usuario_id, es_gestor, permiso) VALUES (?, ?, 1, 'GESTOR')", (nuevo_id, user["id"]))
    db.execute("""
        INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle) 
        VALUES (?, ?, ?, 'Creación Proyecto', ?)
    """, (nuevo_id, ahora_peru_str(), user["username"], f"Proyecto creado: '{p.nombre.strip()}' [Modalidad: {modo_duracion} | Alcance: {visibilidad_final}]"))
    db.commit()
    return {"mensaje": "Proyecto creado exitosamente", "proyecto_id": nuevo_id, "duration_mode": modo_duracion, "visibilidad": visibilidad_final}

# 3. Actualización de descripción
@router.put("/proyectos/{proyecto_id}/descripcion")
def actualizar_descripcion_proyecto(proyecto_id: int, data: ProyectoDescripcionUpdate, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    permiso = db.execute("""
        SELECT 1 FROM proyectos p
        LEFT JOIN proyecto_usuarios pu ON p.id = pu.proyecto_id AND pu.usuario_id = ?
        WHERE p.id = ? AND (p.creador_id = ? OR pu.es_gestor = 1)
    """, (user["id"], proyecto_id, user["id"])).fetchone()
    
    if not permiso and user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="No tiene permisos de Gestor en este proyecto.")
    
    desc_limpia = (data.descripcion or "").strip()[:120]
    db.execute("UPDATE proyectos SET descripcion = ? WHERE id = ?", (desc_limpia, proyecto_id))
    db.commit()
    return {"message": "Descripción actualizada correctamente", "descripcion": desc_limpia}

# 4. Actualización de nombre
@router.put("/proyectos/{proyecto_id}/nombre")
def actualizar_nombre_proyecto(proyecto_id: int, data: ProyectoNombreUpdate, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    permiso = db.execute("""
        SELECT 1 FROM proyectos p
        LEFT JOIN proyecto_usuarios pu ON p.id = pu.proyecto_id AND pu.usuario_id = ?
        WHERE p.id = ? AND (p.creador_id = ? OR pu.es_gestor = 1)
    """, (user["id"], proyecto_id, user["id"])).fetchone()
    
    if not permiso and user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="No tiene permisos de Gestor para renombrar este proyecto.")
    
    nombre_limpio = (data.nombre or "").strip()
    if not nombre_limpio:
        raise HTTPException(status_code=400, detail="El nombre del proyecto no puede estar vacío.")
        
    db.execute("UPDATE proyectos SET nombre = ? WHERE id = ?", (nombre_limpio, proyecto_id))
    db.execute("""
        INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle) 
        VALUES (?, ?, ?, 'Renombrar Proyecto', ?)
    """, (proyecto_id, ahora_peru_str(), user["username"], f"Actualizó el nombre del proyecto a: '{nombre_limpio}'"))
    db.commit()
    return {"message": "Nombre del proyecto actualizado correctamente", "nombre": nombre_limpio}

# 5. Actualización de unidad orgánica
@router.put("/proyectos/{proyecto_id}/unidad-organica")
def actualizar_unidad_organica_proyecto(proyecto_id: int, data: ProyectoUnidadUpdate, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    permiso = db.execute("""
        SELECT 1 FROM proyectos p
        LEFT JOIN proyecto_usuarios pu ON p.id = pu.proyecto_id AND pu.usuario_id = ?
        WHERE p.id = ? AND (p.creador_id = ? OR pu.es_gestor = 1 OR pu.permiso = 'GESTOR')
    """, (user["id"], proyecto_id, user["id"])).fetchone()
    
    if not permiso and user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="No tiene permisos de Gestor para modificar la unidad orgánica de este proyecto.")
    
    uo_limpia = (data.unidad_organica or "").strip()
    if not uo_limpia:
        raise HTTPException(status_code=400, detail="La unidad orgánica no puede estar vacía.")
        
    db.execute("UPDATE proyectos SET unidad_organica = ? WHERE id = ?", (uo_limpia, proyecto_id))
    db.execute("""
        INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle) 
        VALUES (?, ?, ?, 'Modificar Unidad Orgánica', ?)
    """, (proyecto_id, ahora_peru_str(), user["username"], f"Actualizó la unidad orgánica del proyecto a: '{uo_limpia}'"))
    db.commit()
    return {"message": "Unidad de organización actualizada correctamente", "unidad_organica": uo_limpia}

# 6. Actualización de proceso relacionado
@router.put("/proyectos/{proyecto_id}/proceso")
def actualizar_proceso_proyecto(proyecto_id: int, data: ProyectoProcesoUpdate, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    permiso = db.execute("""
        SELECT 1 FROM proyectos p
        LEFT JOIN proyecto_usuarios pu ON p.id = pu.proyecto_id AND pu.usuario_id = ?
        WHERE p.id = ? AND (p.creador_id = ? OR pu.es_gestor = 1 OR pu.permiso = 'GESTOR')
    """, (user["id"], proyecto_id, user["id"])).fetchone()
    
    if not permiso and user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="No tiene permisos de Gestor para modificar el proceso de este proyecto.")
    
    p_cod = (data.proceso_codigo or "").strip()
    p_nom = (data.proceso_nombre or "").strip()
    es_pers = int(data.es_proceso_personalizado or 0)
    
    db.execute("""
        UPDATE proyectos 
        SET proceso_codigo = ?, proceso_nombre = ?, es_proceso_personalizado = ? 
        WHERE id = ?
    """, (p_cod, p_nom, es_pers, proyecto_id))
    
    db.execute("""
        INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle) 
        VALUES (?, ?, ?, 'Modificar Proceso', ?)
    """, (proyecto_id, ahora_peru_str(), user["username"], f"Asignó proceso: {p_nom} [{p_cod}]"))
    db.commit()
    return {"message": "Proceso relacionado actualizado correctamente"}

# 7. Eliminación de proyecto vacío
@router.delete("/proyectos/{proyecto_id}")
def eliminar_proyecto_vacio(
    proyecto_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    es_gestor = db.execute("""
        SELECT 1 FROM proyectos p 
        LEFT JOIN proyecto_usuarios pu ON p.id = pu.proyecto_id AND pu.usuario_id = ?
        WHERE p.id = ? AND (p.creador_id = ? OR pu.es_gestor = 1 OR pu.permiso = 'GESTOR')
    """, (user["id"], proyecto_id, user["id"])).fetchone()

    if not es_gestor and user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo un Gestor o Admin TI puede eliminar este proyecto.")

    total_acts = db.execute("SELECT COUNT(*) FROM actividades WHERE proyecto_id = ?", (proyecto_id,)).fetchone()[0]
    if total_acts > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"No se puede eliminar el proyecto porque contiene {total_acts} actividad(es). Debe eliminar primero todas las actividades para poder borrar el proyecto."
        )

    db.execute("DELETE FROM proyecto_usuarios WHERE proyecto_id = ?", (proyecto_id,))
    db.execute("DELETE FROM comentarios_actividad WHERE proyecto_id = ?", (proyecto_id,))
    db.execute("DELETE FROM historial WHERE proyecto_id = ?", (proyecto_id,))
    db.execute("DELETE FROM proyectos WHERE id = ?", (proyecto_id,))
    db.commit()
    return {"status": "success", "mensaje": "Proyecto eliminado exitosamente."}

# 8. Historial de auditoría del proyecto
@router.get("/proyectos/{proyecto_id}/historial")
def ver_historial(
    proyecto_id: int, 
    user: dict = Depends(get_current_user), 
    db: sqlite3.Connection = Depends(get_db)
):
    p_id = int(proyecto_id)
    try:
        rows = db.execute("""
            SELECT COALESCE(timestamp, datetime('now')) as timestamp, 
                   COALESCE(usuario, 'admin') as usuario,
                   COALESCE(accion, 'Registro') as accion, 
                   COALESCE(detalle, 'Operación sin detalle') as detalle 
            FROM historial 
            WHERE proyecto_id = ?
            ORDER BY ROWID DESC LIMIT 100
        """, (p_id,)).fetchall()
        return [dict(r) for r in rows]
    except Exception as e:
        print(f"Error consultando historial: {e}")
        return []

# 9. Administración de personal y roles dentro del proyecto (Con protección de Creador y Unidad Orgánica)
@router.get("/proyectos/{proyecto_id}/personal_permisos")
def listar_personal_proyecto(
    proyecto_id: int, 
    user: dict = Depends(get_current_user), 
    db: sqlite3.Connection = Depends(get_db)
):
    p_id = int(proyecto_id)
    proy = db.execute("SELECT creador_id FROM proyectos WHERE id = ?", (p_id,)).fetchone()
    creador_id = proy["creador_id"] if proy else None

    miembros = db.execute("""
        SELECT u.id, u.username, 
               COALESCE(t.nombre_completo, u.nombre_completo, u.username) as nombre_completo, 
               COALESCE(t.unidad_organica, '') as unidad_organica,
               u.rol,
               pu.es_gestor,
               CASE WHEN pu.es_gestor = 1 OR p.creador_id = u.id THEN 'GESTOR' ELSE 'LECTOR' END as nivel_permiso
        FROM proyecto_usuarios pu
        JOIN usuarios u ON pu.usuario_id = u.id
        JOIN proyectos p ON p.id = pu.proyecto_id
        LEFT JOIN trabajadores t ON (
            u.nombre_completo = t.nombre_completo 
            OR t.correo LIKE u.username || '@%'
            OR u.username = t.correo
        )
        WHERE pu.proyecto_id = ? AND u.estado = 'ACTIVO'
        ORDER BY pu.es_gestor DESC, nombre_completo ASC
    """, (p_id,)).fetchall()

    todos = db.execute("""
        SELECT u.id, u.username, 
               COALESCE(t.nombre_completo, u.nombre_completo, u.username) as nombre_completo, 
               COALESCE(t.unidad_organica, '') as unidad_organica,
               u.rol, u.estado
        FROM usuarios u
        LEFT JOIN trabajadores t ON (
            u.nombre_completo = t.nombre_completo 
            OR t.correo LIKE u.username || '@%'
            OR u.username = t.correo
        )
        WHERE u.estado = 'ACTIVO'
        ORDER BY nombre_completo ASC
    """).fetchall()

    acts = db.execute("SELECT DISTINCT responsable FROM actividades WHERE proyecto_id = ? AND responsable IS NOT NULL", (p_id,)).fetchall()
    responsables_en_acts = []
    for a in acts:
        for r in (a["responsable"] or "").split(";"):
            limpio = r.strip()
            if limpio and limpio != "No asignado" and limpio not in responsables_en_acts:
                responsables_en_acts.append(limpio)

    return {
        "creador_id": creador_id,
        "miembros": [dict(m) for m in miembros],
        "todos_usuarios": [dict(u) for u in todos],
        "responsables_en_actividades": responsables_en_acts
    }

@router.post("/proyectos/{proyecto_id}/personal_permisos")
def actualizar_permiso_personal(
    proyecto_id: int, 
    data: PermisoProyectoUpdate, 
    user: dict = Depends(get_current_user), 
    db: sqlite3.Connection = Depends(get_db)
):
    p_id = int(proyecto_id)
    u_id = int(user["id"])

    permiso_admin = db.execute("""
        SELECT 1 FROM proyectos p
        LEFT JOIN proyecto_usuarios pu ON p.id = pu.proyecto_id AND pu.usuario_id = ?
        WHERE p.id = ? AND (p.creador_id = ? OR pu.es_gestor = 1 OR pu.permiso = 'GESTOR')
    """, (u_id, p_id, u_id)).fetchone()

    if not permiso_admin and user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo un Gestor del Proyecto puede asignar permisos.")

    proy = db.execute("SELECT creador_id FROM proyectos WHERE id = ?", (p_id,)).fetchone()
    creador_id = proy["creador_id"] if proy else None

    nivel_norm = (data.nivel or "").upper().strip()
    if nivel_norm in ("NINGUNO", "LECTOR", "VISUALIZADOR"):
        if creador_id and int(data.usuario_id) == int(creador_id):
            raise HTTPException(status_code=400, detail="Por seguridad, el Creador original del proyecto siempre conserva el rol de Gestor.")
        if int(data.usuario_id) == u_id and user.get("rol") != "ADMIN_TI":
            raise HTTPException(status_code=400, detail="Por seguridad, no puedes revocar ni degradar tu propio permiso de Gestor.")

    u_target = db.execute("SELECT username, nombre_completo FROM usuarios WHERE id = ?", (data.usuario_id,)).fetchone()
    target_info = u_target["nombre_completo"] if u_target and u_target["nombre_completo"] else f"@{u_target['username']}"

    if nivel_norm == "NINGUNO":
        db.execute("DELETE FROM proyecto_usuarios WHERE proyecto_id = ? AND usuario_id = ?", (p_id, data.usuario_id))
        accion_hist = "Retiro de Rol en Proyecto"
        detalle_hist = f"Retiró el acceso especial de: {target_info}"
    else:
        es_gestor_val = 1 if nivel_norm == "GESTOR" else 0
        permiso_bd = "GESTOR" if es_gestor_val == 1 else "VISUALIZADOR"
        existe = db.execute("SELECT 1 FROM proyecto_usuarios WHERE proyecto_id = ? AND usuario_id = ?", (p_id, data.usuario_id)).fetchone()
        if existe:
            db.execute("""
                UPDATE proyecto_usuarios 
                SET es_gestor = ?, permiso = ? 
                WHERE proyecto_id = ? AND usuario_id = ?
            """, (es_gestor_val, permiso_bd, p_id, data.usuario_id))
        else:
            db.execute("""
                INSERT INTO proyecto_usuarios (proyecto_id, usuario_id, es_gestor, permiso)
                VALUES (?, ?, ?, ?)
            """, (p_id, data.usuario_id, es_gestor_val, permiso_bd))

        etiqueta_amigable = "Gestor de proyecto" if es_gestor_val == 1 else "Visualizador (Solo lectura)"
        accion_hist = "Asignación de Rol en Proyecto"
        detalle_hist = f"Asignó rol '{etiqueta_amigable}' a: {target_info}"

    db.execute("""
        INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle)
        VALUES (?, ?, ?, ?, ?)
    """, (p_id, ahora_peru_str(), user["username"], accion_hist, detalle_hist))

    db.commit()
    return {"mensaje": "Permiso actualizado exitosamente"}