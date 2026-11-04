from typing import Optional, List
from pydantic import BaseModel

# 1. Modelos de Autenticación y Cuentas de Usuario
class Token(BaseModel):
    access_token: str
    token_type: str
    username: str
    rol: str
    user_id: int
    nombre_completo: Optional[str] = ""
    unidad_organica: Optional[str] = ""

class UsuarioAltaModel(BaseModel):
    nombres: str
    apellidos: str
    username: str
    password: str
    rol: str

class UsuarioEstadoUpdate(BaseModel):
    usuario_id: int
    estado: str  # 'ACTIVO' | 'INACTIVO'

class UsuarioRolUpdate(BaseModel):
    usuario_id: int
    rol: str  # 'ADMIN_TI' | 'OPERADOR'

# 2. Modelos de Estructura Orgánica (ROF)
class UnidadOrganicaModel(BaseModel):
    nombre: str
    sigla: str
    tipo_organo: Optional[str] = "Órgano de Línea"
    sigla_padre: Optional[str] = None
    titular_usuario_id: Optional[int] = None

class AsignarTitularModel(BaseModel):
    titular_trabajador_id: Optional[int] = None
    titular_usuario_id: Optional[int] = None

class ActualizarDependenciaROFModel(BaseModel):
    sigla_padre: Optional[str] = None

# 3. Modelos del Directorio de Trabajadores
class TrabajadorAltaModel(BaseModel):
    nombres: str
    apellidos: str
    unidad_organica: str
    correo_usuario: str
    celular: Optional[str] = ""
    cargo: Optional[str] = "Especialista"
    es_directivo: Optional[int] = 0
    crear_acceso: Optional[bool] = True
    password_inicial: Optional[str] = "imarpe123"
    rol_sistema: Optional[str] = "OPERADOR"

class TrabajadorActualizarModel(BaseModel):
    nombres: str
    apellidos: str
    unidad_organica: str
    correo_usuario: str
    celular: Optional[str] = ""
    cargo: Optional[str] = "Sin cargo / nivel"
    es_directivo: Optional[int] = 0

# 4. Modelos de Proyectos y Programas
class ProyectoCrearModel(BaseModel):
    nombre: str
    descripcion: Optional[str] = ""
    unidad_organica: Optional[str] = ""
    duration_mode: Optional[str] = "business_days"
    unidad_tiempo: Optional[str] = "DIAS"
    horas_por_dia: Optional[int] = 8
    proceso_codigo: Optional[str] = ""
    proceso_nombre: Optional[str] = ""
    es_proceso_personalizado: Optional[int] = 0
    visibilidad: Optional[str] = "PRIVADO"

class ProyectoDescripcionUpdate(BaseModel):
    descripcion: str

class ProyectoNombreUpdate(BaseModel):
    nombre: str

class ProyectoUnidadUpdate(BaseModel):
    unidad_organica: str

class ProyectoProcesoUpdate(BaseModel):
    proceso_codigo: Optional[str] = ""
    proceso_nombre: Optional[str] = ""
    es_proceso_personalizado: Optional[int] = 0

class PermisoProyectoUpdate(BaseModel):
    usuario_id: int
    nivel: str  # 'NINGUNO' | 'LECTURA' | 'GESTOR'

# 5. Modelos de Actividades WBS y Cronograma
class ActividadModel(BaseModel):
    proyecto_id: Optional[int] = 1
    codigo: str
    descripcion: str
    responsable: Optional[str] = "No asignado"
    estado: Optional[str] = "No iniciado"
    avance: Optional[int] = 0
    fecha_inicio: Optional[str] = ""
    fecha_fin: Optional[str] = ""
    dias: Optional[int] = 1
    predecesores: Optional[str] = ""

class AsignacionResponsableModel(BaseModel):
    proyecto_id: int
    codigo: str
    responsable: str

class ReordenarActividadesModel(BaseModel):
    proyecto_id: int
    codigo_origen: Optional[str] = None
    codigo_destino: Optional[str] = None
    modo: Optional[str] = "below"  # 'above' | 'below' | 'inside'
    codigos_ordenados: Optional[List[str]] = []

# 6. Modelos de Responsables y Configuración
class ResponsableModel(BaseModel):
    nombre: str
    cargo: Optional[str] = ""
    correo: Optional[str] = ""

class ResponsableActualizarModel(BaseModel):
    nombre_original: str
    nombre_nuevo: str
    cargo: Optional[str] = ""
    correo: Optional[str] = ""

class ConfigValorModel(BaseModel):
    valor: str

# 7. Modelos de Alertas y Notificaciones por Correo
class NotificacionRequest(BaseModel):
    proyecto_id: int
    codigo_actividad: str
    destinatarios_nuevos: Optional[List[str]] = []
    dias_recordatorio: Optional[List[int]] = []

# 8. Modelos de Comentarios Colaborativos
class ComentarioCreate(BaseModel):
    proyecto_id: int
    codigo_actividad: str
    texto: str

class ComentarioUpdate(BaseModel):
    texto: str

# 9. Modelos del Catálogo Oficial de Procesos
class ProcesoItemModel(BaseModel):
    codigo: str
    nombre: str
    nivel: int
    codigo_padre: Optional[str] = None

class ProcesoEditarModel(BaseModel):
    codigo: str
    nombre: str
    nivel: int
    codigo_padre: Optional[str] = None
    estado: Optional[str] = "ACTIVO"

# 10. Modelos de Feriados y Calendario Laboral
class FeriadoToggleModel(BaseModel):
    fecha: str
    descripcion: Optional[str] = "Feriado / Día no laborable"
    tipo: Optional[str] = "Calendario"

class FeriadoCrearModel(BaseModel):
    fecha: str
    motivo: str
    tipo: Optional[str] = "Calendario"

class FeriadoEditarModel(BaseModel):
    fecha: str
    motivo: str
    tipo: str

# 11. Modelos de Biblioteca de Plantillas Maestras
class GuardarPlantillaDesdeProyectoModel(BaseModel):
    proyecto_id: int
    nombre: str
    descripcion: Optional[str] = ""
    categoria: Optional[str] = "General"

class CrearProyectoDesdePlantillaModel(BaseModel):
    plantilla_id: int
    nombre_proyecto: str
    descripcion: Optional[str] = ""
    unidad_organica: Optional[str] = ""
    fecha_inicio: str
    proceso_codigo: Optional[str] = ""
    proceso_nombre: Optional[str] = ""
    es_proceso_personalizado: Optional[int] = 0
    duration_mode: Optional[str] = "business_days"
    visibilidad: Optional[str] = "PRIVADO"

# 12. Modelos de Agenda y Pendientes Privados
class PendienteCrearModel(BaseModel):
    titulo: str
    descripcion_detallada: Optional[str] = ""
    fecha_limite: str
    dias_recordatorio: Optional[List[int]] = []

class PendienteDetalleUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion_detallada: str

class PendienteEstadoUpdate(BaseModel):
    estado: str  # 'Pendiente' | 'En proceso' | 'Completado'

# 13. Modelo de Creación Rápida por Lote (Fricción Cero)
class ActividadesLoteModel(BaseModel):
    proyecto_id: int
    lineas: List[str]
    dias_por_defecto: Optional[int] = 3
    encadenar_secuencialmente: Optional[bool] = True

    # 14. Modelo de Restauración Instantánea para Deshacer / Rehacer (Ctrl+Z / Ctrl+Y)
class RestaurarSnapshotProyectoModel(BaseModel):
    etiqueta_accion: Optional[str] = "Acción"
    operacion: Optional[str] = "DESHACER"  # 'DESHACER' | 'REHACER'
    actividades: List[ActividadModel]