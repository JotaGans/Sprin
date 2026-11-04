import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database.init_db import init_db
from app.routers import auth, proyectos, actividades, ti, cpm, notificaciones, plantillas, pendientes

# 1. Inicialización y migración automática de base de datos
init_db()

# 2. Instancia principal de la aplicación FastAPI
app = FastAPI(
    title="IMARPE Project Management Engine",
    version="9.3"
)

# 3. Configuración de CORS y Control Automático de Caché
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def evitar_cache_obsoleta_estaticos(request, call_next):
    response = await call_next(request)
    ruta = request.url.path
    if ruta == "/" or ruta.endswith((".js", ".css", ".html")):
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response

# 4. Inclusión de Routers Modulares
app.include_router(auth.router)
app.include_router(proyectos.router)
app.include_router(actividades.router)
app.include_router(ti.router)
app.include_router(cpm.router)
app.include_router(notificaciones.router)
app.include_router(plantillas.router)
app.include_router(pendientes.router)

# 5. Montaje de archivos estáticos y plantillas frontend
if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")

if os.path.exists("templates"):
    app.mount("/", StaticFiles(directory="templates", html=True), name="templates")