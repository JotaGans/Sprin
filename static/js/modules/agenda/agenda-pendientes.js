// =========================================================================
// MÓDULO DE AGENDA Y PENDIENTES PRIVADOS (IMARPE)
// =========================================================================
import { notificarToast } from "../../core/ui-dialogs.js";

let misPendientesLocales = [];
let pendienteSeleccionadoId = null;
let desplegableFinalizadosAbierto = false;

// Helper de peticiones autenticadas
async function apiPendientesFetch(url, options = {}) {
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

function formatearFechaLatinaCorta(fISO) {
  if (!fISO) return "";
  const partes = fISO.split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : fISO;
}

export async function cargarMisPendientesServidor() {
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  if (!token) return;

  const cachePend = sessionStorage.getItem("sprin_cache_pendientes");
  if (cachePend && misPendientesLocales.length === 0) {
    try {
      misPendientesLocales = JSON.parse(cachePend);
      actualizarVistasPendientes();
    } catch (e) {}
  }

  try {
    const res = await apiPendientesFetch("/pendientes");
    if (!res.ok) return;
    misPendientesLocales = await res.json();
    sessionStorage.setItem("sprin_cache_pendientes", JSON.stringify(misPendientesLocales));
    actualizarVistasPendientes();
  } catch (err) {
    console.error("Error al cargar pendientes:", err);
  }
}

export function abrirModalCrearPendiente() {
  const inpTitulo = document.getElementById("agenda-inp-titulo");
  const inpFechaLimite = document.getElementById("agenda-inp-limite");
  const inpDiasCustom = document.getElementById("agenda-inp-dias-custom");
  const contenedorOpciones = document.getElementById("agenda-contenedor-opciones-dias");

  if (inpTitulo) inpTitulo.value = "";
  if (inpDiasCustom) inpDiasCustom.value = "";
  if (contenedorOpciones) contenedorOpciones.innerHTML = "";

  const hoyISO = new Date().toISOString().split("T")[0];
  if (inpFechaLimite) {
    inpFechaLimite.min = hoyISO;
    inpFechaLimite.value = hoyISO;
  }

  recalcularPastillasRecordatorio();
  document.getElementById("modal-agenda-pendiente")?.classList.remove("hidden");
  setTimeout(() => inpTitulo?.focus(), 100);
}

export function cerrarModalCrearPendiente() {
  document.getElementById("modal-agenda-pendiente")?.classList.add("hidden");
}

export function recalcularPastillasRecordatorio() {
  const inpFechaLimite = document.getElementById("agenda-inp-limite");
  const contenedor = document.getElementById("agenda-contenedor-opciones-dias");
  const hintPlazo = document.getElementById("agenda-txt-plazo-info");
  if (!inpFechaLimite || !contenedor) return;

  contenedor.innerHTML = "";
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const fechaSel = new Date(inpFechaLimite.value + "T00:00:00");
  if (isNaN(fechaSel.getTime())) return;

  const duracionDias = Math.max(0, Math.round((fechaSel.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)));

  if (hintPlazo) {
    hintPlazo.innerText = duracionDias === 0 
      ? "(Vence hoy - las alertas preventivas previas no aplican)" 
      : `(Plazo disponible: ${duracionDias} ${duracionDias === 1 ? 'día' : 'días'})`;
  }

  const opcionesBase = [1, 3, 5, 7];
  let opcionesDisponibles = 0;

  opcionesBase.forEach(diasAntes => {
    if (diasAntes < duracionDias) {
      opcionesDisponibles++;
      contenedor.innerHTML += `
        <label class="flex items-center space-x-2 p-2 rounded-lg bg-gray-50 border border-gray-200 hover:bg-teal-50 cursor-pointer font-bold text-xs text-gray-700 transition">
          <input type="checkbox" value="${diasAntes}" class="agenda-chk-recordatorio rounded text-teal-600 focus:ring-0 cursor-pointer">
          <span>${diasAntes} ${diasAntes === 1 ? 'día antes' : 'días antes'}</span>
        </label>
      `;
    }
  });

  if (opcionesDisponibles === 0 && duracionDias > 0) {
    contenedor.innerHTML = `<p class="col-span-2 text-gray-400 italic text-[11px] text-center p-2">El plazo es de ${duracionDias} día(s). Puedes indicar un recordatorio manual abajo.</p>`;
  } else if (duracionDias === 0) {
    contenedor.innerHTML = `<p class="col-span-2 text-gray-400 italic text-[11px] text-center p-2">Para tareas del mismo día, el aviso se registrará para hoy.</p>`;
  }
}

export async function guardarPendienteDesdeModal() {
  const titulo = document.getElementById("agenda-inp-titulo")?.value.trim();
  const fechaLimite = document.getElementById("agenda-inp-limite")?.value;
  const customInp = document.getElementById("agenda-inp-dias-custom");
  const customVal = customInp ? parseInt(customInp.value) : NaN;

  if (!titulo) return alert("⚠️ Por favor describe el pendiente.");
  if (!fechaLimite) return alert("⚠️ Selecciona una fecha límite.");

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fechaSel = new Date(fechaLimite + "T00:00:00");
  const duracionDias = Math.max(0, Math.round((fechaSel.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)));

  const seleccionados = Array.from(document.querySelectorAll(".agenda-chk-recordatorio:checked")).map(cb => parseInt(cb.value));

  if (!isNaN(customVal)) {
    if (duracionDias > 0 && (customVal >= duracionDias || customVal <= 0)) {
      return alert(`⚠️ Plazo personalizado inválido:\nEl valor (${customVal} días) debe ser menor a la duración total (${duracionDias} días).`);
    }
    if (!seleccionados.includes(customVal)) seleccionados.push(customVal);
  }

  try {
    const payload = {
      titulo: titulo,
      fecha_limite: fechaLimite,
      dias_recordatorio: seleccionados.sort((a, b) => b - a)
    };
    const res = await apiPendientesFetch("/pendientes", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Error al registrar");
    cerrarModalCrearPendiente();
    await cargarMisPendientesServidor();
    notificarToast("Pendiente registrado con éxito.", "success");
  } catch (err) {
    alert(`❌ No se pudo guardar: ${err.message}`);
  }
}

// Modal de Detalle al hacer Doble Clic
export function abrirModalDetallePendiente(id) {
  const p = misPendientesLocales.find(item => item.id === id);
  if (!p) return;

  pendienteSeleccionadoId = id;
  const inpTit = document.getElementById("agenda-det-inp-titulo");
  const txtDesc = document.getElementById("agenda-det-txt-desc");
  const txtPlazo = document.getElementById("agenda-det-txt-plazo");
  const badgeEst = document.getElementById("agenda-det-badge-estado");

  if (inpTit) inpTit.value = p.titulo || "";
  if (txtDesc) txtDesc.value = p.descripcion_detallada || "";
  if (txtPlazo) txtPlazo.innerText = formatearFechaLatinaCorta(p.fecha_limite);
  
  if (badgeEst) {
    badgeEst.innerText = p.estado;
    badgeEst.className = p.estado === "Completado"
      ? "px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200"
      : "px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200";
  }

  document.getElementById("modal-detalle-pendiente")?.classList.remove("hidden");
}

export function cerrarModalDetallePendiente() {
  document.getElementById("modal-detalle-pendiente")?.classList.add("hidden");
  pendienteSeleccionadoId = null;
}

export async function guardarDetallePendienteModal() {
  if (!pendienteSeleccionadoId) return;
  const titulo = document.getElementById("agenda-det-inp-titulo")?.value.trim();
  const desc = document.getElementById("agenda-det-txt-desc")?.value.trim();

  if (!titulo) return alert("⚠️ El título no puede estar vacío.");

  try {
    const res = await apiPendientesFetch(`/pendientes/${pendienteSeleccionadoId}/detalle`, {
      method: "PUT",
      body: JSON.stringify({ titulo: titulo, descripcion_detallada: desc })
    });
    if (res.ok) {
      cerrarModalDetallePendiente();
      await cargarMisPendientesServidor();
      notificarToast("Detalle del pendiente actualizado.", "success");
    }
  } catch (e) {
    console.error(e);
  }
}

export async function alternarEstadoPendiente(id, estadoActual) {
  const nuevoEstado = estadoActual === "Completado" ? "Pendiente" : "Completado";
  try {
    const res = await apiPendientesFetch(`/pendientes/${id}/estado`, {
      method: "PUT",
      body: JSON.stringify({ estado: nuevoEstado })
    });
    if (res.ok) {
      await cargarMisPendientesServidor();
      notificarToast(nuevoEstado === "Completado" ? "Pendiente archivado en finalizados." : "Pendiente reactivado.", "info");
    }
  } catch (e) {
    console.error(e);
  }
}

export async function eliminarPendientePrivado(id) {
  if (!confirm("¿Deseas eliminar este pendiente privado?")) return;
  try {
    const res = await apiPendientesFetch(`/pendientes/${id}`, { method: "DELETE" });
    if (res.ok) {
      await cargarMisPendientesServidor();
      notificarToast("Pendiente eliminado.", "info");
    }
  } catch (e) {
    console.error(e);
  }
}

export function alternarDesplegableFinalizados() {
  desplegableFinalizadosAbierto = !desplegableFinalizadosAbierto;
  const lista = document.getElementById("hub-lista-finalizados-items");
  const flecha = document.getElementById("hub-icono-flecha-finalizados");
  if (lista) lista.classList.toggle("hidden", !desplegableFinalizadosAbierto);
  if (flecha) flecha.style.transform = desplegableFinalizadosAbierto ? "rotate(180deg)" : "rotate(0deg)";
}

// Renderizado dual (Tarjeta + Tabla)
export function actualizarVistasPendientes() {
  const activos = misPendientesLocales.filter(p => p.estado !== "Completado");
  const finalizados = misPendientesLocales.filter(p => p.estado === "Completado");

  // 1. Tarjeta Hub
  const contActivos = document.getElementById("hub-tarjeta-pendientes-lista");
  const badgeContador = document.getElementById("hub-tarjeta-pendientes-badge");
  const bloqueFin = document.getElementById("hub-bloque-finalizados");
  const cantFin = document.getElementById("hub-txt-cant-finalizados");
  const listaFin = document.getElementById("hub-lista-finalizados-items");

  if (badgeContador) badgeContador.innerText = `${activos.length} activos`;
  if (cantFin) cantFin.innerText = `(${finalizados.length})`;

  if (contActivos) {
    if (activos.length === 0) {
      contActivos.innerHTML = `
        <div class="p-4 text-center text-gray-400 text-xs italic">
          🎉 Todo al día. No tienes pendientes activos.
        </div>
      `;
    } else {
      contActivos.innerHTML = activos.map(p => `
        <div class="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100 hover:bg-teal-50/70 transition text-xs group cursor-pointer"
             ondblclick="abrirModalDetallePendiente(${p.id})"
             title="Doble clic para ver o ampliar detalles">
          <div class="flex items-center space-x-2 truncate min-w-0 pr-1">
            <input type="checkbox" onchange="alternarEstadoPendiente(${p.id}, '${p.estado}')" class="rounded text-teal-600 focus:ring-0 cursor-pointer flex-shrink-0" onclick="event.stopPropagation()">
            <span class="font-semibold text-gray-700 truncate select-none">${p.titulo}</span>
          </div>
          <div class="flex items-center space-x-1.5 flex-shrink-0 ml-1">
            <span class="text-[9.5px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200 whitespace-nowrap">
              Plazo: ${formatearFechaLatinaCorta(p.fecha_limite)}
            </span>
            <button onclick="event.stopPropagation(); eliminarPendientePrivado(${p.id})" class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-rose-600 transition text-xs cursor-pointer px-1 leading-none" title="Eliminar">✕</button>
          </div>
        </div>
      `).join("");
    }
  }

  if (bloqueFin && listaFin) {
    if (finalizados.length > 0) {
      bloqueFin.classList.remove("hidden");
      listaFin.innerHTML = finalizados.map(p => `
        <div class="flex items-center justify-between p-1.5 rounded-lg bg-gray-100/70 text-xs opacity-75 hover:opacity-100 transition group">
          <div class="flex items-center space-x-2 truncate">
            <input type="checkbox" checked onchange="alternarEstadoPendiente(${p.id}, '${p.estado}')" class="rounded text-teal-600 focus:ring-0 cursor-pointer flex-shrink-0" title="Desmarcar para reactivar">
            <span class="line-through text-gray-400 font-medium truncate">${p.titulo}</span>
          </div>
          <button onclick="eliminarPendientePrivado(${p.id})" class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-rose-600 transition text-xs cursor-pointer px-1 leading-none">✕</button>
        </div>
      `).join("");
    } else {
      bloqueFin.classList.add("hidden");
    }
  }

  // 2. Vista Tabla
  const tbodyTabla = document.getElementById("hub-tabla-pendientes-body");
  const badgeTabla = document.getElementById("hub-tabla-pendientes-badge");
  if (badgeTabla) badgeTabla.innerText = `${activos.length} activos`;

  if (tbodyTabla) {
    if (misPendientesLocales.length === 0) {
      tbodyTabla.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-gray-400 italic">No hay pendientes registrados.</td></tr>`;
    } else {
      tbodyTabla.innerHTML = misPendientesLocales.map(p => {
        const completado = p.estado === "Completado";
        return `
          <tr class="hover:bg-slate-50 transition ${completado ? 'bg-gray-50/60 opacity-60' : ''}">
            <td class="p-2.5 text-center">
              <input type="checkbox" ${completado ? 'checked' : ''} onchange="alternarEstadoPendiente(${p.id}, '${p.estado}')" class="rounded text-teal-600 focus:ring-0 cursor-pointer">
            </td>
            <td class="p-2.5 font-bold text-gray-800 ${completado ? 'line-through text-gray-400' : ''}">
              ${p.titulo}
            </td>
            <td class="p-2.5 text-center font-bold text-teal-800 whitespace-nowrap">
              ${formatearFechaLatinaCorta(p.fecha_limite)}
            </td>
            <td class="p-2.5 text-gray-500 truncate max-w-xs cursor-pointer" ondblclick="abrirModalDetallePendiente(${p.id})" title="Doble clic para editar descripción">
              ${p.descripcion_detallada ? p.descripcion_detallada : '<span class="italic text-gray-400">Sin descripción (doble clic para agregar)</span>'}
            </td>
            <td class="p-2.5 text-center whitespace-nowrap">
              <div class="flex items-center justify-center space-x-2">
                <!-- Icono Editar / Detalle -->
                <button type="button" onclick="abrirModalDetallePendiente(${p.id})" class="text-gray-400 hover:text-[#0f2a4a] transition p-1 cursor-pointer" title="Ver y editar detalles">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <!-- Icono Eliminar (Papelera) -->
                <button type="button" onclick="eliminarPendientePrivado(${p.id})" class="text-gray-400 hover:text-rose-600 transition p-1 cursor-pointer" title="Eliminar pendiente">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }
  }
}

// Sincronizar alternancia de vistas Hub (Tarjetas vs Tabla)
export function adaptarVistaHubPendientes(tipoVista) {
  const cardsWrapper = document.getElementById("hub-vista-cards-wrapper");
  const tablaWrapper = document.getElementById("hub-proyectos-tabla-contenedor");

  if (tipoVista === "table") {
    cardsWrapper?.classList.add("hidden");
    tablaWrapper?.classList.remove("hidden");
  } else {
    cardsWrapper?.classList.remove("hidden");
    tablaWrapper?.classList.add("hidden");
  }
}

// Exposición a window
window.abrirModalCrearPendiente = abrirModalCrearPendiente;
window.cerrarModalCrearPendiente = cerrarModalCrearPendiente;
window.recalcularPastillasRecordatorio = recalcularPastillasRecordatorio;
window.guardarPendienteDesdeModal = guardarPendienteDesdeModal;
window.abrirModalDetallePendiente = abrirModalDetallePendiente;
window.cerrarModalDetallePendiente = cerrarModalDetallePendiente;
window.guardarDetallePendienteModal = guardarDetallePendienteModal;
window.alternarEstadoPendiente = alternarEstadoPendiente;
window.eliminarPendientePrivado = eliminarPendientePrivado;
window.alternarDesplegableFinalizados = alternarDesplegableFinalizados;
window.cargarMisPendientesServidor = cargarMisPendientesServidor;
window.adaptarVistaHubPendientes = adaptarVistaHubPendientes;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", cargarMisPendientesServidor);
} else {
  cargarMisPendientesServidor();
}