import { state } from "../../core/state.js";
import { apiFetch } from "../../core/api.js";
import { notificarToast, confirmModal, parsearFechaUniversal } from "../../core/ui-dialogs.js";
import {
  renderizarTabla,
  tieneHijos,
  guardarCambioDirecto,
  sumarDiasHabiles,
  esFeriadoOFinde,
  calcularFechaFinPorModalidad
} from "./project-wbs.js";
import { dibujarFlechasDependenciasGantt } from "./project-gantt.js";

// Estado temporal de edición en el modal de dependencias
let mapaEdicionPredecesoras = {};

export function toggleMenuCpm(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById("dropdown-menu-cpm");
  if (menu) menu.classList.toggle("hidden");
}

export function cerrarMenuCpm() {
  const menu = document.getElementById("dropdown-menu-cpm");
  if (menu) menu.classList.add("hidden");
}

if (typeof window !== "undefined") {
  window.addEventListener("click", () => cerrarMenuCpm());
}

// Validación matemática para impedir que el usuario cree un ciclo infinito (A -> B -> A)
export function generariaCicloDependencia(codOrigen, codDestino, mapaPreds) {
  if (codOrigen === codDestino) return true;
  const visitados = new Set();
  const pila = [codOrigen];

  while (pila.length > 0) {
    const actual = pila.pop();
    if (actual === codDestino) return true;
    if (!visitados.has(actual)) {
      visitados.add(actual);
      const predsDeActual = mapaPreds[actual] || [];
      predsDeActual.forEach(p => {
        if (!visitados.has(p)) pila.push(p);
      });
    }
  }
  return false;
}

// Calcula el siguiente día laborable posterior al fin de las predecesoras y actualiza la actividad
export function reprogramarActividadSegunPredecesoras(act, mapaActsPorCodigo) {
  const preds = (act.predecesores || "").split(",").map(s => s.trim().replace(/\.+$/, "")).filter(Boolean);
  if (preds.length === 0) return false;

  let maxFinPred = null;
  preds.forEach(pCod => {
    const predObj = mapaActsPorCodigo[pCod];
    if (predObj && predObj.fecha_fin) {
      const dtF = parsearFechaUniversal(predObj.fecha_fin);
      if (dtF && (!maxFinPred || dtF > maxFinPred)) {
        maxFinPred = dtF;
      }
    }
  });

  if (!maxFinPred) return false;

  // El inicio debe ser el primer día hábil después de maxFinPred
  const nuevoIni = new Date(maxFinPred.getFullYear(), maxFinPred.getMonth(), maxFinPred.getDate());
  nuevoIni.setDate(nuevoIni.getDate() + 1);
  while (esFeriadoOFinde(nuevoIni)) {
    nuevoIni.setDate(nuevoIni.getDate() + 1);
  }

  const nuevoFin = calcularFechaFinPorModalidad(nuevoIni, act.dias || 1, state.proyectoModoDuracion);

  const fIniStr = `${String(nuevoIni.getDate()).padStart(2, '0')}/${String(nuevoIni.getMonth() + 1).padStart(2, '0')}/${nuevoIni.getFullYear()}`;
  const fFinStr = `${String(nuevoFin.getDate()).padStart(2, '0')}/${String(nuevoFin.getMonth() + 1).padStart(2, '0')}/${nuevoFin.getFullYear()}`;

  if (act.fecha_inicio !== fIniStr || act.fecha_fin !== fFinStr) {
    act.fecha_inicio = fIniStr;
    act.fecha_fin = fFinStr;
    return true;
  }
  return false;
}

// Conectar dos actividades arrastrando directamente con el mouse en el Gantt
export async function vincularPredecesoraInteractiva(codOrigen, codDestino) {
  if (!state.proyectoEsGestor) return;
  const orig = String(codOrigen).replace(/\.+$/, "");
  const dest = String(codDestino).replace(/\.+$/, "");
  if (orig === dest) return;

  const mapaActual = {};
  (state.actividadesGlobal || []).forEach(a => {
    const c = String(a.codigo).replace(/\.+$/, "");
    mapaActual[c] = (a.predecesores || "").split(",").map(s => s.trim().replace(/\.+$/, "")).filter(Boolean);
  });

  if ((mapaActual[dest] || []).includes(orig)) {
    notificarToast(`La actividad [${dest}] ya depende de [${orig}].`, "info", 2200);
    return;
  }

  if (generariaCicloDependencia(orig, dest, mapaActual)) {
    alert(`⚠️ Dependencia circular detectada:\nNo se puede hacer que [${dest}] dependa de [${orig}] porque [${orig}] ya depende directa o indirectamente de [${dest}].`);
    return;
  }

  const actDest = state.actividadesGlobal.find(a => String(a.codigo).replace(/\.+$/, "") === dest);
  if (!actDest) return;

  const nuevasPreds = [...(mapaActual[dest] || []), orig];
  actDest.predecesores = nuevasPreds.join(", ");

  const mapaObjetos = {};
  state.actividadesGlobal.forEach(a => { mapaObjetos[String(a.codigo).replace(/\.+$/, "")] = a; });
  reprogramarActividadSegunPredecesoras(actDest, mapaObjetos);

  await guardarCambioDirecto(actDest);
  if (state.capaCpmActiva) await recalcularSilenciosoCpm();
  notificarToast(`🔗 Conectado: [${orig}] → [${dest}] (Fechas sincronizadas)`, "success", 2800);
}

export async function solicitarEliminarEnlaceGantt(e, codOrigen, codDestino) {
  e.stopPropagation();
  if (!state.proyectoEsGestor) return;

  const confirma = await confirmModal(
    `¿Desea desconectar la dependencia entre [${codOrigen}] y [${codDestino}]?`,
    "Desconectar Predecesora",
    "question"
  );
  if (!confirma) return;

  const actDest = state.actividadesGlobal.find(a => String(a.codigo).replace(/\.+$/, "") === codDestino);
  if (!actDest) return;

  const predsRestantes = (actDest.predecesores || "")
    .split(",")
    .map(s => s.trim().replace(/\.+$/, ""))
    .filter(p => p && p !== codOrigen);

  actDest.predecesores = predsRestantes.join(", ");
  await guardarCambioDirecto(actDest);
  if (state.capaCpmActiva) await recalcularSilenciosoCpm();
  notificarToast(`Dependencia [${codOrigen}] → [${codDestino}] eliminada.`, "info", 2200);
}

// --- NUEVO MODAL INTELIGENTE DE DEPENDENCIAS (CHIPS + SELECTOR + BUSCADOR) ---
export async function abrirModalDependencias(focoCodigo = null) {
  const modal = document.getElementById("modal-dependencias");
  const tbody = document.getElementById("tabla-config-dependencias-body");
  if (!tbody || !modal) return;

  mapaEdicionPredecesoras = {};
  const terminales = state.actividadesGlobal.filter(a => !tieneHijos(a.codigo));
  const lista = terminales.length > 0 ? terminales : state.actividadesGlobal;

  lista.forEach(a => {
    const c = String(a.codigo).replace(/\.+$/, "");
    mapaEdicionPredecesoras[c] = (a.predecesores || "").split(",").map(s => s.trim().replace(/\.+$/, "")).filter(Boolean);
  });

  // Inyectar barra de búsqueda y auto-encadenamiento en la parte superior del modal si no existe
  let toolbarDep = document.getElementById("toolbar-modal-dependencias-pro");
  if (!toolbarDep) {
    const infoBox = modal.querySelector(".bg-blue-50\\/80");
    if (infoBox) {
      infoBox.outerHTML = `
        <div id="toolbar-modal-dependencias-pro" class="px-5 py-3 bg-slate-100 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="flex items-center space-x-2 flex-1 min-w-[220px]">
            <input type="text" id="busq-modal-dependencias" oninput="filtrarFilasModalDependencias(this.value)" placeholder="🔍 Buscar actividad por código o nombre..." class="w-full max-w-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg font-semibold text-gray-800 outline-none focus:border-[#0f2a4a]">
          </div>
          <div class="flex items-center space-x-2">
            <label class="inline-flex items-center space-x-1.5 font-bold text-[#0f2a4a] cursor-pointer bg-white px-2.5 py-1.5 rounded-lg border border-gray-300 shadow-2xs" title="Al guardar, ajusta las fechas de inicio de las tareas sucesoras para que empiecen después de sus predecesoras">
              <input type="checkbox" id="chk-autoprogramar-fechas-cpm" checked class="rounded text-teal-600 focus:ring-0 cursor-pointer">
              <span>⚡ Auto-ajustar fechas según predecesoras</span>
            </label>
          </div>
        </div>
      `;
    }
  }

  renderizarFilasModalDependencias();
  modal.classList.remove("hidden");

  if (focoCodigo) {
    setTimeout(() => {
      const filaEl = document.getElementById(`dep-row-${String(focoCodigo).replace(/\./g, '_')}`);
      if (filaEl) {
        filaEl.scrollIntoView({ behavior: "smooth", block: "center" });
        filaEl.classList.add("bg-teal-50");
      }
    }, 80);
  }
}

export function filtrarFilasModalDependencias(termino) {
  renderizarFilasModalDependencias(termino);
}

export function renderizarFilasModalDependencias(filtro = "") {
  const tbody = document.getElementById("tabla-config-dependencias-body");
  if (!tbody) return;
  const q = (filtro || "").toLowerCase().trim();

  const terminales = state.actividadesGlobal.filter(a => !tieneHijos(a.codigo));
  const lista = terminales.length > 0 ? terminales : state.actividadesGlobal;
  const sufijoDep = (state.proyectoModoDuracion === "hours") ? "h" : "d";

  tbody.innerHTML = lista.filter(act => {
    if (!q) return true;
    return act.codigo.toLowerCase().includes(q) || act.descripcion.toLowerCase().includes(q);
  }).map((act, idx) => {
    const codLimpio = String(act.codigo).replace(/\.+$/, "");
    const predsAsignadas = mapaEdicionPredecesoras[codLimpio] || [];

    // Chips elegantes de predecesoras activas
    const chipsHTML = predsAsignadas.length > 0
      ? predsAsignadas.map(pCod => {
          const objP = lista.find(x => String(x.codigo).replace(/\.+$/, "") === pCod);
          const descP = objP ? objP.descripcion : pCod;
          return `
            <span class="inline-flex items-center space-x-1 bg-teal-50 text-teal-900 border border-teal-300 px-2 py-1 rounded-lg text-[11px] font-bold shadow-2xs" title="${descP}">
              <span class="font-mono font-black text-[#0f2a4a]">[${pCod}]</span>
              <span class="truncate max-w-[130px]">${descP}</span>
              ${state.proyectoEsGestor ? `<button type="button" onclick="quitarPredModal('${codLimpio}', '${pCod}')" class="text-teal-700 hover:text-rose-600 font-black ml-1 cursor-pointer">&times;</button>` : ''}
            </span>
          `;
        }).join("")
      : `<span class="text-[11px] text-slate-400 italic">Sin predecesoras (Inicia libremente)</span>`;

    // Selector limpio solo con actividades candidatas que no estén ya agregadas ni generen bucle
    const candidatas = lista.filter(cand => {
      const cCod = String(cand.codigo).replace(/\.+$/, "");
      return cCod !== codLimpio && !predsAsignadas.includes(cCod);
    });

    const selectAgregarHTML = state.proyectoEsGestor ? `
      <div class="mt-1.5 flex items-center space-x-1.5">
        <select onchange="agregarPredModal('${codLimpio}', this.value); this.value='';" class="text-[11px] font-semibold bg-slate-50 hover:bg-white border border-slate-300 text-slate-700 rounded-lg px-2 py-1 outline-none focus:border-[#0f2a4a] cursor-pointer max-w-[260px]">
          <option value="">+ Vincular predecesora...</option>
          ${candidatas.map(c => {
            const cCod = String(c.codigo).replace(/\.+$/, "");
            return `<option value="${cCod}">[${cCod}] ${c.descripcion.substring(0, 42)}</option>`;
          }).join("")}
        </select>
        ${idx > 0 && predsAsignadas.length === 0 ? `
          <button type="button" onclick="agregarPredModal('${codLimpio}', '${String(lista[idx - 1].codigo).replace(/\.+$/, "")}')" class="text-[10px] font-bold text-blue-700 hover:underline px-1.5 py-0.5 bg-blue-50 rounded border border-blue-200 cursor-pointer whitespace-nowrap" title="Enlazar con la tarea inmediata anterior">
            ⚡ Anterior [${String(lista[idx - 1].codigo).replace(/\.+$/, "")}]
          </button>
        ` : ''}
      </div>
    ` : "";

    return `
      <tr id="dep-row-${codLimpio.replace(/\./g, '_')}" class="hover:bg-slate-50/80 border-b border-gray-100 transition">
        <td class="p-3 font-mono font-black text-center text-[#0f2a4a] align-top">
          <span class="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">${codLimpio}</span>
        </td>
        <td class="p-3 font-bold text-gray-800 align-top">
          <div>${act.descripcion}</div>
          <div class="text-[10px] text-gray-400 font-semibold mt-0.5">📅 ${act.fecha_inicio} → ${act.fecha_fin}</div>
        </td>
        <td class="p-3 text-center font-black text-teal-800 align-top">${act.dias}${sufijoDep}</td>
        <td class="p-3 align-top">
          <div class="flex flex-wrap items-center gap-1.5">${chipsHTML}</div>
          ${selectAgregarHTML}
        </td>
      </tr>
    `;
  }).join("");
}

export function agregarPredModal(codAct, codPred) {
  if (!codPred) return;
  const actual = mapaEdicionPredecesoras[codAct] || [];
  if (actual.includes(codPred)) return;

  if (generariaCicloDependencia(codPred, codAct, mapaEdicionPredecesoras)) {
    alert(`⚠️ Dependencia circular no permitida:\nLa tarea [${codPred}] ya depende directa o indirectamente de [${codAct}].`);
    return;
  }

  actual.push(codPred);
  mapaEdicionPredecesoras[codAct] = actual;
  const busq = document.getElementById("busq-modal-dependencias")?.value || "";
  renderizarFilasModalDependencias(busq);
}

export function quitarPredModal(codAct, codPred) {
  const actual = mapaEdicionPredecesoras[codAct] || [];
  mapaEdicionPredecesoras[codAct] = actual.filter(x => x !== codPred);
  const busq = document.getElementById("busq-modal-dependencias")?.value || "";
  renderizarFilasModalDependencias(busq);
}

export function cerrarModalDependencias() {
  document.getElementById("modal-dependencias")?.classList.add("hidden");
}

export async function guardarTodasDependencias() {
  const autoAjustarFechas = document.getElementById("chk-autoprogramar-fechas-cpm")?.checked !== false;
  const mapaActs = {};
  state.actividadesGlobal.forEach(a => {
    mapaActs[String(a.codigo).replace(/\.+$/, "")] = a;
  });

  const modificadas = new Set();

  // 1. Aplicar los nuevos strings de predecesoras
  for (const act of state.actividadesGlobal) {
    const codLimpio = String(act.codigo).replace(/\.+$/, "");
    if (Object.prototype.hasOwnProperty.call(mapaEdicionPredecesoras, codLimpio)) {
      const nuevasPreds = mapaEdicionPredecesoras[codLimpio].join(", ");
      if ((act.predecesores || "") !== nuevasPreds) {
        act.predecesores = nuevasPreds;
        modificadas.add(codLimpio);
      }
    }
  }

  // 2. Si el auto-ajuste está activo, propagar las fechas en cascada respetando las predecesoras
  if (autoAjustarFechas) {
    for (let pasada = 0; pasada < state.actividadesGlobal.length; pasada++) {
      let huboDesplazamiento = false;
      for (const act of state.actividadesGlobal) {
        if (tieneHijos(act.codigo)) continue;
        const codLimpio = String(act.codigo).replace(/\.+$/, "");
        if (reprogramarActividadSegunPredecesoras(act, mapaActs)) {
          modificadas.add(codLimpio);
          huboDesplazamiento = true;
        }
      }
      if (!huboDesplazamiento) break;
    }
  }

  cerrarModalDependencias();

  if (modificadas.size > 0) {
    for (const cod of modificadas) {
      await guardarCambioDirecto(mapaActs[cod]);
    }
    notificarToast(`✓ Dependencias y cronograma actualizados (${modificadas.size} tarea(s) sincronizadas).`, "success");
    if (state.capaCpmActiva) await recalcularSilenciosoCpm();
  }
}

export async function recalcularSilenciosoCpm() {
  if (!state.proyectoActualId) return;
  try {
    const res = await apiFetch(`/ruta-critica?proyecto_id=${state.proyectoActualId}`);
    if (!res.ok) return;
    const cpm = await res.json();
    state.datosCpmGlobal.duracionTotal = cpm.duracion_proyecto_dias || 0;
    state.datosCpmGlobal.actividadesCriticas = new Set();
    if (cpm.detalles) {
      Object.values(cpm.detalles).forEach(n => {
        if (n.es_critica) state.datosCpmGlobal.actividadesCriticas.add(String(n.codigo).replace(/\.+$/, ""));
      });
    }
    actualizarBotonCpmUI(true, state.datosCpmGlobal.duracionTotal);
    renderizarTabla();
  } catch (e) {}
}

// --- CÁLCULO Y ALTERNANCIA DE RUTA CRÍTICA ---
export async function alternarCapaRutaCritica() {
  if (!state.proyectoActualId) return;

  if (state.capaCpmActiva) {
    state.capaCpmActiva = false;
    actualizarBotonCpmUI(false);
    renderizarTabla();
    notificarToast("Capa de Ruta Crítica desactivada.", "info");
    return;
  }

  const tienePredecesoras = state.actividadesGlobal.some(a => a.predecesores && String(a.predecesores).trim() !== "");
  if (!tienePredecesoras) {
    const deseaConfigurar = await confirmModal(
      "ℹ️ Para calcular la Ruta Crítica (CPM), primero conecte al menos dos actividades arrastrando entre las barras del Gantt o desde el configurador de predecesoras.\n\n¿Desea abrir el configurador ahora?",
      "Configurar Dependencias",
      "question"
    );
    if (deseaConfigurar === true) abrirModalDependencias();
    state.capaCpmActiva = false;
    actualizarBotonCpmUI(false);
    return;
  }

  state.capaCpmActiva = true;

  try {
    const res = await apiFetch(`/ruta-critica?proyecto_id=${state.proyectoActualId}`);
    if (!res.ok) throw new Error("Error calculando CPM");
    const cpm = await res.json();

    state.datosCpmGlobal.duracionTotal = cpm.duracion_proyecto_dias || 0;
    state.datosCpmGlobal.actividadesCriticas = new Set();

    if (cpm.detalles) {
      Object.values(cpm.detalles).forEach(n => {
        if (n.es_critica) state.datosCpmGlobal.actividadesCriticas.add(String(n.codigo).replace(/\.+$/, ""));
      });
    }

    actualizarBotonCpmUI(true, state.datosCpmGlobal.duracionTotal);
    renderizarTabla();
    const sufijo = (state.proyectoModoDuracion === "hours") ? "horas" : "días hábiles";
    notificarToast(`🔥 Ruta Crítica activa: ${state.datosCpmGlobal.duracionTotal} ${sufijo} de camino crítico.`, "success");
  } catch (err) {
    console.error("Error al calcular CPM:", err);
    state.capaCpmActiva = false;
    actualizarBotonCpmUI(false);
    alert("No se pudo calcular la Ruta Crítica. Verifique las dependencias del proyecto.");
  }
}

function actualizarBotonCpmUI(activo, duracion = 0) {
  const btn = document.getElementById("btn-menu-cpm");
  const txtToggle = document.getElementById("txt-menu-cpm-toggle");
  const sufijo = (state.proyectoModoDuracion === "hours") ? "h" : "d";

  if (activo) {
    if (btn) {
      btn.className = "h-[30px] px-2.5 bg-red-600 hover:bg-red-700 text-white border border-red-700 rounded-lg transition shadow-xs flex items-center gap-1 cursor-pointer text-xs font-black animate-pulse";
      btn.title = `Ruta Crítica activa (${duracion}${sufijo})`;
      btn.innerHTML = `<span>🔥</span><span>CPM (${duracion}${sufijo})</span>`;
    }
    if (txtToggle) txtToggle.textContent = `Desactivar Ruta Crítica (${duracion}${sufijo})`;
  } else {
    if (btn) {
      btn.className = "h-[30px] px-2.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg transition flex items-center gap-1 cursor-pointer text-xs font-bold";
      btn.title = "Ruta crítica y dependencias";
      btn.innerHTML = `
        <svg class="w-3.5 h-3.5 text-rose-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M13 2L3 14h7v8l10-12h-7z" />
        </svg>
        <span class="hidden xl:inline">CPM</span>
      `;
    }
    if (txtToggle) txtToggle.textContent = "Activar Ruta Crítica";
  }
}

let timerCierreCpm = null;
export function iniciarCierreMenuCpm() {
  clearTimeout(timerCierreCpm);
  timerCierreCpm = setTimeout(() => {
    document.getElementById("menu-desplegable-cpm")?.classList.add("hidden");
  }, 250);
}

export function cancelarCierreMenuCpm() {
  if (timerCierreCpm) {
    clearTimeout(timerCierreCpm);
    timerCierreCpm = null;
  }
}

export function cerrarMenuCpmInmediato() {
  cancelarCierreMenuCpm();
  document.getElementById("menu-desplegable-cpm")?.classList.add("hidden");
}

let timerCierreOpciones = null;
export function iniciarCierreMenuOpciones() {
  clearTimeout(timerCierreOpciones);
  timerCierreOpciones = setTimeout(() => {
    document.getElementById("menu-herramientas-vista")?.classList.add("hidden");
  }, 220);
}

export function cancelarCierreMenuOpciones() {
  if (timerCierreOpciones) {
    clearTimeout(timerCierreOpciones);
    timerCierreOpciones = null;
  }
}

export function cerrarMenuOpcionesInmediato() {
  cancelarCierreMenuOpciones();
  document.getElementById("menu-herramientas-vista")?.classList.add("hidden");
}

window.iniciarCierreMenuOpciones = iniciarCierreMenuOpciones;
window.cancelarCierreMenuOpciones = cancelarCierreMenuOpciones;
window.cerrarMenuOpcionesInmediato = cerrarMenuOpcionesInmediato;
window.vincularPredecesoraInteractiva = vincularPredecesoraInteractiva;
window.solicitarEliminarEnlaceGantt = solicitarEliminarEnlaceGantt;
window.filtrarFilasModalDependencias = filtrarFilasModalDependencias;
window.agregarPredModal = agregarPredModal;
window.quitarPredModal = quitarPredModal;