import sqlite3
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from app.database.connection import get_db
from app.core.security import get_current_user
from app.core.config import ahora_peru_str, ZONA_PERU
from app.routers.actividades import obtener_set_feriados, es_dia_laborable, calcular_fecha_fin_habil
from app.models.schemas import (
    GuardarPlantillaDesdeProyectoModel,
    CrearProyectoDesdePlantillaModel
)

router = APIRouter(tags=["Plantillas Maestras"])


def siguiente_dia_habil(dt: datetime.date, feriados_set: set) -> datetime.date:
    cur = dt
    while not es_dia_laborable(cur, feriados_set):
        cur += timedelta(days=1)
    return cur


def ordenar_wbs_clave(r: dict) -> list:
    return [int(p) if p.isdigit() else p for p in str(r.get("codigo", "")).rstrip(".").split(".")]


# 1. Listar biblioteca de plantillas (oficiales IMARPE + personales del usuario o modo admin)
@router.get("/plantillas")
def listar_plantillas(
    modo_admin: int = 0,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cols = [c[1] for c in db.execute("PRAGMA table_info(plantillas)").fetchall()]
    if "es_oficial" not in cols:
        db.execute("ALTER TABLE plantillas ADD COLUMN es_oficial INTEGER DEFAULT 1")
        db.commit()

    es_admin = (user.get("rol") == "ADMIN_TI")

    if es_admin and modo_admin == 1:
        # Vista completa para el panel de Gestión TI
        filas = db.execute("""
            SELECT p.id, p.nombre, p.descripcion, p.categoria, p.creador_id,
                   COALESCE(p.es_oficial, 1) AS es_oficial,
                   COALESCE(u.nombre_completo, u.username, 'Sistema IMARPE') AS creador_nombre,
                   COUNT(pa.id) AS total_actividades,
                   SUM(CASE WHEN pa.codigo NOT LIKE '%.%' THEN pa.dias ELSE 0 END) AS duracion_estimada_dias
            FROM plantillas p
            LEFT JOIN usuarios u ON p.creador_id = u.id
            LEFT JOIN plantillas_actividades pa ON p.id = pa.plantilla_id
            GROUP BY p.id
            ORDER BY COALESCE(p.es_oficial, 1) DESC, p.categoria ASC, p.nombre ASC
        """).fetchall()
    else:
        # Vista operativa: oficiales del IMARPE + personales del propio usuario conectado
        filas = db.execute("""
            SELECT p.id, p.nombre, p.descripcion, p.categoria, p.creador_id,
                   COALESCE(p.es_oficial, 1) AS es_oficial,
                   COALESCE(u.nombre_completo, u.username, 'Sistema IMARPE') AS creador_nombre,
                   COUNT(pa.id) AS total_actividades,
                   SUM(CASE WHEN pa.codigo NOT LIKE '%.%' THEN pa.dias ELSE 0 END) AS duracion_estimada_dias
            FROM plantillas p
            LEFT JOIN usuarios u ON p.creador_id = u.id
            LEFT JOIN plantillas_actividades pa ON p.id = pa.plantilla_id
            WHERE COALESCE(p.es_oficial, 1) = 1 OR p.creador_id = ?
            GROUP BY p.id
            ORDER BY COALESCE(p.es_oficial, 1) DESC, p.categoria ASC, p.nombre ASC
        """, (user["id"],)).fetchall()

    resultado = []
    for f in filas:
        d = dict(f)
        acts = db.execute("""
            SELECT codigo, descripcion, dias, predecesores
            FROM plantillas_actividades
            WHERE plantilla_id = ?
            ORDER BY codigo ASC
        """, (d["id"],)).fetchall()
        d["actividades"] = sorted([dict(a) for a in acts], key=ordenar_wbs_clave)
        resultado.append(d)

    return resultado


# 2. Obtener desglose WBS de una plantilla específica
@router.get("/plantillas/{plantilla_id}")
def obtener_detalle_plantilla(
    plantilla_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    plantilla = db.execute("SELECT * FROM plantillas WHERE id = ?", (plantilla_id,)).fetchone()
    if not plantilla:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada.")

    actividades = db.execute("""
        SELECT codigo, descripcion, dias, predecesores 
        FROM plantillas_actividades 
        WHERE plantilla_id = ? 
        ORDER BY codigo ASC
    """, (plantilla_id,)).fetchall()

    acts_ordenadas = sorted([dict(a) for a in actividades], key=ordenar_wbs_clave)

    res = dict(plantilla)
    res["actividades"] = acts_ordenadas
    return res


# 3. Crear nueva plantilla directamente (desde Gestión TI o con estructura WBS)
@router.post("/plantillas")
def crear_nueva_plantilla_directa(
    datos: dict = Body(...),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    nombre = (datos.get("nombre") or "").strip()
    descripcion = (datos.get("descripcion") or "").strip()
    categoria = (datos.get("categoria") or "General").strip()
    actividades = datos.get("actividades") or []

    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre de la plantilla es obligatorio.")

    es_admin = (user.get("rol") == "ADMIN_TI")
    es_oficial_def = 1 if es_admin else 0
    if "es_oficial" in datos and es_admin:
        es_oficial_def = 1 if int(datos.get("es_oficial")) == 1 else 0

    cur = db.cursor()
    cur.execute("""
        INSERT INTO plantillas (nombre, descripcion, categoria, creador_id, es_oficial)
        VALUES (?, ?, ?, ?, ?)
    """, (nombre, descripcion, categoria, user["id"], es_oficial_def))
    plantilla_id = cur.lastrowid

    for a in actividades:
        cod = str(a.get("codigo") or "").strip()
        desc = str(a.get("descripcion") or "").strip()
        if not cod or not desc:
            continue
        dias = max(1, int(a.get("dias") or 1))
        pred = str(a.get("predecesores") or "").strip()
        cur.execute("""
            INSERT INTO plantillas_actividades (plantilla_id, codigo, descripcion, dias, predecesores)
            VALUES (?, ?, ?, ?, ?)
        """, (plantilla_id, cod, desc, dias, pred))

    db.commit()
    tipo_txt = "oficial del IMARPE" if es_oficial_def == 1 else "personal (solo visible para usted)"
    return {"id": plantilla_id, "es_oficial": es_oficial_def, "mensaje": f"Plantilla guardada como {tipo_txt}."}


# 4. Guardar proyecto activo como plantilla (oficial si es admin, personal si es usuario regular)
@router.post("/plantillas/desde-proyecto")
def guardar_plantilla_desde_proyecto(
    data: GuardarPlantillaDesdeProyectoModel,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    es_gestor = db.execute("""
        SELECT 1 FROM proyectos p 
        LEFT JOIN proyecto_usuarios pu ON p.id = pu.proyecto_id AND pu.usuario_id = ?
        WHERE p.id = ? AND (p.creador_id = ? OR pu.es_gestor = 1 OR pu.permiso = 'GESTOR')
    """, (user["id"], data.proyecto_id, user["id"])).fetchone()

    if not es_gestor and user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo un Gestor o Admin TI puede guardar proyectos como plantilla.")

    acts = db.execute(
        "SELECT codigo, descripcion, dias, predecesores FROM actividades WHERE proyecto_id = ? ORDER BY codigo ASC",
        (data.proyecto_id,)
    ).fetchall()
    if not acts:
        raise HTTPException(status_code=400, detail="El proyecto seleccionado no contiene actividades para crear una plantilla.")

    es_admin = (user.get("rol") == "ADMIN_TI")
    es_oficial_def = 1 if es_admin else 0

    cur = db.cursor()
    cur.execute("""
        INSERT INTO plantillas (nombre, descripcion, categoria, creador_id, es_oficial)
        VALUES (?, ?, ?, ?, ?)
    """, (data.nombre.strip(), data.descripcion.strip(), data.categoria.strip() or "General", user["id"], es_oficial_def))
    
    plantilla_id = cur.lastrowid

    for a in acts:
        cur.execute("""
            INSERT INTO plantillas_actividades (plantilla_id, codigo, descripcion, dias, predecesores)
            VALUES (?, ?, ?, ?, ?)
        """, (plantilla_id, a["codigo"], a["descripcion"], max(1, int(a["dias"] or 1)), a["predecesores"] or ""))

    tipo_txt = "oficial del IMARPE" if es_oficial_def == 1 else "personal (solo visible para su usuario)"
    db.execute("""
        INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle)
        VALUES (?, ?, ?, 'Creación de plantilla', ?)
    """, (data.proyecto_id, ahora_peru_str(), user["username"], f"Guardó este proyecto como plantilla {tipo_txt}: '{data.nombre.strip()}'"))

    db.commit()
    return {
        "status": "success",
        "mensaje": f"Plantilla guardada exitosamente como {tipo_txt}.",
        "plantilla_id": plantilla_id,
        "es_oficial": es_oficial_def
    }


# 5. Actualizar plantilla existente y su estructura WBS completa
@router.put("/plantillas/{plantilla_id}")
def actualizar_plantilla_completa(
    plantilla_id: int,
    datos: dict = Body(...),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    plantilla = db.execute(
        "SELECT id, creador_id, COALESCE(es_oficial, 1) AS es_oficial FROM plantillas WHERE id = ?",
        (plantilla_id,)
    ).fetchone()
    if not plantilla:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada.")

    es_admin = (user.get("rol") == "ADMIN_TI")
    if not es_admin and plantilla["creador_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="No tiene permisos para editar esta plantilla.")

    nuevo_nombre = (datos.get("nombre") or "").strip()
    nueva_desc = (datos.get("descripcion") or "").strip()
    nueva_cat = (datos.get("categoria") or "General").strip()
    nuevo_oficial = plantilla["es_oficial"]

    if es_admin and "es_oficial" in datos:
        nuevo_oficial = 1 if int(datos.get("es_oficial")) == 1 else 0

    if not nuevo_nombre:
        raise HTTPException(status_code=400, detail="El nombre de la plantilla es obligatorio.")

    db.execute("""
        UPDATE plantillas
        SET nombre = ?, descripcion = ?, categoria = ?, es_oficial = ?
        WHERE id = ?
    """, (nuevo_nombre, nueva_desc, nueva_cat, nuevo_oficial, plantilla_id))

    if "actividades" in datos and isinstance(datos["actividades"], list):
        db.execute("DELETE FROM plantillas_actividades WHERE plantilla_id = ?", (plantilla_id,))
        for a in datos["actividades"]:
            cod = str(a.get("codigo") or "").strip()
            desc = str(a.get("descripcion") or "").strip()
            if not cod or not desc:
                continue
            dias = max(1, int(a.get("dias") or 1))
            pred = str(a.get("predecesores") or "").strip()
            db.execute("""
                INSERT INTO plantillas_actividades (plantilla_id, codigo, descripcion, dias, predecesores)
                VALUES (?, ?, ?, ?, ?)
            """, (plantilla_id, cod, desc, dias, pred))

    db.commit()
    return {"mensaje": "Plantilla y estructura de actividades actualizadas correctamente."}


# 6. Eliminar plantilla
@router.delete("/plantillas/{plantilla_id}")
def eliminar_plantilla(
    plantilla_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    plantilla = db.execute("SELECT creador_id FROM plantillas WHERE id = ?", (plantilla_id,)).fetchone()
    if not plantilla:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada.")

    if user["rol"] != "ADMIN_TI" and plantilla["creador_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="No tiene permiso para eliminar esta plantilla.")

    db.execute("DELETE FROM plantillas_actividades WHERE plantilla_id = ?", (plantilla_id,))
    db.execute("DELETE FROM plantillas WHERE id = ?", (plantilla_id,))
    db.commit()
    return {"mensaje": "Plantilla eliminada correctamente."}


# 7. Crear un proyecto completo a partir de una plantilla
@router.post("/proyectos/desde-plantilla")
def crear_proyecto_desde_plantilla(
    data: CrearProyectoDesdePlantillaModel,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    plantilla = db.execute("SELECT * FROM plantillas WHERE id = ?", (data.plantilla_id,)).fetchone()
    if not plantilla:
        raise HTTPException(status_code=404, detail="La plantilla seleccionada no existe.")

    acts_plantilla = db.execute("""
        SELECT codigo, descripcion, dias, predecesores 
        FROM plantillas_actividades 
        WHERE plantilla_id = ?
        ORDER BY codigo ASC
    """, (data.plantilla_id,)).fetchall()

    if not acts_plantilla:
        raise HTTPException(status_code=400, detail="La plantilla seleccionada no contiene actividades.")

    modo_duracion = str(data.duration_mode or "business_days").strip().lower()
    if modo_duracion not in ("business_days", "hours"):
        modo_duracion = "business_days"
    unidad_tiempo = "HORAS" if modo_duracion == "hours" else "DIAS"

    visib = (data.visibilidad or "PRIVADO").upper().strip()
    if visib not in ("PRIVADO", "PUBLICO"):
        visib = "PRIVADO"

    db.execute("""
        INSERT INTO proyectos (
            nombre, descripcion, unidad_organica, proceso_codigo, proceso_nombre,
            es_proceso_personalizado, duration_mode, unidad_tiempo, visibilidad, creador_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.nombre_proyecto.strip(),
        (data.descripcion or plantilla["descripcion"] or "").strip(),
        (data.unidad_organica or "").strip(),
        (data.proceso_codigo or "").strip(),
        (data.proceso_nombre or "").strip(),
        int(data.es_proceso_personalizado or 0),
        modo_duracion,
        unidad_tiempo,
        visib,
        user["id"]
    ))
    
    nuevo_proy_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    db.execute("INSERT INTO proyecto_usuarios (proyecto_id, usuario_id, es_gestor, permiso) VALUES (?, ?, 1, 'GESTOR')", (nuevo_proy_id, user["id"]))

    feriados_set = obtener_set_feriados(db)
    try:
        p_fecha = data.fecha_inicio.strip().split("/")
        dt_base = datetime(int(p_fecha[2]), int(p_fecha[1]), int(p_fecha[0])).date()
    except Exception:
        dt_base = datetime.now(ZONA_PERU).date()

    dt_base = siguiente_dia_habil(dt_base, feriados_set)
    acts_ordenadas = sorted(acts_plantilla, key=ordenar_wbs_clave)
    acts_a_insertar = []
    mapa_fechas_fin = {}

    for a in acts_ordenadas:
        cod = str(a["codigo"]).rstrip(".")
        dias = max(1, int(a["dias"] or 1))
        preds = [p.strip().rstrip(".") for p in (a["predecesores"] or "").split(",") if p.strip()]

        dt_ini_act = dt_base
        if preds:
            max_fin_pred = None
            for pr in preds:
                if pr in mapa_fechas_fin and (max_fin_pred is None or mapa_fechas_fin[pr] > max_fin_pred):
                    max_fin_pred = mapa_fechas_fin[pr]
            if max_fin_pred:
                dt_ini_act = siguiente_dia_habil(max_fin_pred + timedelta(days=1), feriados_set)
        
        dias_calculo = max(1, (dias + 7) // 8) if modo_duracion == "hours" else dias
        dt_fin_act = calcular_fecha_fin_habil(dt_ini_act, dias_calculo, feriados_set)
        mapa_fechas_fin[cod] = dt_fin_act

        acts_a_insertar.append((
            nuevo_proy_id,
            cod,
            a["descripcion"],
            "No asignado",
            "No iniciado",
            0,
            dt_ini_act.strftime("%d/%m/%Y"),
            dt_fin_act.strftime("%d/%m/%Y"),
            dias,
            a["predecesores"] or ""
        ))

    db.executemany("""
        INSERT INTO actividades (proyecto_id, codigo, descripcion, responsable, estado, avance, fecha_inicio, fecha_fin, dias, predecesores)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, acts_a_insertar)

    db.execute("""
        INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle)
        VALUES (?, ?, ?, 'Creación desde plantilla', ?)
    """, (nuevo_proy_id, ahora_peru_str(), user["username"], f"Proyecto inicializado a partir de la plantilla: '{plantilla['nombre']}'"))

    db.commit()
    return {"status": "success", "mensaje": "Proyecto generado exitosamente con la estructura de la plantilla.", "proyecto_id": nuevo_proy_id}


# 8. Importar y aplicar estructura de plantilla en un proyecto vacío existente
@router.post("/proyectos/{proyecto_id}/aplicar-plantilla")
def aplicar_plantilla_en_proyecto_existente(
    proyecto_id: int,
    data: CrearProyectoDesdePlantillaModel,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    es_gestor = db.execute("""
        SELECT 1 FROM proyectos p 
        LEFT JOIN proyecto_usuarios pu ON p.id = pu.proyecto_id AND pu.usuario_id = ?
        WHERE p.id = ? AND (p.creador_id = ? OR pu.es_gestor = 1 OR pu.permiso = 'GESTOR')
    """, (user["id"], proyecto_id, user["id"])).fetchone()

    if not es_gestor and user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo un Gestor del Proyecto puede importar plantillas.")

    total_acts = db.execute("SELECT COUNT(*) FROM actividades WHERE proyecto_id = ?", (proyecto_id,)).fetchone()[0]
    if total_acts > 0:
        raise HTTPException(status_code=400, detail="El proyecto ya contiene actividades. Solo puede importar plantillas en proyectos vacíos.")

    plantilla = db.execute("SELECT * FROM plantillas WHERE id = ?", (data.plantilla_id,)).fetchone()
    if not plantilla:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada.")

    acts_plantilla = db.execute(
        "SELECT codigo, descripcion, dias, predecesores FROM plantillas_actividades WHERE plantilla_id = ? ORDER BY codigo ASC",
        (data.plantilla_id,)
    ).fetchall()
    if not acts_plantilla:
        raise HTTPException(status_code=400, detail="La plantilla no contiene actividades.")

    feriados_set = obtener_set_feriados(db)
    try:
        p_fecha = data.fecha_inicio.strip().split("/")
        dt_base = datetime(int(p_fecha[2]), int(p_fecha[1]), int(p_fecha[0])).date()
    except Exception:
        dt_base = datetime.now(ZONA_PERU).date()

    dt_base = siguiente_dia_habil(dt_base, feriados_set)
    acts_ordenadas = sorted(acts_plantilla, key=ordenar_wbs_clave)
    acts_a_insertar = []
    mapa_fechas_fin = {}

    for a in acts_ordenadas:
        cod = str(a["codigo"]).rstrip(".")
        dias = max(1, int(a["dias"] or 1))
        preds = [p.strip().rstrip(".") for p in (a["predecesores"] or "").split(",") if p.strip()]

        dt_ini_act = dt_base
        if preds:
            max_fin_pred = None
            for pr in preds:
                if pr in mapa_fechas_fin and (max_fin_pred is None or mapa_fechas_fin[pr] > max_fin_pred):
                    max_fin_pred = mapa_fechas_fin[pr]
            if max_fin_pred:
                dt_ini_act = siguiente_dia_habil(max_fin_pred + timedelta(days=1), feriados_set)
        
        dt_fin_act = calcular_fecha_fin_habil(dt_ini_act, dias, feriados_set)
        mapa_fechas_fin[cod] = dt_fin_act

        acts_a_insertar.append((
            proyecto_id,
            cod,
            a["descripcion"],
            "No asignado",
            "No iniciado",
            0,
            dt_ini_act.strftime("%d/%m/%Y"),
            dt_fin_act.strftime("%d/%m/%Y"),
            dias,
            a["predecesores"] or ""
        ))

    db.executemany("""
        INSERT INTO actividades (proyecto_id, codigo, descripcion, responsable, estado, avance, fecha_inicio, fecha_fin, dias, predecesores)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, acts_a_insertar)

    db.execute("""
        INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle)
        VALUES (?, ?, ?, 'Importación de plantilla', ?)
    """, (proyecto_id, ahora_peru_str(), user["username"], f"Importó la estructura de la plantilla: '{plantilla['nombre']}'"))

    db.commit()
    return {"status": "success", "mensaje": "Plantilla importada exitosamente en el proyecto."}