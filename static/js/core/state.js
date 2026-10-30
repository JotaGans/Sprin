// =========================================================================
// ESTADO GLOBAL DE LA APLICACIÓN (CORE STATE)
// =========================================================================

export const state = {
  token: localStorage.getItem("token"),
  currentUser: JSON.parse(localStorage.getItem("currentUser") || "{}"),
  proyectoActualId: null,
  proyectoEsGestor: false,
  proyectoModoDuracion: "business_days", // 'business_days' | 'hours'

  actividadesGlobal: [],
  responsablesGlobal: [],
  nivelFiltroActivo: 4,
  vistaProyectoActiva: localStorage.getItem("sprin_vista_proyecto") || "split", // 'split' | 'lista' | 'gantt'
  filtroSoloMisActividades: false,

  modoZoom: "dias",
  zoomNivelEscala: 5,
  diasTotalesAnio: [],
  semanasTotales: [],
  semanaInicioIndex: 0,
  diaInicioIndex: 0,
  indiceSemanaHoy: -1,

  nodosColapsados: new Set(),
  actividadMultiRespActual: null,
  actividadContextualSeleccionada: null,
  codigoFilaSeleccionada: null,

  wizardPasoActual: 1,
  wizardCodigoPadre: null,
  wizardCodigoGenerado: "",

  visibilidadColumnas: JSON.parse(localStorage.getItem("visibilidad_columnas") || JSON.stringify({
    responsable: true,
    estado: true,
    inicio: true,
    fin: true,
    dias: true,
    avance: true,
    gantt: true,
    avatares_gantt: true,
    porcentajes_gantt: true
  })),

  nombresMeses: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"],
  coloresAvatar: ['#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#c0392b', '#2c3e50', '#7f8c8d'],

  // Colecciones TI y Hub
  proyectosUsuarioGlobal: [],
  vistaHubActual: localStorage.getItem("vista_hub_proyectos") || "cards",
  idsProyectosOcultos: new Set(JSON.parse(localStorage.getItem("proyectos_ocultos_ids") || "[]")),
  mostrandoOcultosHub: false,

  tabTIActiva: 'trabajadores',
  catalogoUnidadesGlobal: [],
  catalogoTrabajadoresGlobal: [],
  usuariosTIGlobal: [],
  catalogoProcesosGlobal: [],
  catalogoPlantillasGlobal: [],
  plantillaSeleccionadaId: null,
  plantillaParaImportarId: null,

  // CPM y Comentarios
  capaCpmActiva: false,
  datosCpmGlobal: { actividadesCriticas: new Set(), duracionTotal: 0 },
  comentariosGlobal: [],
  actividadComentarioActual: null,
  comentarioEnEdicionId: null,

  // Datos Personal Proyecto
  dataPersonalProyecto: { miembros: [], todos_usuarios: [], responsables_en_actividades: [] },
  usuarioSeleccionadoParaRol: null,
  listaAsignadosModal: [],
  responsablesInicialesEdicion: [],

  // Notificaciones
  actividadNotificacionActual: null,
  destinatariosNuevosNotificacion: []
};

// Exposición al ámbito de depuración y enlaces legados
window.appState = state;