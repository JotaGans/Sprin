import sqlite3
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from app.database.connection import get_db
from app.core.security import verify_password, create_access_token
from app.models.schemas import Token

router = APIRouter(tags=["Autenticación"])

# 1. Endpoint de Inicio de Sesión y Generación de Token JWT
@router.post("/token", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: sqlite3.Connection = Depends(get_db)):
    user = db.execute("""
        SELECT u.id, u.username, u.password, u.nombre_completo, u.rol, u.estado,
               COALESCE(t.unidad_organica, '') as unidad_organica
        FROM usuarios u
        LEFT JOIN trabajadores t ON (
            u.nombre_completo = t.nombre_completo 
            OR t.correo LIKE u.username || '@%'
            OR u.username = t.correo
        )
        WHERE u.username = ?
    """, (form_data.username,)).fetchone()

    if not user or not verify_password(user["password"], form_data.password):
        raise HTTPException(status_code=400, detail="Usuario o contraseña incorrectos")
    if user["estado"] != "ACTIVO":
        raise HTTPException(status_code=403, detail="Cuenta inactiva. Contacte al Administrador TI.")

    token = create_access_token(data={"sub": user["username"], "rol": user["rol"], "id": user["id"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user["username"],
        "rol": user["rol"],
        "user_id": user["id"],
        "nombre_completo": user["nombre_completo"] or user["username"],
        "unidad_organica": user["unidad_organica"] or ""
    }