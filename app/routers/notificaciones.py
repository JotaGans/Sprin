import sqlite3
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from app.database.connection import get_db
from app.core.security import get_current_user
from app.core.config import ahora_peru_str, ZONA_PERU
from app.models.schemas import NotificacionRequest

router = APIRouter(tags=["Notificaciones"])

# 1. Programación de Alertas Preventivas y Notificación de Asignación
@router.post("/notificaciones/asignacion")
def programar_notificacion_asignacion(
    data: NotificacionRequest, 
    user: dict = Depends(get_current_user), 
    db: sqlite3.Connection = Depends(get_db)
):
    try:
        cod_limpio = str(data.codigo_actividad).strip().rstrip(".")
        act = db.execute("""
            SELECT * FROM actividades 
            WHERE (proyecto_id = ? OR proyecto_id = ?) 
              AND (codigo = ? OR codigo = ?)
        """, (int(data.proyecto_id), str(data.proyecto_id), cod_limpio, f"{cod_limpio}.")).fetchone()

        resp_str = act["responsable"] if act and act["responsable"] else ""

        # Parsear la fecha de fin real de la actividad (formato DD/MM/YYYY)
        dt_fin_actividad = datetime.now(ZONA_PERU).date()
        if act and act["fecha_fin"]:
            try:
                p_fin = str(act["fecha_fin"]).strip().split("/")
                if len(p_fin) == 3:
                    dt_fin_actividad = datetime(int(p_fin[2]), int(p_fin[1]), int(p_fin[0])).date()
            except Exception:
                pass

        if data.destinatarios_nuevos and len(data.destinatarios_nuevos) > 0:
            nombres_a_notificar = [str(n).strip() for n in data.destinatarios_nuevos if str(n).strip()]
        else:
            nombres_a_notificar = [r.strip() for r in resp_str.split(";") if r.strip() and r.strip() != "No asignado"]

        registros_creados = 0
        fecha_hoy_obj = datetime.now(ZONA_PERU).date()
        fecha_hoy = fecha_hoy_obj.strftime("%Y-%m-%d")
        fecha_hora_ahora = ahora_peru_str()

        for nombre in nombres_a_notificar:
            r_info = db.execute("SELECT correo FROM trabajadores WHERE nombre_completo = ? UNION SELECT correo FROM responsables WHERE nombre = ? LIMIT 1", (nombre, nombre)).fetchone()
            correo = r_info["correo"] if r_info and r_info["correo"] else f"{nombre.lower().replace(' ', '.')}@imarpe.gob.pe"

            # Alerta de asignación inmediata
            db.execute("""
                INSERT INTO alertas_notificaciones 
                (proyecto_id, codigo_actividad, destinatario_nombre, destinatario_correo, tipo_alerta, dias_antes, fecha_programada, estado, fecha_envio)
                VALUES (?, ?, ?, ?, 'ASIGNACION_INICIAL', 0, ?, 'ENVIADO', ?)
            """, (int(data.proyecto_id), cod_limpio, nombre, correo, fecha_hoy, fecha_hora_ahora))

            # Limpiar recordatorios preventivos previos para no duplicar si se reprograma
            db.execute("""
                DELETE FROM alertas_notificaciones 
                WHERE proyecto_id = ? AND codigo_actividad = ? AND destinatario_nombre = ? 
                  AND tipo_alerta = 'RECORDATORIO_PREVENTIVO' AND estado = 'PROGRAMADO'
            """, (int(data.proyecto_id), cod_limpio, nombre))

            # Calcular fecha exacta de disparo: Fecha Fin - X días
            for d in (data.dias_recordatorio or []):
                dias_ant = int(d)
                dt_disparo = max(fecha_hoy_obj, dt_fin_actividad - timedelta(days=dias_ant))
                fecha_prog_str = dt_disparo.strftime("%Y-%m-%d")

                db.execute("""
                    INSERT INTO alertas_notificaciones 
                    (proyecto_id, codigo_actividad, destinatario_nombre, destinatario_correo, tipo_alerta, dias_antes, fecha_programada, estado)
                    VALUES (?, ?, ?, ?, 'RECORDATORIO_PREVENTIVO', ?, ?, 'PROGRAMADO')
                """, (int(data.proyecto_id), cod_limpio, nombre, correo, dias_ant, fecha_prog_str))

            registros_creados += 1

        db.execute("""
            INSERT INTO historial (proyecto_id, timestamp, usuario, accion, detalle)
            VALUES (?, ?, ?, 'Notificación Correo', ?)
        """, (int(data.proyecto_id), fecha_hora_ahora, user["username"], f"Notificación y alertas programadas para: [{', '.join(nombres_a_notificar)}] en [{cod_limpio}]"))

        db.commit()
        return {
            "status": "success",
            "mensaje": f"Notificaciones procesadas para {registros_creados} responsable(s).",
            "destinatarios": nombres_a_notificar
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error en servidor: {str(e)}")

        # 2. Motor Despachador Omnicanal (Correo Institucional SMTP + WhatsApp API) para Intranet IMARPE
@router.post("/notificaciones/despachar-hoy")
def despachar_alertas_programadas_hoy(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    import os
    import smtplib
    from email.message import EmailMessage
    import urllib.request
    import json

    hoy_str = datetime.now(ZONA_PERU).strftime("%Y-%m-%d")
    ahora_str = ahora_peru_str()

    pendientes = db.execute("""
        SELECT a.id, a.proyecto_id, a.codigo_actividad, a.destinatario_nombre, 
               a.destinatario_correo, a.tipo_alerta, a.dias_antes, a.fecha_programada,
               COALESCE(t.celular, '') as celular
        FROM alertas_notificaciones a
        LEFT JOIN trabajadores t ON a.destinatario_nombre = t.nombre_completo
        WHERE a.estado = 'PROGRAMADO' AND a.fecha_programada <= ?
    """, (hoy_str,)).fetchall()

    smtp_host = os.getenv("IMARPE_SMTP_HOST", "")
    smtp_port = int(os.getenv("IMARPE_SMTP_PORT", "587"))
    smtp_user = os.getenv("IMARPE_SMTP_USER", "")
    smtp_pass = os.getenv("IMARPE_SMTP_PASS", "")
    whatsapp_webhook = os.getenv("IMARPE_WHATSAPP_WEBHOOK_URL", "")
    whatsapp_token = os.getenv("IMARPE_WHATSAPP_TOKEN", "")

    enviados = 0
    omitidos_cumplidos = 0

    for al in pendientes:
        al_id = al["id"]
        p_id = al["proyecto_id"]
        cod = al["codigo_actividad"]

        # Verificar si la actividad o pendiente ya fue completado al 100% para no enviar spam
        if p_id == 0 and cod.startswith("PEND-"):
            pend_id = int(cod.replace("PEND-", ""))
            row_p = db.execute("SELECT titulo, fecha_limite, estado FROM pendientes_personales WHERE id = ?", (pend_id,)).fetchone()
            if not row_p or row_p["estado"] == "Completado":
                db.execute("UPDATE alertas_notificaciones SET estado = 'OMITIDO_YA_EJECUTADO' WHERE id = ?", (al_id,))
                omitidos_cumplidos += 1
                continue
            titulo_item = f"[Pendiente Personal] {row_p['titulo']}"
            plazo_item = row_p["fecha_limite"]
        else:
            row_a = db.execute("""
                SELECT a.descripcion, a.fecha_fin, a.estado, p.nombre as proy_nombre 
                FROM actividades a 
                JOIN proyectos p ON a.proyecto_id = p.id 
                WHERE a.proyecto_id = ? AND a.codigo = ?
            """, (p_id, cod)).fetchone()
            if not row_a or row_a["estado"] == "Ejecutado":
                db.execute("UPDATE alertas_notificaciones SET estado = 'OMITIDO_YA_EJECUTADO' WHERE id = ?", (al_id,))
                omitidos_cumplidos += 1
                continue
            titulo_item = f"[{row_a['proy_nombre']}] Actividad {cod}: {row_a['descripcion']}"
            plazo_item = row_a["fecha_fin"]

        mensaje_texto = (
            f"🔔 *RECORDATORIO SPRIN - IMARPE*\n"
            f"Estimado(a) {al['destinatario_nombre']},\n\n"
            f"Le recordamos que faltan *{al['dias_antes']} día(s)* para el vencimiento de:\n"
            f"📌 *{titulo_item}*\n"
            f"📅 Fecha límite: *{plazo_item}*\n\n"
            f"Por favor registre su avance en el sistema SPRIN IMARPE."
        )

        # 1. Envío por Correo Institucional (si OTI configuró IMARPE_SMTP_HOST)
        if smtp_host and al["destinatario_correo"]:
            try:
                msg = EmailMessage()
                msg["Subject"] = f"Recordatorio de Plazo ({al['dias_antes']}d): {titulo_item}"
                msg["From"] = smtp_user or "sprin@imarpe.gob.pe"
                msg["To"] = al["destinatario_correo"]
                msg.set_content(mensaje_texto.replace("*", ""))
                with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                    if smtp_user and smtp_pass:
                        server.starttls()
                        server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
            except Exception:
                pass

        # 2. Envío por WhatsApp API (si OTI configuró IMARPE_WHATSAPP_WEBHOOK_URL y el trabajador tiene celular)
        if whatsapp_webhook and al["celular"]:
            try:
                num_limpio = "".join(c for c in str(al["celular"]) if c.isdigit())
                if len(num_limpio) == 9:
                    num_limpio = "51" + num_limpio
                payload_wa = json.dumps({"phone": num_limpio, "message": mensaje_texto}).encode("utf-8")
                req = urllib.request.Request(
                    whatsapp_webhook,
                    data=payload_wa,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {whatsapp_token}"
                    },
                    method="POST"
                )
                urllib.request.urlopen(req, timeout=8)
            except Exception:
                pass

        db.execute("UPDATE alertas_notificaciones SET estado = 'ENVIADO', fecha_envio = ? WHERE id = ?", (ahora_str, al_id))
        enviados += 1

    db.commit()
    return {
        "status": "success",
        "fecha_corte": hoy_str,
        "alertas_despachadas": enviados,
        "omitidas_por_cumplimiento": omitidos_cumplidos
    }