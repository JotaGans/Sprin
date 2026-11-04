import sqlite3
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from app.database.connection import get_db
from app.core.security import get_current_user, hash_password
from app.core.config import ahora_peru_str, ZONA_PERU
from app.database.init_db import calcular_jueves_viernes_santo
from app.models.schemas import (
    UsuarioAltaModel,
    UsuarioEstadoUpdate,
    UsuarioRolUpdate,
    UnidadOrganicaModel,
    AsignarTitularModel,
    ActualizarDependenciaROFModel,
    TrabajadorAltaModel,
    TrabajadorActualizarModel,
    ProcesoItemModel,
    ProcesoEditarModel,
    FeriadoCrearModel,
    FeriadoEditarModel,
    FeriadoToggleModel,
    ResponsableModel,
    ResponsableActualizarModel
)

router = APIRouter(tags=["Gestión TI e Institucional"])

# 1. Gestión de Cuentas de Usuario (Exclusivo Administrador TI)
@router.get("/usuarios")
def listar_usuarios(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    if user["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Acceso denegado: Solo Admin TI.")
    
    rows = db.execute("""
        SELECT id, username, 
               COALESCE(nombre_completo, username) as nombre_completo, 
               rol, 
               COALESCE(estado, 'ACTIVO') as estado 
        FROM usuarios 
        ORDER BY id DESC
    """).fetchall()
    return [dict(r) for r in rows]

@router.post("/usuarios")
def alta_usuario(nuevo: UsuarioAltaModel, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    if user["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede dar de alta usuarios.")
    
    user_limpio = nuevo.username.strip().lower()
    nombre_comp = f"{nuevo.apellidos.strip()}, {nuevo.nombres.strip()}"
    
    existe = db.execute("SELECT id FROM usuarios WHERE username = ?", (user_limpio,)).fetchone()
    if existe:
        raise HTTPException(status_code=400, detail="El nombre de usuario ya está registrado.")

    hashed = hash_password(nuevo.password)
    db.execute("""
        INSERT INTO usuarios (username, password, nombre_completo, rol, estado) 
        VALUES (?, ?, ?, ?, 'ACTIVO')
    """, (user_limpio, hashed, nombre_comp, nuevo.rol))
    
    db.execute("INSERT OR IGNORE INTO responsables (nombre, cargo, correo) VALUES (?, ?, ?)",
               (nombre_comp, "Personal IMARPE", f"{user_limpio}@imarpe.gob.pe"))
    
    db.commit()
    return {"mensaje": "Usuario dado de alta exitosamente"}

@router.put("/usuarios/estado")
def alternar_estado_usuario(data: UsuarioEstadoUpdate, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    if user["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede modificar el estado de usuarios.")
    
    if data.usuario_id == user["id"]:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta activa.")

    db.execute("UPDATE usuarios SET estado = ? WHERE id = ?", (data.estado, data.usuario_id))
    db.commit()
    return {"mensaje": f"Estado actualizado a {data.estado}"}

@router.put("/usuarios/rol")
def actualizar_rol_global_usuario(
    data: UsuarioRolUpdate, 
    user: dict = Depends(get_current_user), 
    db: sqlite3.Connection = Depends(get_db)
):
    if user["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede modificar roles globales.")
    
    if data.rol not in ["ADMIN_TI", "OPERADOR"]:
        raise HTTPException(status_code=400, detail="Rol no válido.")

    if data.usuario_id == user["id"] and data.rol != "ADMIN_TI":
        raise HTTPException(status_code=400, detail="No puedes quitarte el rol de Administrador TI a ti mismo.")

    db.execute("UPDATE usuarios SET rol = ? WHERE id = ?", (data.rol, data.usuario_id))
    db.commit()
    return {"mensaje": f"Rol actualizado a {data.rol}"}

# 2. Estructura Orgánica (ROF)
@router.get("/unidades-organicas")
def listar_unidades_organicas(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    try:
        rows = db.execute("""
            SELECT uo.id, uo.nombre, uo.sigla, 
                   COALESCE(uo.tipo_organo, 'ÓRGANOS DE LÍNEA') as tipo_organo, 
                   COALESCE(uo.sigla_padre, '') as sigla_padre, 
                   uo.titular_usuario_id, 
                   uo.titular_trabajador_id, 
                   COALESCE(uo.estado, 'ACTIVO') as estado,
                   COALESCE(t.nombre_completo, u.nombre_completo, '') as titular_nombre,
                   COALESCE(t.cargo, '') as titular_cargo,
                   COALESCE(t.correo, '') as titular_correo
            FROM unidades_organicas uo
            LEFT JOIN trabajadores t ON uo.titular_trabajador_id = t.id
            LEFT JOIN usuarios u ON uo.titular_usuario_id = u.id
            WHERE uo.estado = 'ACTIVO' OR uo.estado IS NULL
            ORDER BY uo.id ASC
        """).fetchall()
        return [dict(r) for r in rows]
    except Exception:
        rows = db.execute("""
            SELECT id, nombre, sigla, 
                   COALESCE(sigla_padre, '') as sigla_padre, 
                   titular_usuario_id, titular_trabajador_id 
            FROM unidades_organicas 
            WHERE estado = 'ACTIVO' OR estado IS NULL
            ORDER BY id ASC
        """).fetchall()
        return [dict(r) for r in rows]

@router.post("/unidades-organicas")
def crear_unidad_organica(data: UnidadOrganicaModel, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    if user["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede gestionar la estructura orgánica.")
    try:
        db.execute("""
            INSERT INTO unidades_organicas (nombre, sigla, tipo_organo, sigla_padre, titular_usuario_id, estado) 
            VALUES (?, ?, ?, ?, ?, 'ACTIVO')
        """, (
            data.nombre.strip(), 
            data.sigla.strip().upper(), 
            data.tipo_organo.strip(),
            (data.sigla_padre or "").strip().upper() or None,
            data.titular_usuario_id
        ))
        db.commit()
        return {"mensaje": "Unidad Orgánica registrada exitosamente"}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="La sigla ingresada ya existe.")

@router.put("/unidades-organicas/{unidad_id}/titular")
def asignar_titular_unidad(unidad_id: int, data: AsignarTitularModel, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    if user["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede asignar directivos y titulares de unidades.")

    t_id = data.titular_trabajador_id
    u_id = data.titular_usuario_id

    if t_id and not u_id:
        trab = db.execute("SELECT nombre_completo, correo FROM trabajadores WHERE id = ?", (t_id,)).fetchone()
        if trab:
            u_row = db.execute("""
                SELECT id FROM usuarios 
                WHERE LOWER(nombre_completo) = LOWER(?) 
                   OR LOWER(username) = LOWER(?)
                   OR LOWER(?) LIKE LOWER(username || '@%')
                LIMIT 1
            """, (trab["nombre_completo"], trab["correo"].split("@")[0] if trab["correo"] else "", trab["correo"] or "")).fetchone()
            if u_row:
                u_id = u_row["id"]

    db.execute("""
        UPDATE unidades_organicas 
        SET titular_trabajador_id = ?, titular_usuario_id = ? 
        WHERE id = ?
    """, (t_id, u_id, unidad_id))
    db.commit()
    return {"mensaje": "Titular de unidad asignado exitosamente."}

@router.put("/unidades-organicas/{unidad_id}/dependencia")
def actualizar_dependencia_rof_unidad(
    unidad_id: int, 
    data: ActualizarDependenciaROFModel, 
    user: dict = Depends(get_current_user), 
    db: sqlite3.Connection = Depends(get_db)
):
    if user["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede modificar la estructura jerárquica del ROF.")

    padre_limpio = data.sigla_padre.strip().upper() if data.sigla_padre else None

    actual = db.execute("SELECT sigla FROM unidades_organicas WHERE id = ?", (unidad_id,)).fetchone()
    if actual and padre_limpio == actual["sigla"]:
        raise HTTPException(status_code=400, detail="Una unidad no puede depender jerárquicamente de sí misma.")

    db.execute("""
        UPDATE unidades_organicas 
        SET sigla_padre = ? 
        WHERE id = ?
    """, (padre_limpio, unidad_id))
    db.commit()
    return {"mensaje": "Dependencia jerárquica ROF actualizada con éxito."}

# 3. Directorio de Trabajadores Institucionales
@router.get("/trabajadores")
def listar_trabajadores(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute("""
        SELECT id, nombres, apellidos, nombre_completo, unidad_organica, correo, 
               COALESCE(celular, '') as celular,
               COALESCE(cargo, 'Sin cargo / nivel') as cargo, 
               COALESCE(es_directivo, 0) as es_directivo, 
               COALESCE(estado, 'ACTIVO') as estado 
        FROM trabajadores 
        ORDER BY nombre_completo ASC
    """).fetchall()
    return [dict(r) for r in rows]

@router.post("/trabajadores")
def crear_trabajador(data: TrabajadorAltaModel, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    if user["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede registrar trabajadores.")
    
    nombres_limp = data.nombres.strip()
    apellidos_limp = data.apellidos.strip()
    nombre_completo = f"{apellidos_limp}, {nombres_limp}"
    
    usuario_correo = data.correo_usuario.strip().lower().replace("@imarpe.gob.pe", "")
    correo_final = f"{usuario_correo}@imarpe.gob.pe"
    celular_limp = (data.celular or "").strip()
    cargo_final = (data.cargo or "Especialista").strip()
    es_dir = int(data.es_directivo or 0)
    uo_final = data.unidad_organica.strip().upper()

    try:
        db.execute("""
            INSERT INTO trabajadores (nombres, apellidos, nombre_completo, unidad_organica, correo, celular, cargo, es_directivo, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO')
        """, (nombres_limp, apellidos_limp, nombre_completo, uo_final, correo_final, celular_limp, cargo_final, es_dir))
        trabajador_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]

        db.execute("""
            INSERT OR REPLACE INTO responsables (nombre, cargo, correo)
            VALUES (?, ?, ?)
        """, (nombre_completo, cargo_final, correo_final))

        if data.crear_acceso:
            pass_hasheada = hash_password(data.password_inicial or "imarpe123")
            rol_sist = data.rol_sistema if data.rol_sistema in ("ADMIN_TI", "OPERADOR") else "OPERADOR"
            
            u_existe = db.execute("SELECT id FROM usuarios WHERE username = ?", (usuario_correo,)).fetchone()
            if not u_existe:
                db.execute("""
                    INSERT INTO usuarios (username, password, nombre_completo, rol, estado)
                    VALUES (?, ?, ?, ?, 'ACTIVO')
                """, (usuario_correo, pass_hasheada, nombre_completo, rol_sist))
                nuevo_user_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
            else:
                nuevo_user_id = u_existe[0]
                db.execute("""
                    UPDATE usuarios SET nombre_completo = ?, rol = ?, estado = 'ACTIVO' WHERE id = ?
                """, (nombre_completo, rol_sist, nuevo_user_id))

            if es_dir == 1:
                db.execute("""
                    UPDATE unidades_organicas 
                    SET titular_trabajador_id = ?, titular_usuario_id = ? 
                    WHERE sigla = ?
                """, (trabajador_id, nuevo_user_id, uo_final))

        db.commit()
        return {"mensaje": "Trabajador incorporado exitosamente con identidad unificada."}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="El correo o usuario ya se encuentra registrado.")

@router.put("/trabajadores/{trabajador_id}")
def actualizar_trabajador(
    trabajador_id: int, 
    data: TrabajadorActualizarModel, 
    user: dict = Depends(get_current_user), 
    db: sqlite3.Connection = Depends(get_db)
):
    if user["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede editar trabajadores.")

    actual = db.execute("SELECT * FROM trabajadores WHERE id = ?", (trabajador_id,)).fetchone()
    if not actual:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")

    nombres_limp = data.nombres.strip()
    apellidos_limp = data.apellidos.strip()
    nuevo_nombre_completo = f"{apellidos_limp}, {nombres_limp}"
    antiguo_nombre_completo = actual["nombre_completo"]

    usuario_correo = data.correo_usuario.strip().lower().replace("@imarpe.gob.pe", "")
    correo_final = f"{usuario_correo}@imarpe.gob.pe"
    celular_limp = (data.celular or "").strip()
    antiguo_correo = actual["correo"]
    cargo_final = (data.cargo or "Sin cargo / nivel").strip()
    es_dir = int(data.es_directivo or 0)
    uo_final = data.unidad_organica.strip().upper()

    correo_ocupado = db.execute("SELECT id FROM trabajadores WHERE correo = ? AND id != ?", (correo_final, trabajador_id)).fetchone()
    if correo_ocupado:
        raise HTTPException(status_code=400, detail="El correo electrónico ya pertenece a otro trabajador.")

    db.execute("""
        UPDATE trabajadores 
        SET nombres = ?, apellidos = ?, nombre_completo = ?, unidad_organica = ?, correo = ?, celular = ?, cargo = ?, es_directivo = ?
        WHERE id = ?
    """, (nombres_limp, apellidos_limp, nuevo_nombre_completo, uo_final, correo_final, celular_limp, cargo_final, es_dir, trabajador_id))

    db.execute("""
        UPDATE responsables 
        SET nombre = ?, cargo = ?, correo = ?
        WHERE nombre = ? OR correo = ?
    """, (nuevo_nombre_completo, cargo_final, correo_final, antiguo_nombre_completo, antiguo_correo))

    u_row = db.execute("SELECT id FROM usuarios WHERE username = ? OR nombre_completo = ?", (usuario_correo, antiguo_nombre_completo)).fetchone()
    if u_row:
        db.execute("""
            UPDATE usuarios 
            SET nombre_completo = ?, username = ?
            WHERE id = ?
        """, (nuevo_nombre_completo, usuario_correo, u_row["id"]))
        user_vinculado_id = u_row["id"]
    else:
        user_vinculado_id = None

    if es_dir == 1 and user_vinculado_id:
        db.execute("""
            UPDATE unidades_organicas 
            SET titular_trabajador_id = ?, titular_usuario_id = ?
            WHERE sigla = ?
        """, (trabajador_id, user_vinculado_id, uo_final))

    db.commit()
    return {"status": "success", "mensaje": "Datos del trabajador actualizados correctamente."}

@router.api_route("/trabajadores/estado/{trabajador_id}", methods=["PUT", "POST"])
def alternar_estado_trabajador(
    trabajador_id: int, 
    user: dict = Depends(get_current_user), 
    db: sqlite3.Connection = Depends(get_db)
):
    if user["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Acceso denegado: solo Administrador TI puede cambiar estado de trabajadores.")

    actual = db.execute("SELECT estado FROM trabajadores WHERE id = ?", (trabajador_id,)).fetchone()
    if not actual:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado")
    
    nuevo_estado = "INACTIVO" if actual["estado"] == "ACTIVO" else "ACTIVO"
    db.execute("UPDATE trabajadores SET estado = ? WHERE id = ?", (nuevo_estado, trabajador_id))
    db.commit()
    return {"status": "success", "mensaje": f"Estado actualizado a {nuevo_estado}", "nuevo_estado": nuevo_estado}

# 4. Catálogo de Procesos Institucionales
@router.get("/procesos-institucionales")
def obtener_procesos_institucionales(
    incluir_inactivos: bool = False,
    db: sqlite3.Connection = Depends(get_db)
):
    if incluir_inactivos:
        filas = db.execute(
            "SELECT id, codigo, nombre, nivel, codigo_padre, estado FROM procesos_institucionales ORDER BY codigo ASC"
        ).fetchall()
    else:
        filas = db.execute(
            "SELECT id, codigo, nombre, nivel, codigo_padre, estado FROM procesos_institucionales WHERE estado = 'ACTIVO' ORDER BY codigo ASC"
        ).fetchall()
    return [dict(f) for f in filas]


@router.post("/procesos-institucionales")
def crear_proceso_institucional(
    datos: dict = Body(...),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    if user["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede gestionar el catálogo de procesos.")

    codigo = (datos.get("codigo") or "").strip().upper()
    nombre = (datos.get("nombre") or "").strip()
    nivel = int(datos.get("nivel") or 0)
    codigo_padre = (datos.get("codigo_padre") or "").strip().upper() or None

    if not codigo or not nombre:
        raise HTTPException(status_code=400, detail="El código y nombre del proceso son obligatorios.")

    existe = db.execute("SELECT id FROM procesos_institucionales WHERE codigo = ?", (codigo,)).fetchone()
    if existe:
        raise HTTPException(status_code=400, detail=f"El código de proceso {codigo} ya existe.")

    db.execute(
        "INSERT INTO procesos_institucionales (codigo, nombre, nivel, codigo_padre, estado) VALUES (?, ?, ?, ?, 'ACTIVO')",
        (codigo, nombre, nivel, codigo_padre)
    )
    db.commit()
    return {"mensaje": "Proceso institucional registrado correctamente."}


@router.put("/procesos-institucionales/{proc_id}")
def editar_proceso_institucional(
    proc_id: int,
    datos: dict = Body(...),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    if user["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede editar procesos.")

    proc_actual = db.execute("SELECT id, codigo, nombre FROM procesos_institucionales WHERE id = ?", (proc_id,)).fetchone()
    if not proc_actual:
        raise HTTPException(status_code=404, detail="Proceso no encontrado.")

    nuevo_codigo = (datos.get("codigo") or "").strip().upper()
    nuevo_nombre = (datos.get("nombre") or "").strip()
    nuevo_nivel = int(datos.get("nivel") if datos.get("nivel") is not None else 0)
    nuevo_padre = (datos.get("codigo_padre") or "").strip().upper() or None

    if not nuevo_codigo or not nuevo_nombre:
        raise HTTPException(status_code=400, detail="El código y nombre son obligatorios.")

    conflicto = db.execute(
        "SELECT id FROM procesos_institucionales WHERE codigo = ? AND id != ?",
        (nuevo_codigo, proc_id)
    ).fetchone()
    if conflicto:
        raise HTTPException(status_code=400, detail=f"Ya existe otro proceso con el código {nuevo_codigo}.")

    cod_ant = proc_actual["codigo"]
    nom_ant = proc_actual["nombre"]
    etiqueta_ant = f"{cod_ant} - {nom_ant}"

    db.execute("""
        UPDATE procesos_institucionales
        SET codigo = ?, nombre = ?, nivel = ?, codigo_padre = ?
        WHERE id = ?
    """, (nuevo_codigo, nuevo_nombre, nuevo_nivel, nuevo_padre, proc_id))

    # Si era padre de otros subprocesos y cambió de código, actualizar referencia de hijos
    if cod_ant != nuevo_codigo:
        db.execute("UPDATE procesos_institucionales SET codigo_padre = ? WHERE codigo_padre = ?", (nuevo_codigo, cod_ant))

    # Si cambió código o denominación, limpiar el proceso en proyectos que lo tenían para que lo vuelvan a seleccionar
    proyectos_afectados = 0
    if cod_ant != nuevo_codigo or nom_ant != nuevo_nombre:
        cur = db.execute("""
            UPDATE proyectos
            SET proceso_relacionado = ''
            WHERE proceso_relacionado = ?
               OR proceso_relacionado LIKE ?
        """, (etiqueta_ant, f"{cod_ant} - %"))
        proyectos_afectados = cur.rowcount

        # En las plantillas actualizamos al nuevo código y nombre para mantener la biblioteca sincronizada
        nueva_etiqueta = f"{nuevo_codigo} - {nuevo_nombre}"
        db.execute("""
            UPDATE plantillas
            SET categoria = ?
            WHERE categoria = ? OR categoria LIKE ?
        """, (nueva_etiqueta, etiqueta_ant, f"{cod_ant} - %"))

    db.commit()
    return {
        "mensaje": "Proceso institucional actualizado correctamente.",
        "proyectos_desvinculados": proyectos_afectados
    }


@router.put("/procesos-institucionales/{proc_id}/estado")
def cambiar_estado_proceso(
    proc_id: int,
    datos: dict = Body(...),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    if user["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Acceso denegado: solo Administrador TI.")

    proc_actual = db.execute("SELECT codigo, nombre FROM procesos_institucionales WHERE id = ?", (proc_id,)).fetchone()
    if not proc_actual:
        raise HTTPException(status_code=404, detail="Proceso no encontrado.")

    nuevo_estado = datos.get("estado", "ACTIVO")
    db.execute("UPDATE procesos_institucionales SET estado = ? WHERE id = ?", (nuevo_estado, proc_id))

    proyectos_afectados = 0
    if nuevo_estado != "ACTIVO":
        cod_ant = proc_actual["codigo"]
        etiqueta_ant = f"{cod_ant} - {proc_actual['nombre']}"
        cur = db.execute("""
            UPDATE proyectos
            SET proceso_codigo = '', proceso_nombre = ''
            WHERE proceso_codigo = ? OR proceso_nombre LIKE ?
        """, (cod_ant, f"%{proc_actual['nombre']}%"))
        proyectos_afectados = cur.rowcount

    db.commit()
    return {"mensaje": f"Estado actualizado a {nuevo_estado}.", "proyectos_desvinculados": proyectos_afectados}


@router.delete("/procesos-institucionales/{proc_id}")
def eliminar_proceso_institucional(
    proc_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    if user["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede eliminar procesos.")

    proc_actual = db.execute("SELECT codigo, nombre FROM procesos_institucionales WHERE id = ?", (proc_id,)).fetchone()
    if not proc_actual:
        raise HTTPException(status_code=404, detail="Proceso no encontrado.")

    cod_ant = proc_actual["codigo"]

    # Limpiar proyectos existentes donde se había seleccionado este proceso
    cur = db.execute("""
        UPDATE proyectos
        SET proceso_codigo = '', proceso_nombre = ''
        WHERE proceso_codigo = ? OR proceso_nombre LIKE ?
    """, (cod_ant, f"%{proc_actual['nombre']}%"))
    proyectos_afectados = cur.rowcount

    # Limpiar en plantillas que apuntaban al proceso eliminado
    db.execute("""
        UPDATE plantillas
        SET categoria = 'General'
        WHERE categoria LIKE ?
    """, (f"{cod_ant} - %",))

    db.execute("DELETE FROM procesos_institucionales WHERE id = ?", (proc_id,))
    db.commit()
    return {
        "mensaje": f"Proceso {cod_ant} eliminado correctamente.",
        "proyectos_desvinculados": proyectos_afectados
    }

@router.put("/procesos-institucionales/{proc_id}/estado")
def cambiar_estado_proceso(
    proc_id: int,
    datos: dict = Body(...),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    if usuario["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="No autorizado")

    proc_actual = db.execute("SELECT codigo, nombre FROM procesos_institucionales WHERE id = ?", (proc_id,)).fetchone()
    if not proc_actual:
        raise HTTPException(status_code=404, detail="Proceso no encontrado")

    nuevo_estado = datos.get("estado", "ACTIVO")
    db.execute("UPDATE procesos_institucionales SET estado = ? WHERE id = ?", (nuevo_estado, proc_id))

    proyectos_afectados = 0
    if nuevo_estado != "ACTIVO":
        cod_ant = proc_actual["codigo"]
        etiqueta_ant = f"{cod_ant} - {proc_actual['nombre']}"
        cur = db.execute("""
            UPDATE proyectos
            SET proceso_relacionado = ''
            WHERE proceso_relacionado = ? OR proceso_relacionado LIKE ?
        """, (etiqueta_ant, f"{cod_ant} - %"))
        proyectos_afectados = cur.rowcount

    db.commit()
    return {"mensaje": f"Estado actualizado a {nuevo_estado}", "proyectos_desvinculados": proyectos_afectados}


@router.delete("/procesos-institucionales/{proc_id}")
def eliminar_proceso_institucional(
    proc_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    if usuario["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede eliminar procesos")

    proc_actual = db.execute("SELECT codigo, nombre FROM procesos_institucionales WHERE id = ?", (proc_id,)).fetchone()
    if not proc_actual:
        raise HTTPException(status_code=404, detail="Proceso no encontrado")

    cod_ant = proc_actual["codigo"]
    etiqueta_ant = f"{cod_ant} - {proc_actual['nombre']}"

    # Limpiar en proyectos existentes donde se había seleccionado este proceso
    cur = db.execute("""
        UPDATE proyectos
        SET proceso_relacionado = ''
        WHERE proceso_relacionado = ? OR proceso_relacionado LIKE ?
    """, (etiqueta_ant, f"{cod_ant} - %"))
    proyectos_afectados = cur.rowcount

    # Limpiar en plantillas que apuntaban al proceso eliminado
    db.execute("""
        UPDATE plantillas
        SET categoria = 'General'
        WHERE categoria = ? OR categoria LIKE ?
    """, (etiqueta_ant, f"{cod_ant} - %"))

    db.execute("DELETE FROM procesos_institucionales WHERE id = ?", (proc_id,))
    db.commit()
    return {
        "mensaje": f"Proceso {cod_ant} eliminado correctamente",
        "proyectos_desvinculados": proyectos_afectados
    }

# 5. Calendario Laboral y Feriados Institucionales
@router.get("/feriados")
def listar_feriados(year: Optional[int] = None, db: sqlite3.Connection = Depends(get_db)):
    if year:
        rows = db.execute("""
            SELECT id, fecha, descripcion, 
                   COALESCE(descripcion, '') as motivo, 
                   COALESCE(tipo, 'Calendario') as tipo, creado_por 
            FROM feriados_institucionales 
            WHERE fecha LIKE ?
            ORDER BY fecha ASC
        """, (f"{year}-%",)).fetchall()
    else:
        rows = db.execute("""
            SELECT id, fecha, descripcion, 
                   COALESCE(descripcion, '') as motivo, 
                   COALESCE(tipo, 'Calendario') as tipo, creado_por 
            FROM feriados_institucionales 
            ORDER BY fecha ASC
        """).fetchall()
    return [dict(r) for r in rows]

@router.post("/feriados")
def agregar_feriado(data: FeriadoCrearModel, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    if user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede registrar feriados.")
    
    fecha_str = data.fecha.strip()
    motivo_str = data.motivo.strip()
    tipo_str = data.tipo.strip() if data.tipo else "Calendario"

    if not fecha_str or not motivo_str:
        raise HTTPException(status_code=400, detail="La fecha y el motivo son obligatorios.")

    try:
        db.execute("""
            INSERT INTO feriados_institucionales (fecha, descripcion, tipo, creado_por, fecha_registro)
            VALUES (?, ?, ?, ?, ?)
        """, (fecha_str, motivo_str, tipo_str, user["username"], ahora_peru_str()))
        db.commit()
        return {"mensaje": "Feriado registrado exitosamente"}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail=f"La fecha {fecha_str} ya se encuentra registrada en el calendario.")

@router.put("/feriados/{feriado_id}")
def editar_feriado(feriado_id: int, data: FeriadoEditarModel, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    if user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede modificar feriados.")
    
    actual = db.execute("SELECT id FROM feriados_institucionales WHERE id = ?", (feriado_id,)).fetchone()
    if not actual:
        raise HTTPException(status_code=404, detail="Feriado no encontrado.")

    try:
        db.execute("""
            UPDATE feriados_institucionales
            SET fecha = ?, descripcion = ?, tipo = ?
            WHERE id = ?
        """, (data.fecha.strip(), data.motivo.strip(), data.tipo.strip(), feriado_id))
        db.commit()
        return {"mensaje": "Feriado modificado exitosamente."}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Ya existe otro feriado registrado en esa fecha.")

@router.delete("/feriados/{feriado_id}")
def eliminar_feriado(feriado_id: int, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    if user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede eliminar feriados.")
    
    db.execute("DELETE FROM feriados_institucionales WHERE id = ?", (feriado_id,))
    db.commit()
    return {"mensaje": "Feriado eliminado exitosamente"}

@router.post("/feriados/proyectar-siguiente-ano")
def proyectar_feriados_siguiente_ano(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    if user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede proyectar los feriados del siguiente año.")
    
    year_actual = datetime.now(ZONA_PERU).year
    year_siguiente = year_actual + 1

    feriados_origen = db.execute("SELECT fecha, descripcion, tipo FROM feriados_institucionales WHERE fecha LIKE ?", (f"{year_actual}-%",)).fetchall()
    if not feriados_origen:
        raise HTTPException(status_code=400, detail=f"No hay feriados registrados en el año base {year_actual} para proyectar.")

    jueves_santo_sig, viernes_santo_sig = calcular_jueves_viernes_santo(year_siguiente)
    insertados = 0

    for f in feriados_origen:
        f_tipo = f["tipo"]
        f_desc = f["descripcion"]
        
        if "Jueves Santo" in f_desc:
            nueva_fecha = jueves_santo_sig.isoformat()
        elif "Viernes Santo" in f_desc:
            nueva_fecha = viernes_santo_sig.isoformat()
        else:
            partes = f["fecha"].split("-")
            nueva_fecha = f"{year_siguiente}-{partes[1]}-{partes[2]}"

        try:
            db.execute("""
                INSERT INTO feriados_institucionales (fecha, descripcion, tipo, creado_por, fecha_registro)
                VALUES (?, ?, ?, ?, ?)
            """, (nueva_fecha, f_desc, f_tipo, user["username"], ahora_peru_str()))
            insertados += 1
        except sqlite3.IntegrityError:
            pass

    db.commit()
    return {
        "mensaje": f"Se han proyectado y registrado {insertados} feriados para el año fiscal {year_siguiente}.",
        "year_proyectado": year_siguiente,
        "total_incorporados": insertados
    }

@router.post("/feriados/toggle")
def toggle_feriado_admin(data: FeriadoToggleModel, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    if user.get("rol") != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Solo el Administrador TI puede configurar el calendario de feriados.")
    
    fecha_str = data.fecha.strip()
    existente = db.execute("SELECT id FROM feriados_institucionales WHERE fecha = ?", (fecha_str,)).fetchone()
    
    if existente:
        db.execute("DELETE FROM feriados_institucionales WHERE id = ?", (existente[0],))
        db.commit()
        return {"accion": "ELIMINADO", "fecha": fecha_str, "mensaje": f"La fecha {fecha_str} fue retirada de feriados."}
    else:
        db.execute("""
            INSERT INTO feriados_institucionales (fecha, descripcion, tipo, creado_por, fecha_registro)
            VALUES (?, ?, ?, ?, ?)
        """, (fecha_str, data.descripcion.strip(), data.tipo, user["username"], ahora_peru_str()))
        db.commit()
        return {"accion": "REGISTRADO", "fecha": fecha_str, "mensaje": f"La fecha {fecha_str} fue registrada como feriado / no laborable."}

# 6. Catálogo de Responsables para WBS
@router.get("/responsables")
def listar_responsables(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute("SELECT nombre, cargo, correo FROM responsables ORDER BY nombre ASC").fetchall()
    return [dict(r) for r in rows]

@router.post("/responsables")
def crear_responsable(resp: ResponsableModel, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    db.execute("INSERT INTO responsables (nombre, cargo, correo) VALUES (?, ?, ?)",
               (resp.nombre.strip(), resp.cargo.strip(), resp.correo.strip()))
    db.commit()
    return {"mensaje": "Responsable registrado"}

@router.put("/responsables")
def actualizar_responsable(resp: ResponsableActualizarModel, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    db.execute("UPDATE responsables SET nombre = ?, cargo = ?, correo = ? WHERE nombre = ?",
               (resp.nombre_nuevo.strip(), resp.cargo.strip(), resp.correo.strip(), resp.nombre_original.strip()))
    db.commit()
    return {"mensaje": "Responsable actualizado"}

@router.delete("/responsables/{nombre}")
def eliminar_responsable(nombre: str, user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    db.execute("DELETE FROM responsables WHERE nombre = ?", (nombre,))
    db.commit()
    return {"mensaje": "Responsable eliminado"}