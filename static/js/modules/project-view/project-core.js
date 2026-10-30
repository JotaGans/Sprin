import { state } from "../../core/state.js";
import { apiFetch } from "../../core/api.js";
import { notificarToast } from "../../core/ui-dialogs.js";
import { actualizarDisplaysUsuario } from "../auth.js";
import { cargarHubProyectos } from "../hub.js";
import { construirCalendarioAnual, autoAjustarSemanaInicio, renderizarCabeceraGantt } from "./project-gantt.js";
import { renderizarTabla, recalcularJerarquiaWBS, poblarFiltroResponsablesDinamico } from "./project-wbs.js";
import { cargarComentariosProyecto, abrirModalGuardarPlantilla, abrirModalImportarPlantillaProyecto } from "./project-aux.js";

export async function ingresarAlProyecto(id, nombre, esGestor) {
  if (typeof window.mostrarSplashSprin === "function") {
    window.mostrarSplashSprin();
  }

  try {
    state.proyectoActualId = id;
    state.proyectoEsGestor = Boolean(esGestor === 1 || esGestor === true || state.currentUser?.rol === "ADMIN_TI");

    const datosProyActivo = JSON.stringify({
      id: id,
      nombre: nombre,
      esGestor: state.proyectoEsGestor
    });
    localStorage.setItem("sprin_proyecto_activo", datosProyActivo);
    sessionStorage.setItem("sprin_proyecto_activo", datosProyActivo);

    // Limpiar rastro y filtros del proyecto anterior de forma segura
    state.actividadesGlobal = [];
    state.comentariosGlobal = [];
    state.codigoFilaSeleccionada = null;
    state.nivelMaxVisible = 4;
    if (state.colapsadosSet && typeof state.colapsadosSet.clear === "function") {
      state.colapsadosSet.clear();
    } else {
      state.colapsadosSet = new Set();
    }

    const selNiv = document.getElementById("sel-filtro-nivel");
    if (selNiv) selNiv.value = "4";
    const selCol = document.getElementById("filtro-responsable-select");
    if (selCol) selCol.value = "";
    const inpBus = document.getElementById("filtro-busqueda");
    if (inpBus) inpBus.value = "";
    if (typeof window.actualizarAparienciaBotonesFiltro === "function") {
      try { window.actualizarAparienciaBotonesFiltro(); } catch (e) {}
    }
    const badgeFil = document.getElementById("badge-filtro-activo");
    if (badgeFil) {
      badgeFil.classList.add("hidden");
      badgeFil.classList.remove("flex");
    }
    const tbodyLimpiar = document.getElementById("lista-actividades");
    if (tbodyLimpiar) tbodyLimpiar.innerHTML = "";

    const proyData = (state.proyectosUsuarioGlobal || []).find(p => p.id === id);
    state.proyectoModoDuracion = proyData?.duration_mode || "business_days";

    const procesoActual = (proyData?.proceso_relacionado || proyData?.proceso_nombre || proyData?.proceso_codigo || "").trim();
    renderizarIndicadorProcesoProyecto(procesoActual);

    const thDias = document.getElementById("th-dias");
    if (thDias) {
      thDias.innerText = (state.proyectoModoDuracion === "hours") ? "Horas" : "Días";
    }

    const txtNombre = document.getElementById("txt-nombre-proyecto");
    if (txtNombre) {
      txtNombre.value = (nombre || "").substring(0, 80);
      txtNombre.disabled = !state.proyectoEsGestor;
      txtNombre.title = state.proyectoEsGestor ? "Modificar el texto (máximo 80 caracteres)" : (nombre || "");
    }

    const badge = document.getElementById("badge-rol-gantt");
    if (badge) {
      if (state.proyectoEsGestor) {
        badge.className = "bg-amber-100 text-amber-900 border border-amber-300 text-[10.5px] font-black uppercase px-2 sm:px-2.5 rounded shadow-2xs flex items-center justify-center whitespace-nowrap cursor-help";
        badge.innerHTML = `<span class="text-xs leading-none">👑</span><span class="hidden md:inline leading-none tracking-tight ml-1">GESTOR DE PROYECTO</span>`;
        badge.title = "Rol: Gestor de Proyecto";
      } else {
        badge.className = "bg-blue-100 text-blue-900 border border-blue-300 text-[10.5px] font-black uppercase px-2 sm:px-2.5 rounded shadow-2xs flex items-center justify-center whitespace-nowrap cursor-help";
        badge.innerHTML = `<span class="text-xs leading-none">👤</span><span class="hidden md:inline leading-none tracking-tight ml-1">RESPONSABLE ASIGNADO</span>`;
        badge.title = "Rol: Responsable Asignado";
      }
    }

    actualizarDisplaysUsuario();

    const btnNuevaAct = document.getElementById("btn-nueva-act-gantt");
    const btnHist = document.getElementById("btn-historial-gantt");
    const btnPers = document.getElementById("btn-personal-gantt");
    const btnPlantilla = document.getElementById("btn-accion-plantilla-dinamico");

    if (!state.proyectoEsGestor) {
      if (btnNuevaAct) btnNuevaAct.classList.add("hidden");
      if (btnHist) btnHist.classList.add("hidden");
      if (btnPers) btnPers.classList.add("hidden");
      if (btnPlantilla) btnPlantilla.classList.add("hidden");
    } else {
      if (btnNuevaAct) btnNuevaAct.classList.remove("hidden");
      if (btnHist) btnHist.classList.remove("hidden");
      if (btnPers) btnPers.classList.remove("hidden");
      if (btnPlantilla) btnPlantilla.classList.remove("hidden");
    }

    // Mostrar contenedores de proyecto antes de medir anchos y renderizar
    document.getElementById("view-hub")?.classList.add("hidden");
    document.getElementById("view-dashboard")?.classList.remove("hidden");
    document.getElementById("bloque-superior-gantt")?.classList.remove("hidden");

    aplicarVisibilidadColumnas();
    const vistaGuardada = localStorage.getItem("sprin_vista_proyecto") || "split";
    if (typeof window.cambiarVistaProyecto === "function") {
      window.cambiarVistaProyecto(vistaGuardada);
    }
    inicializarRedimensionDescripcion();
    await sincronizarDatosProyecto(id);

    if (txtNombre && typeof window.ajustarAlturaTituloProyecto === "function") {
      window.ajustarAlturaTituloProyecto(txtNombre);
    }
  } catch (err) {
    console.error("Error al ingresar al proyecto:", err);
    document.getElementById("view-hub")?.classList.add("hidden");
    document.getElementById("view-dashboard")?.classList.remove("hidden");
    document.getElementById("bloque-superior-gantt")?.classList.remove("hidden");
  } finally {
    if (typeof window.ocultarSplashSprin === "function") {
      window.ocultarSplashSprin();
    }
  }
}

export async function volverAlHub() {
  if (typeof window.mostrarSplashSprin === "function") {
    window.mostrarSplashSprin();
  }

  try {
    localStorage.removeItem("sprin_proyecto_activo");
    sessionStorage.removeItem("sprin_proyecto_activo");
    state.proyectoActualId = null;
    state.actividadesGlobal = [];
    const tbodyLimpiar = document.getElementById("lista-actividades");
    if (tbodyLimpiar) tbodyLimpiar.innerHTML = "";

    await cargarHubProyectos();

    document.getElementById("view-dashboard")?.classList.add("hidden");
    document.getElementById("bloque-superior-gantt")?.classList.add("hidden");
    document.getElementById("view-hub")?.classList.remove("hidden");
  } catch (err) {
    console.error("Error al volver al Hub:", err);
    document.getElementById("view-dashboard")?.classList.add("hidden");
    document.getElementById("bloque-superior-gantt")?.classList.add("hidden");
    document.getElementById("view-hub")?.classList.remove("hidden");
  } finally {
    if (typeof window.ocultarSplashSprin === "function") {
      window.ocultarSplashSprin();
    }
  }
}

export async function sincronizarDatosProyecto(id) {
  try {
    
    // Lanzar todas las consultas en paralelo para máxima velocidad
    const promesas = [
      apiFetch(`/proyectos/${id}/actividades`),
      apiFetch(`/proyectos/${id}/comentarios`).catch(() => null)
    ];

    if (!state.catalogoFeriadosGlobal || state.catalogoFeriadosGlobal.length === 0) {
      promesas.push(apiFetch(`/feriados`).catch(() => null));
    } else {
      promesas.push(Promise.resolve(null));
    }

    if (!state.responsablesGlobal || state.responsablesGlobal.length === 0) {
      promesas.push(apiFetch(`/responsables`).catch(() => null));
    } else {
      promesas.push(Promise.resolve(null));
    }

    const [resActs, resComs, resFer, resResp] = await Promise.all(promesas);

    if (resFer && resFer.ok) state.catalogoFeriadosGlobal = await resFer.json();
    if (resResp && resResp.ok) state.responsablesGlobal = await resResp.json();
    if (resComs && resComs.ok) state.comentariosGlobal = await resComs.json();

    if (resActs && resActs.ok) {
      const freshActs = await resActs.json();
      state.actividadesGlobal = (freshActs || []).sort((a, b) => {
        const pA = String(a.codigo || "").replace(/\.+$/, "").split(".");
        const pB = String(b.codigo || "").replace(/\.+$/, "").split(".");
        const mLen = Math.max(pA.length, pB.length);
        for (let i = 0; i < mLen; i++) {
          if (pA[i] === undefined) return -1;
          if (pB[i] === undefined) return 1;
          const nA = parseInt(pA[i], 10), nB = parseInt(pB[i], 10);
          if (!isNaN(nA) && !isNaN(nB)) { if (nA !== nB) return nA - nB; }
          else { const comp = String(pA[i]).localeCompare(String(pB[i])); if (comp !== 0) return comp; }
        }
        return 0;
      });

      localStorage.setItem(`cache_acts_proj_${id}`, JSON.stringify(state.actividadesGlobal));
      construirCalendarioAnual();
      autoAjustarSemanaInicio();
      poblarFiltroResponsablesDinamico();
      renderizarCabeceraGantt();
      renderizarTabla();
      actualizarKPIs();
      actualizarBotonPlantillaDinamico();
    }
  } catch (err) {
    console.error("Error sincronizando actividades:", err);
    renderizarTabla();
  }
}

export function actualizarKPIs() {
  if (!state.actividadesGlobal || state.actividadesGlobal.length === 0) {
    document.getElementById("kpi-avance").innerText = "0%";
    document.getElementById("kpi-ejecutado").innerText = "0";
    document.getElementById("kpi-proceso").innerText = "0";
    document.getElementById("kpi-pendiente").innerText = "0";
    return;
  }

  recalcularJerarquiaWBS();

  const selNivel = parseInt(document.getElementById("sel-filtro-nivel")?.value || "4");
  const txtBusq = (document.getElementById("filtro-busqueda")?.value || "").toLowerCase().trim();
  const selResp = document.getElementById("filtro-responsable-select")?.value || "";

  const hayFiltroNivel = (selNivel !== 4);
  const hayFiltroTexto = (txtBusq !== "");
  const hayFiltroResp = (selResp !== "");
  const hayFiltroActivo = (hayFiltroNivel || hayFiltroTexto || hayFiltroResp);

  const badgeFiltro = document.getElementById("badge-filtro-activo");
  const badgeTexto = document.getElementById("badge-filtro-texto");

  if (badgeFiltro && badgeTexto) {
    if (hayFiltroActivo) {
      const criterios = [];
      if (hayFiltroNivel) criterios.push(`Nivel ${selNivel}`);
      if (hayFiltroResp) {
        const nomCorto = selResp.includes(",") ? selResp.split(",")[0].trim() : selResp.split(" ")[0];
        criterios.push(`👤 ${nomCorto}`);
      }
      if (hayFiltroTexto) criterios.push(`"${txtBusq}"`);

      badgeTexto.innerText = `Filtrado por: ${criterios.join(" + ")}`;
      badgeFiltro.classList.remove("hidden");
      badgeFiltro.classList.add("flex");
    } else {
      badgeFiltro.classList.add("hidden");
      badgeFiltro.classList.remove("flex");
    }
  }

  let muestraActividades = [];
  if (!hayFiltroActivo) {
    muestraActividades = state.actividadesGlobal.filter(a => {
      const cLimpio = String(a.codigo).replace(/\.+$/, "");
      return !state.actividadesGlobal.some(sub => {
        const subC = String(sub.codigo).replace(/\.+$/, "");
        return subC.startsWith(cLimpio + ".") && subC !== cLimpio;
      });
    });
    if (muestraActividades.length === 0) muestraActividades = state.actividadesGlobal;
  } else {
    muestraActividades = state.actividadesGlobal.filter(act => {
      const codLimpio = String(act.codigo).replace(/\.+$/, "");
      const nivel = codLimpio.split(".").length;
      if (hayFiltroNivel && nivel !== selNivel) return false;
      if (hayFiltroTexto && !act.descripcion.toLowerCase().includes(txtBusq) && !codLimpio.toLowerCase().includes(txtBusq)) return false;
      if (hayFiltroResp && !(act.responsable || "").includes(selResp)) return false;
      return true;
    });
  }

  const total = muestraActividades.length;
  let promAvance = 0;
  if (total > 0) {
    const sumaAvances = muestraActividades.reduce((acc, a) => acc + (parseInt(a.avance) || 0), 0);
    promAvance = Math.round(sumaAvances / total);
  }

  const ejecutadas = muestraActividades.filter(a => a.estado === 'Ejecutado').length;
  const enProceso = muestraActividades.filter(a => a.estado === 'En proceso').length;
  const noIniciadas = muestraActividades.filter(a => a.estado === 'No iniciado' || a.estado === 'Pendiente').length;

  document.getElementById("kpi-avance").innerText = `${promAvance}%`;
  document.getElementById("kpi-ejecutado").innerText = String(ejecutadas);
  document.getElementById("kpi-proceso").innerText = String(enProceso);
  document.getElementById("kpi-pendiente").innerText = String(noIniciadas);
}

export function limpiarTodosFiltros() {
  const selNivel = document.getElementById("sel-filtro-nivel");
  const inpBusq = document.getElementById("filtro-busqueda");
  const selResp = document.getElementById("filtro-responsable-select");

  if (selNivel) selNivel.value = "4";
  if (inpBusq) inpBusq.value = "";
  if (selResp) selResp.value = "";

  state.nivelFiltroActivo = 4;
  renderizarTabla();
  actualizarKPIs();
  notificarToast("Filtros restablecidos a la vista completa del proyecto.", "info");
}

export function obtenerClaveStorageAnchoCol() {
  const uId = state.currentUser.id || state.currentUser.username || "default";
  const pId = state.proyectoActualId || "global";
  return `ancho_col_desc_user_${uId}_proj_${pId}`;
}

export function aplicarAnchoColumnaDescripcion(anchoPx) {
  const thDesc = document.getElementById("th-descripcion");
  if (!thDesc) return;
  const px = parseInt(anchoPx);
  if (isNaN(px) || px < 140) return;

  thDesc.style.width = `${px}px`;
  thDesc.style.minWidth = `${px}px`;
  thDesc.style.maxWidth = `${px}px`;

  document.querySelectorAll("#lista-actividades td:nth-child(2)").forEach(td => {
    td.style.maxWidth = `${px}px`;
  });
}

export function inicializarRedimensionDescripcion() {
  const thDesc = document.getElementById("th-descripcion");
  const resizer = document.getElementById("resizer-col-descripcion");
  if (!thDesc || !resizer) return;

  const clave = obtenerClaveStorageAnchoCol();
  const anchoGuardado = localStorage.getItem(clave);
  if (anchoGuardado) aplicarAnchoColumnaDescripcion(anchoGuardado);
  else aplicarAnchoColumnaDescripcion(260);

  let inicioX = 0, anchoInicial = 0;

  const alMoverMouse = (e) => {
    const deltaX = e.clientX - inicioX;
    const nuevoAncho = Math.min(1400, Math.max(140, anchoInicial + deltaX));
    aplicarAnchoColumnaDescripcion(nuevoAncho);
  };

  const alSoltarMouse = () => {
    resizer.classList.remove("is-resizing");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    const anchoFinal = parseInt(thDesc.style.width);
    if (anchoFinal) localStorage.setItem(obtenerClaveStorageAnchoCol(), anchoFinal);
    window.removeEventListener("mousemove", alMoverMouse);
    window.removeEventListener("mouseup", alSoltarMouse);
  };

  resizer.onmousedown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    inicioX = e.clientX;
    anchoInicial = thDesc.offsetWidth;
    resizer.classList.add("is-resizing");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", alMoverMouse);
    window.addEventListener("mouseup", alSoltarMouse);
  };
}

export function actualizarBotonPlantillaDinamico() {
  const btn = document.getElementById("btn-accion-plantilla-dinamico");
  const ico = document.getElementById("ico-accion-plantilla");
  const txt = document.getElementById("txt-accion-plantilla");
  const btnPegar = document.getElementById("btn-pegar-lista-toolbar");
  if (!btn || !ico) return;

  if (!state.proyectoEsGestor && state.currentUser.rol !== "ADMIN_TI") {
    btn.classList.add("hidden");
    if (btnPegar) btnPegar.classList.add("hidden");
    return;
  }
  btn.classList.remove("hidden");

  const tieneActividades = state.actividadesGlobal && state.actividadesGlobal.length > 0;
  // Ocultar el botón "Pegar lista" si el proyecto ya tiene actividades para evitar sobrescrituras
  if (btnPegar) {
    btnPegar.classList.toggle("hidden", tieneActividades);
  }

  btn.className = "w-full text-left px-3.5 py-2 hover:bg-indigo-50 hover:text-indigo-700 flex items-center space-x-2.5 transition cursor-pointer border-t border-gray-100";
  if (tieneActividades) {
    ico.innerText = "📥";
    if (txt) txt.innerText = "Guardar como plantilla";
  } else {
    ico.innerText = "📂";
    if (txt) txt.innerText = "Importar plantilla";
  }
}

export function gestionarAccionPlantillaDinamica() {
  const tieneActividades = state.actividadesGlobal && state.actividadesGlobal.length > 0;
  if (tieneActividades) {
    abrirModalGuardarPlantilla();
  } else {
    abrirModalImportarPlantillaProyecto();
  }
}

// --- GESTIÓN DE COLUMNAS VISIBLES ---
export function abrirModalColumnas() {
  sincronizarCheckboxesColumnas();
  document.getElementById("modal-columnas")?.classList.remove("hidden");
}

export function cerrarModalColumnas() {
  document.getElementById("modal-columnas")?.classList.add("hidden");
}

export function sincronizarCheckboxesColumnas() {
  document.getElementById("col-chk-responsable").checked = state.visibilidadColumnas.responsable;
  document.getElementById("col-chk-estado").checked = state.visibilidadColumnas.estado;
  document.getElementById("col-chk-inicio").checked = state.visibilidadColumnas.inicio;
  document.getElementById("col-chk-fin").checked = state.visibilidadColumnas.fin;
  document.getElementById("col-chk-dias").checked = state.visibilidadColumnas.dias;
  document.getElementById("col-chk-avance").checked = state.visibilidadColumnas.avance;
  document.getElementById("col-chk-gantt").checked = state.visibilidadColumnas.gantt;

  const chkAv = document.getElementById("col-chk-avatares-gantt");
  if (chkAv) chkAv.checked = state.visibilidadColumnas.avatares_gantt !== false;

  const chkPct = document.getElementById("col-chk-porcentajes-gantt");
  if (chkPct) chkPct.checked = state.visibilidadColumnas.porcentajes_gantt !== false;
}

export function alternarColumna(colKey, estado) {
  state.visibilidadColumnas[colKey] = estado;
  localStorage.setItem("visibilidad_columnas", JSON.stringify(state.visibilidadColumnas));
  aplicarVisibilidadColumnas();
  renderizarTabla();
}

export function restablecerColumnas() {
  state.visibilidadColumnas = { responsable: true, estado: true, inicio: true, fin: true, dias: true, avance: true, gantt: true, avatares_gantt: true, porcentajes_gantt: true };
  localStorage.setItem("visibilidad_columnas", JSON.stringify(state.visibilidadColumnas));
  sincronizarCheckboxesColumnas();
  aplicarVisibilidadColumnas();
  renderizarTabla();
}

export function aplicarVisibilidadColumnas() {
  const setCol = (id, visible) => {
    const el = document.getElementById(id);
    if (el) {
      if (visible) el.classList.remove("hidden");
      else el.classList.add("hidden");
    }
  };
  setCol("th-responsable", state.visibilidadColumnas.responsable);
  setCol("th-estado", state.visibilidadColumnas.estado);
  setCol("th-inicio", state.visibilidadColumnas.inicio);
  setCol("th-fin", state.visibilidadColumnas.fin);
  setCol("th-dias", state.visibilidadColumnas.dias);
  setCol("th-avance", state.visibilidadColumnas.avance);
  setCol("th-gantt", state.visibilidadColumnas.gantt);
}

// =========================================================================
// INDICADOR Y REASIGNACIÓN DE PROCESO VIGENTE EN EL PROYECTO ACTIVO
// =========================================================================

export function renderizarIndicadorProcesoProyecto(procesoActual) {
  const btn = document.getElementById("btn-cambiar-proceso-proy");
  if (!btn) return;

  const procLimpio = (procesoActual || "").trim();
  if (procLimpio) {
    btn.className = "h-8 text-xs font-bold px-2.5 rounded-lg bg-white hover:bg-teal-50 text-teal-900 border border-gray-300 shadow-2xs transition cursor-pointer flex items-center space-x-1.5 max-w-[260px] truncate";
    btn.innerHTML = `<span>⚙️</span><span class="truncate">${procLimpio}</span><span class="text-[10px] text-teal-600 opacity-80 flex-shrink-0">✎</span>`;
    btn.title = "Proceso o subproceso institucional vinculado (clic para modificar)";
  } else {
    btn.className = "h-8 text-xs font-bold px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs animate-pulse transition cursor-pointer flex items-center space-x-1.5";
    btn.innerHTML = `<span>⚠️</span><span>Vincular proceso</span>`;
    btn.title = "Este proyecto no tiene un subproceso asignado o fue modificado en el catálogo. Clic para seleccionarlo.";
  }
}

export async function abrirSelectorProcesoProyectoActivo() {
  if (!state.proyectoEsGestor && state.currentUser?.rol !== "ADMIN_TI") {
    alert("Solo el gestor del proyecto o el Administrador TI pueden vincular el proceso institucional.");
    return;
  }

  const modal = document.getElementById("modal-reasignar-proceso-proy");
  const sel = document.getElementById("select-reasignar-proceso-proy");
  if (!modal || !sel) return;

  try {
    const res = await apiFetch("/procesos-institucionales");
    if (res.ok) {
      const procs = await res.json();
      state.catalogoProcesosGlobal = procs;
      let html = `<option value="">-- Seleccione el proceso o subproceso vigente --</option>`;
      procs.forEach(p => {
        const pref = p.nivel === 0 ? "🔷 " : (p.nivel === 1 ? "  ↳ " : "      • ");
        const val = `${p.codigo} - ${p.nombre}`;
        html += `<option value="${val.replace(/"/g, '&quot;')}">${pref}${val}</option>`;
      });
      sel.innerHTML = html;

      const proyData = (state.proyectosUsuarioGlobal || []).find(p => p.id === state.proyectoActualId);
      const valActual = (proyData?.proceso_relacionado || proyData?.proceso_nombre || proyData?.proceso_codigo || "").trim();
      if (valActual) {
        sel.value = valActual;
      }
    }
  } catch (e) {
    console.error("Error al cargar procesos para reasignación:", e);
  }

  modal.classList.remove("hidden");
}

export function cerrarSelectorProcesoProyectoActivo() {
  document.getElementById("modal-reasignar-proceso-proy")?.classList.add("hidden");
}

export async function confirmarReasignacionProcesoProyecto() {
  const sel = document.getElementById("select-reasignar-proceso-proy");
  if (!sel || !state.proyectoActualId) return;
  const nuevoProc = sel.value.trim();

  if (!nuevoProc) {
    alert("Por favor seleccione un proceso o subproceso de la lista.");
    return;
  }

  try {
    const res = await apiFetch(`/proyectos/${state.proyectoActualId}/proceso`, {
      method: "PUT",
      body: JSON.stringify({ proceso_relacionado: nuevoProc })
    });

    if (res.ok) {
      const proyData = (state.proyectosUsuarioGlobal || []).find(p => p.id === state.proyectoActualId);
      if (proyData) proyData.proceso_relacionado = nuevoProc;
      renderizarIndicadorProcesoProyecto(nuevoProc);
      cerrarSelectorProcesoProyectoActivo();
      notificarToast(`Proceso vinculado: ${nuevoProc}`, "success");
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "No se pudo actualizar el proceso del proyecto.");
    }
  } catch (e) {
    alert("Error de conexión al actualizar el proceso del proyecto.");
  }
}

// Exposición al objeto window para eventos onclick del HTML
window.renderizarIndicadorProcesoProyecto = renderizarIndicadorProcesoProyecto;
window.abrirSelectorProcesoProyectoActivo = abrirSelectorProcesoProyectoActivo;
window.cerrarSelectorProcesoProyectoActivo = cerrarSelectorProcesoProyectoActivo;
window.confirmarReasignacionProcesoProyecto = confirmarReasignacionProcesoProyecto;