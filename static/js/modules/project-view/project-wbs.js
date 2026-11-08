import { state } from "../../core/state.js";
import { apiFetch } from "../../core/api.js";
import {
  notificarToast,
  confirmModal,
  formatearFechaLatina,
  formatearFechaISO,
  parsearFechaUniversal,
  abrirInputCustom
} from "../../core/ui-dialogs.js";
import { actualizarKPIs, sincronizarDatosProyecto, actualizarBotonPlantillaDinamico, obtenerClaveStorageAnchoCol, aplicarAnchoColumnaDescripcion } from "./project-core.js";
import { obtenerAvatarHTML, renderizarGanttFila } from "./project-gantt.js";
import { obtenerComentariosDeActividad, abrirModalComentarios } from "./project-aux.js";

// =========================================================================
// MOTOR MATEMÁTICO DE DÍAS HÁBILES Y FERIADOS INSTITUCIONALES
// =========================================================================

export function normalizarFechaString(str) {
  if (!str) return "";
  const s = String(str).trim().split("T")[0];
  if (s.includes("/")) {
    const p = s.split("/");
    if (p.length === 3) {
      if (p[0].length === 4) return `${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`;
      return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
    }
  }
  return s;
}

export function esFeriadoOFinde(fecha) {
  const dSem = fecha.getDay();
  if (dSem === 0 || dSem === 6) return true; // Sábado o Domingo

  if (!state.catalogoFeriadosGlobal || state.catalogoFeriadosGlobal.length === 0) {
    return false;
  }

  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  const isoFecha = `${y}-${m}-${d}`;

  return state.catalogoFeriadosGlobal.some(f => {
    const fNorm = normalizarFechaString(f.fecha);
    return fNorm === isoFecha;
  });
}

export function sumarDiasHabiles(fechaInicio, cantDiasHabiles) {
  let fecha = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), fechaInicio.getDate());
  const diasReq = Math.max(1, parseInt(cantDiasHabiles) || 1);

  // Si la fecha de inicio es inhábil (fin de semana o feriado), avanza al primer día hábil laborable
  while (esFeriadoOFinde(fecha)) {
    fecha.setDate(fecha.getDate() + 1);
  }

  let diasContados = 1;

  while (diasContados < diasReq) {
    fecha.setDate(fecha.getDate() + 1);
    if (!esFeriadoOFinde(fecha)) {
      diasContados++;
    }
  }

  return fecha;
}

export function contarDiasHabilesEntre(fechaInicio, fechaFin) {
  let dIni = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), fechaInicio.getDate());
  let dFin = new Date(fechaFin.getFullYear(), fechaFin.getMonth(), fechaFin.getDate());

  if (dIni > dFin) return 1;

  // Ajustar fecha inicio al primer día laborable si inicia en inhábil
  while (esFeriadoOFinde(dIni) && dIni < dFin) {
    dIni.setDate(dIni.getDate() + 1);
  }

  let habiles = 0;
  let cur = new Date(dIni);

  while (cur <= dFin) {
    if (!esFeriadoOFinde(cur)) {
      habiles++;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return Math.max(1, habiles);
}

export function calcularFechaFinPorModalidad(fechaInicio, duracionValor, modoDuracion) {
  if (modoDuracion === "hours") {
    const horas = parseFloat(duracionValor) || 8;
    const diasEquivHabiles = Math.max(1, Math.ceil(horas / 8));
    return sumarDiasHabiles(fechaInicio, diasEquivHabiles);
  } else {
    const dias = parseInt(duracionValor) || 1;
    return sumarDiasHabiles(fechaInicio, dias);
  }
}

window.normalizarFechaString = normalizarFechaString;
window.esFeriadoOFinde = esFeriadoOFinde;
window.sumarDiasHabiles = sumarDiasHabiles;
window.contarDiasHabilesEntre = contarDiasHabilesEntre;
window.calcularFechaFinPorModalidad = calcularFechaFinPorModalidad;

export function tieneHijos(codigo) {
  const codLimpio = String(codigo).replace(/\.+$/, "");
  return state.actividadesGlobal.some(a => {
    const aCod = String(a.codigo).replace(/\.+$/, "");
    return aCod.startsWith(codLimpio + ".") && aCod !== codLimpio;
  });
}

export function recalcularJerarquiaWBS() {
  if (!state.actividadesGlobal || state.actividadesGlobal.length === 0) return;

  state.actividadesGlobal.forEach(a => {
    a.codigo = String(a.codigo).replace(/\.+$/, "");
  });

  const niveles = [4, 3, 2, 1];
  niveles.forEach(nivelActual => {
    state.actividadesGlobal.forEach(madre => {
      const codLimpio = madre.codigo;
      const partes = codLimpio.split(".");
      if (partes.length === nivelActual) {
        const hijosDirectos = state.actividadesGlobal.filter(h => {
          const c = h.codigo;
          return c.startsWith(codLimpio + ".") && c.split(".").length === nivelActual + 1;
        });

        if (hijosDirectos.length > 0) {
          const sumaAvances = hijosDirectos.reduce((acc, h) => acc + (parseInt(h.avance) || 0), 0);
          const promAvance = Math.round(sumaAvances / hijosDirectos.length);
          madre.avance = promAvance;
          madre.estado = (promAvance === 100) ? "Ejecutado" : (promAvance > 0 ? "En proceso" : "No iniciado");

          let minIni = null, maxFin = null;
          hijosDirectos.forEach(h => {
            const dtIni = parsearFechaUniversal(h.fecha_inicio);
            const dtFin = parsearFechaUniversal(h.fecha_fin);
            if (dtIni && (!minIni || dtIni < minIni)) minIni = dtIni;
            if (dtFin && (!maxFin || dtFin > maxFin)) maxFin = dtFin;
          });

          if (minIni && maxFin) {
            const dIni = String(minIni.getDate()).padStart(2, '0');
            const mIni = String(minIni.getMonth() + 1).padStart(2, '0');
            const yIni = minIni.getFullYear();
            madre.fecha_inicio = `${dIni}/${mIni}/${yIni}`;

            const dFin = String(maxFin.getDate()).padStart(2, '0');
            const mFin = String(maxFin.getMonth() + 1).padStart(2, '0');
            const yFin = maxFin.getFullYear();
            madre.fecha_fin = `${dFin}/${mFin}/${yFin}`;

            if (state.proyectoModoDuracion === "hours") {
              // Horas de dedicación neta: Suma total de las horas de sus subtareas directas
              const totalHorasHijas = hijosDirectos.reduce((acc, h) => acc + (parseFloat(h.dias) || 0), 0);
              madre.dias = Math.max(1, totalHorasHijas);
            } else {
              // Días Hábiles: Conteo de días laborables netos (excluye fines de semana y feriados)
              const diasHabilesNetos = contarDiasHabilesEntre(minIni, maxFin);
              madre.dias = diasHabilesNetos;
            }
          }
        }
      }
    });
  });
}

export function renderizarTabla() {
  recalcularJerarquiaWBS();
  const tbody = document.getElementById("lista-actividades");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!state.actividadesGlobal || state.actividadesGlobal.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="p-8 text-center bg-slate-50/50">
          <div class="max-w-2xl mx-auto space-y-3.5">
            <p class="text-slate-500 font-bold text-xs">Este proyecto aún no tiene actividades registradas.</p>
            ${state.proyectoEsGestor ? `
              <!-- Fila 1: Input amplio de creación rápida (muestra el placeholder 100% completo) -->
              <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 max-w-xl mx-auto">
                <div class="relative flex-1 min-w-0 sm:min-w-[390px]">
                  <svg class="w-4 h-4 text-teal-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                  <input type="text" id="input-quick-add-wbs" 
                         onkeydown="if(event.key==='Enter'){event.preventDefault(); crearActividadRapidaInline();}"
                         placeholder="Escribe la primera actividad aquí y presiona Enter..." 
                         class="w-full pl-9 pr-3.5 py-2.5 text-xs font-semibold text-gray-800 bg-white border-2 border-teal-400 focus:border-[#0f2a4a] rounded-xl outline-none shadow-xs transition">
                </div>
                <button type="button" onclick="crearActividadRapidaInline()" class="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer whitespace-nowrap">
                  + Crear rápido
                </button>
              </div>

              <!-- Fila 2: Aceleradores de carga masiva y plantillas -->
              <div class="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button type="button" onclick="abrirModalPegarListaTareas()" class="px-3.5 py-2 bg-[#0f2a4a] hover:bg-[#1b4f8a] text-white text-xs font-bold rounded-xl shadow-xs transition inline-flex items-center space-x-1.5 cursor-pointer">
                  <svg class="w-3.5 h-3.5 text-teal-300 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                  </svg>
                  <span>Pegar lista de Word / Excel</span>
                </button>
                <button type="button" onclick="abrirModalImportarPlantillaProyecto()" class="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold rounded-xl transition inline-flex items-center space-x-1.5 cursor-pointer">
                  <svg class="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                  <span>Usar plantilla</span>
                </button>
              </div>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
    actualizarKPIs();
    actualizarBotonPlantillaDinamico();
    return;
  }

  const txtBusqueda = (document.getElementById("filtro-busqueda")?.value || "").toLowerCase().trim();
  const respFiltro = document.getElementById("filtro-responsable-select")?.value || "";

  state.actividadesGlobal.forEach(act => {
    act.codigo = String(act.codigo).replace(/\.+$/, "");
    const partes = act.codigo.split(".");
    const nivel = partes.length;
    const codLimpio = act.codigo;
    const esNivel1 = (nivel === 1);
    const esMadre = tieneHijos(act.codigo);

    const maxNiv = parseInt(state.nivelMaxVisible || 4);
    if (nivel > maxNiv) return;
    if (state.filtroEstadoKPI && !esMadre && act.estado !== state.filtroEstadoKPI) return;
    if (estaOcultoPorPadre(act.codigo)) return;
    if (txtBusqueda && !act.descripcion.toLowerCase().includes(txtBusqueda) && !act.codigo.toLowerCase().includes(txtBusqueda)) return;
    if (respFiltro && !(act.responsable || "").includes(respFiltro)) return;
    if (state.filtroSoloMisActividades && !esResponsableDeActividad(act)) return;

    const estaColapsado = state.nodosColapsados.has(codLimpio);
    const estaSeleccionada = (state.codigoFilaSeleccionada === act.codigo);

    const dtFinObj = parsearFechaUniversal(act.fecha_fin);
    const fechaIniVisual = formatearFechaLatina(act.fecha_inicio);
    const fechaFinVisual = formatearFechaLatina(act.fecha_fin);

    const tr = document.createElement("tr");
    tr.id = `fila-act-${act.codigo.replace(/\./g, '_')}`;
    tr.className = `${esNivel1 ? "tree-row-l1" : (nivel === 4 ? "tree-row-l4 hover:bg-gray-50" : "hover:bg-gray-50")} ${estaSeleccionada ? 'row-selected' : ''}`;
    
    tr.onclick = () => seleccionarFila(act.codigo);
    tr.oncontextmenu = (e) => abrirMenuContextual(e, act.codigo);

    if (state.proyectoEsGestor) {
      tr.onmousedown = (e) => iniciarArrastrePunteroFilaWBS(e, tr, act.codigo);
    }

    let iconoColapso = "";
    if (esMadre) {
      iconoColapso = `<button onclick="event.stopPropagation(); alternarColapsoNodo('${act.codigo}')" class="text-[10px] font-black text-[#0f2a4a] mr-1.5 w-4 h-4 rounded hover:bg-blue-200 transition cursor-pointer">${estaColapsado ? '▶' : '▼'}</button>`;
    } else {
      iconoColapso = `<span class="inline-block w-4 mr-1.5"></span>`;
    }

    const paddingLeft = (nivel - 1) * 16 + 8;
    const cod = act.codigo;
    const esMio = esResponsableDeActividad(act);
    const puedeEditarTiempos = state.proyectoEsGestor && !esMadre;
    const puedeEditarAvance = (state.proyectoEsGestor || esMio) && !esMadre;
    const enModoLista = (state.vistaProyectoActiva === "lista");

    const claseEditable = "cell-editable cursor-pointer";
    const claseBloqueada = "text-slate-500 cursor-default select-none";

    // Columna Responsables: Muestra exclusivamente los avatares circulares centrados con su tooltip completo al pasar el mouse
    const contenidoRespHTML = obtenerAvatarHTML(act.responsable);

    const tdResp = state.visibilidadColumnas.responsable 
      ? `<td class="p-2 border-b border-gray-200 text-center whitespace-nowrap ${state.proyectoEsGestor ? 'cell-editable cursor-pointer' : ''}" ondblclick="${state.proyectoEsGestor ? `editarResponsable('${cod}')` : ''}" title="${act.responsable || 'Sin asignar'}">${contenidoRespHTML}</td>` 
      : '';

    // Columna Estado: Píldoras semánticas estilo Jira (DONE / IN PROGRESS / TO DO)
    let tdEst = '';
    if (state.visibilidadColumnas.estado) {
      const pillClass = act.estado === 'Ejecutado' ? 'jira-status-done' : (act.estado === 'En proceso' ? 'jira-status-progress' : 'jira-status-todo');
      const dotColor = act.estado === 'Ejecutado' ? 'bg-emerald-600' : (act.estado === 'En proceso' ? 'bg-blue-600' : 'bg-slate-400');

      if (esMadre) {
        tdEst = `<td class="p-2.5 border-b border-gray-200 ${claseBloqueada} whitespace-nowrap" title="Autocalculado por sus subtareas">
          <span class="jira-status-pill ${pillClass}"><span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span><span>${act.estado}</span></span>
        </td>`;
      } else {
        tdEst = `<td class="p-2.5 border-b border-gray-200 ${puedeEditarAvance ? claseEditable : ''} whitespace-nowrap" ondblclick="${puedeEditarAvance ? `editarEstado('${cod}')` : ''}" title="Doble clic para cambiar estado">
          <span class="jira-status-pill ${pillClass}"><span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span><span>${act.estado}</span></span>
        </td>`;
      }
    }

    let tdIni = '';
    if (state.visibilidadColumnas.inicio) {
      if (esMadre) {
        tdIni = `<td class="p-2.5 border-b border-gray-200 hidden sm:table-cell text-xs ${claseBloqueada} whitespace-nowrap font-medium">${fechaIniVisual}</td>`;
      } else {
        tdIni = `<td class="p-2.5 border-b border-gray-200 hidden sm:table-cell text-xs ${puedeEditarTiempos ? claseEditable : ''} whitespace-nowrap font-medium text-slate-600" ondblclick="${puedeEditarTiempos ? `editarFechaInicio('${cod}')` : ''}">${fechaIniVisual}</td>`;
      }
    }

    const hoyMs = new Date().setHours(0, 0, 0, 0);
    const finMs = dtFinObj ? dtFinObj.getTime() : null;
    const estaVencida = (finMs !== null && finMs < hoyMs && act.estado !== "Ejecutado");
    const badgeVencidoHTML = estaVencida
      ? `<span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200" title="¡Plazo vencido!"><span>⚠️</span><span>${fechaFinVisual}</span></span>`
      : `<span class="inline-flex items-center space-x-1 text-xs font-semibold text-slate-700"><span class="opacity-50 text-[11px]">📅</span><span>${fechaFinVisual}</span></span>`;

    let tdFin = '';
    if (state.visibilidadColumnas.fin) {
      const esModoHoras = (state.proyectoModoDuracion === "hours");
      if (esMadre || esModoHoras) {
        tdFin = `<td class="p-2.5 border-b border-gray-200 hidden sm:table-cell text-xs ${claseBloqueada} whitespace-nowrap">${badgeVencidoHTML}</td>`;
      } else {
        tdFin = `<td class="p-2.5 border-b border-gray-200 hidden sm:table-cell text-xs ${puedeEditarTiempos ? claseEditable : ''} whitespace-nowrap" ondblclick="${puedeEditarTiempos ? `editarFechaFin('${cod}')` : ''}">${badgeVencidoHTML}</td>`;
      }
    }

    const unidadTexto = (state.proyectoModoDuracion === "hours") ? "h" : "d";
    let tdDias = '';
    if (state.visibilidadColumnas.dias) {
      tdDias = `<td class="p-2.5 border-b border-gray-200 text-center font-bold text-xs ${esMadre ? claseBloqueada : (puedeEditarTiempos ? claseEditable : '')} whitespace-nowrap" ondblclick="${!esMadre && puedeEditarTiempos ? `editarDias('${cod}')` : ''}">
        <span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200/80">${act.dias}${unidadTexto}</span>
      </td>`;
    }

    // Columna Progreso: Barra visual horizontal + porcentaje
    let tdAvance = '';
    if (state.visibilidadColumnas.avance) {
      const colorBar = act.avance === 100 ? 'bg-emerald-500' : (act.avance > 0 ? 'bg-blue-600' : 'bg-slate-300');
      tdAvance = `<td class="p-2.5 border-b border-gray-200 text-center font-bold text-xs ${esMadre ? claseBloqueada : (puedeEditarAvance ? claseEditable : '')} whitespace-nowrap" ondblclick="${!esMadre && puedeEditarAvance ? `editarAvance('${cod}')` : ''}" title="Doble clic para actualizar % de avance">
        <div class="flex items-center justify-center space-x-2">
          <div class="w-12 bg-slate-200 h-1.5 rounded-full overflow-hidden hidden sm:block">
            <div class="${colorBar} h-1.5 rounded-full transition-all duration-300" style="width: ${act.avance}%"></div>
          </div>
          <span class="text-[11px] font-black ${act.avance === 100 ? 'text-emerald-700' : 'text-slate-700'}">${act.avance}%</span>
        </div>
      </td>`;
    }

    const ganttHTML = renderizarGanttFila(act, esMadre, codLimpio);
    const tdGantt = state.visibilidadColumnas.gantt ? `<td class="p-0 border-b border-gray-200 align-middle">${ganttHTML}</td>` : '';

    const comsAct = obtenerComentariosDeActividad(cod);
    const cantComs = comsAct.length;
    const iconoComentarioHTML = cantComs > 0
      ? `<button onclick="event.stopPropagation(); abrirModalComentarios('${cod}')" class="inline-flex items-center space-x-1 bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-md text-[10px] font-black ml-1.5 transition cursor-pointer" title="Ver ${cantComs} comentario(s)"><span>💬</span><span>${cantComs}</span></button>`
      : `<button onclick="event.stopPropagation(); abrirModalComentarios('${cod}')" class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 px-1 py-0.5 text-xs ml-1.5 transition cursor-pointer" title="Agregar comentario">💬</button>`;

    const descTextoLimpio = String(act.descripcion || "").replace(/"/g, '&quot;');
    const handleDrag = state.proyectoEsGestor ? `<span class="drag-handle text-slate-400 hover:text-slate-800 cursor-grab active:cursor-grabbing mr-1.5 text-xs select-none inline-block align-middle" title="Arrastrar fila para reubicar">⠿</span>` : '';

    // Checkbox interactivo estilo Jira (en tareas operativas permite marcar 100% con 1 clic; en madres muestra icono de Fase)
    const checkTipoHTML = esMadre
      ? `<span class="inline-flex items-center justify-center w-4 h-4 rounded bg-[#0f2a4a]/10 text-[#0f2a4a] mr-1.5 flex-shrink-0 text-[10px]" title="Fase / Actividad Resumen">📁</span>`
      : `<input type="checkbox" ${act.estado === 'Ejecutado' ? 'checked' : ''} ${!puedeEditarAvance ? 'disabled' : ''} onclick="event.stopPropagation(); alternarCheckRapidoActividad('${cod}')" class="w-3.5 h-3.5 rounded text-teal-600 border-slate-300 focus:ring-0 mr-2 cursor-pointer flex-shrink-0" title="Marcar como ejecutada (100%)">`;

    tr.innerHTML = `
      <td class="p-2.5 font-mono font-bold text-xs border-b border-gray-200 whitespace-nowrap">
        <div class="inline-flex items-center">
          ${handleDrag}${iconoColapso}
          <span class="px-1.5 py-0.5 rounded text-[11px] font-black ${esNivel1 ? 'bg-[#0f2a4a] text-white' : 'bg-slate-100 text-[#0f2a4a] border border-slate-200/80'}">${cod}</span>
        </div>
      </td>
      <td class="p-2 border-b border-gray-200 ${state.proyectoEsGestor ? 'cell-editable cursor-pointer' : ''} group align-middle" style="padding-left: ${paddingLeft}px;" ondblclick="${state.proyectoEsGestor ? `editarDescripcion('${cod}')` : ''}" title="${descTextoLimpio}">
        <div class="flex items-center justify-between gap-1 w-full overflow-hidden">
          <div class="flex items-center min-w-0">
            ${checkTipoHTML}
            <span class="text-xs leading-snug break-words ${act.estado === 'Ejecutado' && !esMadre ? 'line-through text-slate-400' : (esNivel1 ? 'font-extrabold text-[#0f2a4a]' : 'font-semibold text-gray-800')} select-text" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;">${act.descripcion}</span>
          </div>
          <div class="flex-shrink-0">${iconoComentarioHTML}</div>
        </div>
      </td>
      ${tdResp}
      ${tdEst}
      ${tdIni}
      ${tdFin}
      ${tdDias}
      ${tdAvance}
      ${tdGantt}
      <td class="p-2 text-center border-b border-gray-200 space-x-1 whitespace-nowrap">
        ${state.proyectoEsGestor && nivel < 4 ? `<button onclick="event.stopPropagation(); abrirWizardCreacion('${cod}', 'hijo')" class="text-blue-600 hover:text-blue-800 font-bold px-1 text-sm cursor-pointer" title="Agregar subtarea">+</button>` : ''}
        ${state.proyectoEsGestor ? `<button onclick="event.stopPropagation(); eliminarActividad('${cod}')" class="text-red-500 hover:text-red-700 font-bold px-1 cursor-pointer" title="Eliminar">🗑️</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Inyectar fila rápida de "Fricción Cero" al final de la tabla para el Gestor
  if (state.proyectoEsGestor) {
    const trQuick = document.createElement("tr");
    trQuick.className = "bg-teal-50/40 hover:bg-teal-50/80 transition border-t border-dashed border-teal-300";
    trQuick.innerHTML = `
      <td class="p-2 text-center font-mono text-xs font-black text-teal-700 border-b border-gray-200">+</td>
      <td colspan="9" class="p-1.5 border-b border-gray-200">
        <div class="flex items-center space-x-2 max-w-2xl">
          <input type="text" id="input-quick-add-wbs" 
                 onkeydown="if(event.key==='Enter'){event.preventDefault(); crearActividadRapidaInline();}"
                 placeholder="⚡ Creación rápida: escribe el nombre de una nueva actividad aquí y presiona Enter..." 
                 class="flex-1 text-xs font-semibold text-gray-800 bg-white border border-teal-300 focus:border-[#0f2a4a] rounded-lg px-3 py-1.5 outline-none shadow-2xs">
          <button type="button" onclick="crearActividadRapidaInline()" class="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer whitespace-nowrap">
            + Agregar (Enter)
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(trQuick);
  }

  actualizarKPIs();
  actualizarBotonPlantillaDinamico();

  const anchoGuardado = localStorage.getItem(obtenerClaveStorageAnchoCol());
  if (anchoGuardado) aplicarAnchoColumnaDescripcion(anchoGuardado);

  if (typeof window.dibujarFlechasDependenciasGantt === "function") {
    requestAnimationFrame(() => window.dibujarFlechasDependenciasGantt());
  }

  if (!state.ejecutandoUndoRedo && typeof clonarActividadesSnapshot === "function") {
    state.ultimoSnapshotSincronizado = clonarActividadesSnapshot(state.actividadesGlobal);
  }
  if (typeof actualizarBotonesUndoRedoUI === "function") {
    actualizarBotonesUndoRedoUI();
  }
}

export function alternarColapsoNodo(cod) {
  const codLimpio = cod.replace(/\.$/, "");
  if (state.nodosColapsados.has(codLimpio)) state.nodosColapsados.delete(codLimpio);
  else state.nodosColapsados.add(codLimpio);
  renderizarTabla();
}

export function estaOcultoPorPadre(codigo) {
  const partes = codigo.replace(/\.$/, "").split(".");
  if (partes.length <= 1) return false;
  let acumulado = "";
  for (let i = 0; i < partes.length - 1; i++) {
    acumulado += (i === 0 ? "" : ".") + partes[i];
    if (state.nodosColapsados.has(acumulado)) return true;
  }
  return false;
}

export function seleccionarFila(cod) {
  state.codigoFilaSeleccionada = cod;
  document.querySelectorAll("#lista-actividades tr").forEach(tr => tr.classList.remove("row-selected"));
  document.getElementById(`fila-act-${cod.replace(/\./g, '_')}`)?.classList.add("row-selected");
}

export function deseleccionarFila() {
  state.codigoFilaSeleccionada = null;
  document.querySelectorAll("#lista-actividades tr").forEach(tr => {
    tr.classList.remove("row-selected");
  });
}

window.deseleccionarFila = deseleccionarFila;

export function esResponsableDeActividad(act) {
  if (!act || !act.responsable || !state.currentUser) return false;
  const respStr = String(act.responsable).toLowerCase();
  const uNom = String(state.currentUser.nombre_completo || "").toLowerCase().trim();
  const uUser = String(state.currentUser.username || "").toLowerCase().trim();
  return (uNom && respStr.includes(uNom)) || (uUser && respStr.includes(uUser));
}

export function poblarFiltroResponsablesDinamico() {
  const select = document.getElementById("filtro-responsable-select");
  if (!select) return;
  const prevVal = select.value;
  const setResponsables = new Set();

  (state.actividadesGlobal || []).forEach(act => {
    const respCampo = (act.responsable || "").trim();
    if (respCampo && respCampo !== "No asignado") {
      respCampo.split(/[;\n]+/).map(r => r.trim()).filter(Boolean).forEach(r => setResponsables.add(r));
    }
  });

  select.innerHTML = '<option value="">Colaboradores (Todos)</option>';
  Array.from(setResponsables).sort().forEach(nombre => {
    select.innerHTML += `<option value="${nombre}">${nombre}</option>`;
  });
  if (prevVal && setResponsables.has(prevVal)) select.value = prevVal;
}

export function actualizarAparienciaBotonesFiltro() {
  const lblNivel = document.getElementById("txt-nivel-activo-label");
  const selNivel = document.getElementById("sel-filtro-nivel");
  const niv = parseInt(state.nivelMaxVisible || 4);

  if (selNivel) selNivel.value = String(niv);
  if (lblNivel) {
    if (niv < 4) {
      lblNivel.innerText = `Hasta Nivel ${niv}`;
      lblNivel.className = "hidden md:inline text-xs font-black text-teal-800 leading-none";
    } else {
      lblNivel.innerText = "Niveles";
      lblNivel.className = "hidden md:inline text-xs font-semibold text-gray-700 leading-none";
    }
  }

  const lblColab = document.getElementById("txt-colaborador-activo-label");
  const selColab = document.getElementById("filtro-responsable-select");
  const respVal = (selColab?.value || "").trim();

  if (lblColab) {
    if (respVal) {
      const nombreCorto = respVal.length > 14 ? respVal.substring(0, 13) + "…" : respVal;
      lblColab.innerText = nombreCorto;
      lblColab.className = "hidden md:inline text-xs font-black text-teal-800 leading-none";
    } else {
      lblColab.innerText = "Colaboradores";
      lblColab.className = "hidden md:inline text-xs font-semibold text-gray-700 leading-none";
    }
  }
}

export function filtrarNivelJerarquico(val) {
  const n = parseInt(val) || 4;
  state.nivelMaxVisible = n;
  state.nivelFiltroActivo = n;
  state.nodosColapsados.clear();

  // Si el usuario elige ver hasta Nivel n, colapsamos visualmente los nodos de nivel n para indicar que tienen hijos ocultos debajo
  if (n < 4) {
    (state.actividadesGlobal || []).forEach(a => {
      const cod = String(a.codigo).replace(/\.+$/, "");
      if (cod.split(".").length === n && tieneHijos(cod)) {
        state.nodosColapsados.add(cod);
      }
    });
  }

  actualizarAparienciaBotonesFiltro();
  aplicarFiltrosGlobales();
}

export function filtrarPorEstadoKPI(estado) {
  if (!estado || state.filtroEstadoKPI === estado) {
    state.filtroEstadoKPI = "";
  } else {
    state.filtroEstadoKPI = estado;
  }

  const mapEstilos = {
    "Ejecutado": { id: "kpi-card-ejecutado", cls: "kpi-pill-active-emerald" },
    "En proceso": { id: "kpi-card-proceso", cls: "kpi-pill-active-amber" },
    "No iniciado": { id: "kpi-card-pendiente", cls: "kpi-pill-active-rose" }
  };

  Object.entries(mapEstilos).forEach(([est, conf]) => {
    const el = document.getElementById(conf.id);
    if (el) {
      el.classList.remove("bg-slate-100", "ring-2", "ring-[#0f2a4a]", "kpi-pill-active-emerald", "kpi-pill-active-amber", "kpi-pill-active-rose");
      if (state.filtroEstadoKPI === est) {
        el.classList.add(conf.cls);
      }
    }
  });

  aplicarFiltrosGlobales();
}

export function aplicarFiltrosGlobales() {
  const resp = document.getElementById("filtro-responsable-select")?.value || "";
  const busq = document.getElementById("filtro-busqueda")?.value.trim() || "";
  const niv = parseInt(state.nivelMaxVisible || 4);

  actualizarAparienciaBotonesFiltro();

  const badge = document.getElementById("badge-filtro-activo");
  const txtBadge = document.getElementById("badge-filtro-texto");

  const partes = [];
  if (niv < 4) partes.push(`Hasta Nivel ${niv}`);
  if (resp) {
    const nomCorto = resp.includes(",") ? resp.split(",")[0].trim() : resp.split(" ")[0];
    partes.push(`👤 ${nomCorto}`);
  }
  if (state.filtroSoloMisActividades) partes.push("Mis tareas");
  if (state.filtroEstadoKPI) partes.push(`${state.filtroEstadoKPI}`);
  if (busq) partes.push(`"${busq}"`);

  if (partes.length > 0) {
    if (txtBadge) txtBadge.innerText = partes.join(" · ");
    if (badge) {
      badge.classList.remove("hidden");
      badge.classList.add("flex");
    }
  } else {
    if (badge) {
      badge.classList.add("hidden");
      badge.classList.remove("flex");
    }
  }

  renderizarTabla();
  if (state.vistaProyectoActiva === "kanban") renderizarTableroKanban();
  renderizarBarraAvataresEquipoToolbar();
}

export function limpiarTodosFiltros() {
  state.nivelMaxVisible = 4;
  state.nivelFiltroActivo = 4;
  state.filtroSoloMisActividades = false;
  state.filtroEstadoKPI = "";
  state.nodosColapsados.clear();

  const selNivel = document.getElementById("sel-filtro-nivel");
  if (selNivel) selNivel.value = "4";

  const selResp = document.getElementById("filtro-responsable-select");
  if (selResp) selResp.value = "";

  const inpBusq = document.getElementById("filtro-busqueda");
  if (inpBusq) inpBusq.value = "";

  const btnMis = document.getElementById("btn-filtro-mis-actividades");
  if (btnMis) {
    btnMis.className = "h-[30px] px-2.5 rounded-lg text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap flex-shrink-0";
  }

  ["kpi-card-ejecutado", "kpi-card-proceso", "kpi-card-pendiente"].forEach(idEl => {
    document.getElementById(idEl)?.classList.remove("bg-slate-100", "ring-2", "ring-[#0f2a4a]", "kpi-pill-active-emerald", "kpi-pill-active-amber", "kpi-pill-active-rose");
  });

  actualizarAparienciaBotonesFiltro();
  aplicarFiltrosGlobales();
}

window.filtrarPorEstadoKPI = filtrarPorEstadoKPI;

window.actualizarAparienciaBotonesFiltro = actualizarAparienciaBotonesFiltro;

// --- EDICIÓN INLINE DE CELDAS ---
export function editarDescripcion(cod) {
  if (!state.proyectoEsGestor) return;
  const act = state.actividadesGlobal.find(a => a.codigo === cod);
  abrirInputCustom({
    titulo: "Modificar Descripción",
    mensaje: "Ingrese la nueva descripción:",
    tipo: "text",
    valorActual: act.descripcion,
    onAceptar: async (nueva) => {
      if (nueva && nueva.trim() !== "") {
        act.descripcion = nueva.trim();
        await guardarCambioDirecto(act);
      }
    }
  });
}

export function editarEstado(cod) {
  if (tieneHijos(cod)) return;
  const act = state.actividadesGlobal.find(a => a.codigo === cod);
  abrirInputCustom({
    titulo: "Modificar Estado",
    mensaje: "Seleccione el estado de la actividad:",
    tipo: "select",
    valorActual: act.estado,
    opciones: ["No iniciado", "En proceso", "Ejecutado"],
    onAceptar: async (nuevoEstado) => {
      if (nuevoEstado === "Ejecutado") {
        act.estado = "Ejecutado";
        act.avance = 100;
        await guardarCambioDirecto(act);
      } else if (nuevoEstado === "No iniciado") {
        act.estado = "No iniciado";
        act.avance = 0;
        await guardarCambioDirecto(act);
      } else if (nuevoEstado === "En proceso") {
        abrirInputCustom({
          titulo: "Porcentaje Requerido",
          mensaje: "Digite un valor (0 a 100):",
          tipo: "number",
          valorActual: act.avance > 0 ? act.avance : 50,
          onAceptar: async (pctStr) => {
            const pct = parseInt(pctStr);
            if (!isNaN(pct) && pct >= 0 && pct <= 100) {
              act.avance = pct;
              act.estado = (pct === 100) ? "Ejecutado" : (pct === 0 ? "No iniciado" : "En proceso");
              await guardarCambioDirecto(act);
            }
          }
        });
      }
    }
  });
}

export function editarFechaInicio(cod) {
  if (!state.proyectoEsGestor || tieneHijos(cod)) return;
  const act = state.actividadesGlobal.find(a => a.codigo === cod);
  document.getElementById("mfc-input-date").value = formatearFechaISO(act.fecha_inicio);

  document.getElementById("mfc-btn-guardar").onclick = async () => {
    const valISO = document.getElementById("mfc-input-date").value;
    if (valISO) {
      const dtIni = parsearFechaUniversal(valISO);
      if (dtIni) {
        act.fecha_inicio = formatearFechaLatina(valISO);
        const dtFin = calcularFechaFinPorModalidad(dtIni, act.dias, state.proyectoModoDuracion);
        act.fecha_fin = `${String(dtFin.getDate()).padStart(2, '0')}/${String(dtFin.getMonth() + 1).padStart(2, '0')}/${dtFin.getFullYear()}`;
        document.getElementById("modal-fecha-custom")?.classList.add("hidden");
        await guardarCambioDirecto(act);
      }
    }
  };
  document.getElementById("modal-fecha-custom")?.classList.remove("hidden");
}

let modalActivoAct = null;

export function editarFechaFin(cod) {
  if (!state.proyectoEsGestor || tieneHijos(cod)) return;
  modalActivoAct = state.actividadesGlobal.find(a => a.codigo === cod);
  if (!modalActivoAct) return;

  // Exponer al ámbito global para los listeners de main.js
  window.modalActivoAct = modalActivoAct;

  const inputFin = document.getElementById("mfi-input-fin");
  const inputDias = document.getElementById("mfi-input-dias");
  if (!inputFin || !inputDias) return;

  const fIniISO = formatearFechaISO(modalActivoAct.fecha_inicio);
  const dtIni = parsearFechaUniversal(modalActivoAct.fecha_inicio);

  inputFin.value = formatearFechaISO(modalActivoAct.fecha_fin);
  inputFin.min = fIniISO; // Bloquea seleccionar fechas anteriores a la de inicio
  inputDias.value = modalActivoAct.dias || 1;

  let bloqueandoRecalculo = false;

  // 1. Si el usuario modifica la duración -> Recalcular FECHA FIN en tiempo real (excluye feriados y fines de semana)
  inputDias.oninput = () => {
    if (bloqueandoRecalculo || !inputDias.value) return;
    const valor = parseFloat(inputDias.value);
    if (!isNaN(valor) && valor > 0 && dtIni) {
      bloqueandoRecalculo = true;
      const nuevaFechaFin = calcularFechaFinPorModalidad(dtIni, valor, state.proyectoModoDuracion);
      inputFin.value = nuevaFechaFin.toISOString().split("T")[0];
      bloqueandoRecalculo = false;
    }
  };

  // 2. Si el usuario modifica la FECHA FIN -> Recalcular DÍAS HÁBILES u HORAS en tiempo real
  inputFin.oninput = () => {
    if (bloqueandoRecalculo || !inputFin.value || !dtIni) return;
    const dtFin = new Date(inputFin.value + "T00:00:00");

    if (dtFin < dtIni) {
      alert("⚠️ La fecha de fin no puede ser anterior a la fecha de inicio.");
      inputFin.value = fIniISO;
      inputDias.value = (state.proyectoModoDuracion === "hours") ? 8 : 1;
      return;
    }

    bloqueandoRecalculo = true;
    const diasHabiles = contarDiasHabilesEntre(dtIni, dtFin);
    inputDias.value = (state.proyectoModoDuracion === "hours") ? (diasHabiles * 8) : diasHabiles;
    bloqueandoRecalculo = false;
  };

  // 3. Confirmar y guardar ambos valores amarrados a la base de datos
  document.getElementById("mfi-btn-guardar").onclick = async () => {
    const valFin = inputFin.value;
    const valDias = parseInt(inputDias.value);

    if (!valFin || isNaN(valDias) || valDias < 1) {
      alert("Por favor ingrese una fecha y duración válidas.");
      return;
    }

    const dtFin = new Date(valFin + "T00:00:00");
    if (dtFin < dtIni) {
      alert("⚠️ La fecha de fin no puede ser anterior a la fecha de inicio.");
      return;
    }

    modalActivoAct.fecha_fin = formatearFechaLatina(valFin);
    modalActivoAct.dias = valDias;

    cerrarFinInteractiva();
    await guardarCambioDirecto(modalActivoAct);
    notificarToast(`Plazo actualizado: ${valDias}d (Fin: ${formatearFechaLatina(valFin)})`, "success");
  };

  document.getElementById("modal-fin-interactiva")?.classList.remove("hidden");
}

export function cerrarFechaCustom() {
  document.getElementById("modal-fecha-custom")?.classList.add("hidden");
}

export function cerrarFinInteractiva() {
  document.getElementById("modal-fin-interactiva")?.classList.add("hidden");
}

window.cerrarFechaCustom = cerrarFechaCustom;
window.cerrarFinInteractiva = cerrarFinInteractiva;

export function editarDias(cod) {
  if (!state.proyectoEsGestor || tieneHijos(cod)) return;
  const act = state.actividadesGlobal.find(a => a.codigo === cod);
  const esHoras = (state.proyectoModoDuracion === "hours");

  abrirInputCustom({
    titulo: esHoras ? "Modificar Horas de Dedicación Neta" : "Modificar Duración (Días Hábiles)",
    mensaje: esHoras 
      ? "Ingrese las horas netas de dedicación (8h equivalen a 1 día hábil):" 
      : "Consigne los Días Hábiles estimados (se excluyen automáticamente fines de semana y feriados):",
    tipo: "number",
    valorActual: act.dias,
    onAceptar: async (diasStr) => {
      const valor = parseFloat(diasStr);
      if (!isNaN(valor) && valor > 0) {
        act.dias = valor;
        const dtIni = parsearFechaUniversal(act.fecha_inicio) || new Date();
        const dtFin = calcularFechaFinPorModalidad(dtIni, valor, state.proyectoModoDuracion);
        
        act.fecha_fin = `${String(dtFin.getDate()).padStart(2, '0')}/${String(dtFin.getMonth() + 1).padStart(2, '0')}/${dtFin.getFullYear()}`;
        await guardarCambioDirecto(act);
      }
    }
  });
}

export function editarAvance(cod) {
  if (tieneHijos(cod)) return;
  const act = state.actividadesGlobal.find(a => a.codigo === cod);
  abrirInputCustom({
    titulo: "Porcentaje Requerido",
    mensaje: "Porcentaje de avance real (0 a 100):",
    tipo: "number",
    valorActual: act.avance,
    onAceptar: async (avStr) => {
      const num = parseInt(avStr);
      if (!isNaN(num) && num >= 0 && num <= 100) {
        act.avance = num;
        act.estado = (num === 100) ? "Ejecutado" : (num === 0 ? "No iniciado" : "En proceso");
        await guardarCambioDirecto(act);
      }
    }
  });
}

export async function guardarCambioDirecto(act) {
  if (!state.ejecutandoUndoRedo && state.ultimoSnapshotSincronizado) {
    registrarSnapshotEnPilaUndo(`Cambio en actividad [${act.codigo}]`, state.ultimoSnapshotSincronizado);
  }
  const fIniLimpia = formatearFechaLatina(act.fecha_inicio);
  const fFinLimpia = formatearFechaLatina(act.fecha_fin);
  const pId = parseInt(state.proyectoActualId) || 1;

  const actLocal = state.actividadesGlobal.find(a => a.codigo === act.codigo);
  if (actLocal) {
    Object.assign(actLocal, act);
    renderizarTabla();
  }

  try {
    const res = await apiFetch(`/actividades`, {
      method: "POST",
      body: JSON.stringify({
        proyecto_id: pId,
        codigo: String(act.codigo).trim(),
        descripcion: String(act.descripcion || '').trim(),
        responsable: String(act.responsable || 'No asignado').trim(),
        estado: act.estado || 'No iniciado',
        avance: parseInt(act.avance) || 0,
        fecha_inicio: fIniLimpia,
        fecha_fin: fFinLimpia,
        dias: parseInt(act.dias) || 1,
        predecesores: String(act.predecesores || '').trim()
      })
    });

    if (res.ok) await sincronizarDatosProyecto(pId);
  } catch (error) {
    console.error("Error guardando actividad:", error);
  }
}

// --- DRAG AND DROP WBS DE ALTO RENDIMIENTO (60FPS SIN RECORRIDO DOM MASIVO) ---
let codigoActividadArrastrada = null;
let modoInsercion = "below";
let animacionAutoScrollId = null;
let velocidadAutoScroll = 0;
let ultimaFilaObjetivoArrastre = null;

export function iniciarArrastrePunteroFilaWBS(e, trOrigen, cod) {
  // No iniciar arrastre si el clic fue en un botón, input, select, barra Gantt interactiva o resizer
  if (e.button !== 0 || e.target.closest("button, input, select, textarea, .gantt-bar-interactive, .gantt-connect-handle, .col-resizer")) return;

  const startX = e.clientX;
  const startY = e.clientY;
  let arrastrando = false;
  let canceladoPorEscape = false;
  let badgeFlotante = null;

  const limpiarListeners = () => {
    window.removeEventListener("mousemove", alMover);
    window.removeEventListener("mouseup", alSoltar);
    window.removeEventListener("keydown", alPresionarTecla, true);
  };

  const abortarArrastre = () => {
    canceladoPorEscape = true;
    limpiarListeners();
    if (badgeFlotante) {
      badgeFlotante.remove();
      badgeFlotante = null;
    }
    finalizarArrastre();
  };

  const alPresionarTecla = (ev) => {
    if (ev.key === "Escape" && arrastrando) {
      ev.preventDefault();
      ev.stopPropagation();
      abortarArrastre();
      notificarToast("Reubicación cancelada.", "info", 1800);
    }
  };

  const alMover = (ev) => {
    if (canceladoPorEscape) return;

    if (!arrastrando) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      arrastrando = true;
      if (typeof window.ocultarTooltipGantt === "function") window.ocultarTooltipGantt();
      codigoActividadArrastrada = cod;
      document.body.classList.add("is-dragging-row");
      trOrigen.classList.add("row-dragging");

      const actObj = state.actividadesGlobal.find(a => String(a.codigo).replace(/\.+$/, "") === String(cod).replace(/\.+$/, ""));
      const descCorta = actObj ? actObj.descripcion.substring(0, 30) + (actObj.descripcion.length > 30 ? "…" : "") : cod;

      badgeFlotante = document.createElement("div");
      badgeFlotante.className = "fixed left-0 top-0 bg-[#0f2a4a] text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-2xl border border-teal-400 flex items-center space-x-2 z-[99999] pointer-events-none select-none";
      badgeFlotante.innerHTML = `<span class="font-mono text-teal-300">[${cod}]</span><span class="font-semibold">${descCorta}</span><span class="text-[9.5px] text-slate-300 font-normal ml-1.5 border-l border-white/20 pl-1.5">Esc para cancelar</span>`;
      document.body.appendChild(badgeFlotante);

      iniciarBucleAutoScroll();
    }

    badgeFlotante.style.transform = `translate3d(${ev.clientX + 14}px, ${ev.clientY + 12}px, 0)`;

    const elDebajo = document.elementFromPoint(ev.clientX, ev.clientY);
    const trDestino = elDebajo ? elDebajo.closest("#lista-actividades tr[id^='fila-act-']") : null;

    // Si vuelve a pasar sobre la misma fila que está arrastrando, limpiar cualquier borde activo
    if (!trDestino || trDestino === trOrigen) {
      if (ultimaFilaObjetivoArrastre) {
        ultimaFilaObjetivoArrastre.classList.remove("drop-target-above", "drop-target-below", "drop-target-inside", "drop-target-invalid");
        ultimaFilaObjetivoArrastre = null;
      }
      return;
    }

    sobrevolarFilaArrastre(
      { preventDefault: () => {}, clientY: ev.clientY, dataTransfer: { dropEffect: "move" } },
      trDestino
    );
  };

  const alSoltar = async () => {
    limpiarListeners();
    if (!arrastrando || canceladoPorEscape) return;

    if (badgeFlotante) {
      badgeFlotante.remove();
      badgeFlotante = null;
    }

    const trTarget = ultimaFilaObjetivoArrastre;
    if (trTarget && trTarget !== trOrigen) {
      const codDestino = (trTarget.id || "").replace("fila-act-", "").replace(/_/g, ".");
      await soltarFilaArrastre({ preventDefault: () => {} }, codDestino, trTarget);
    } else {
      finalizarArrastre();
    }
  };

  window.addEventListener("mousemove", alMover);
  window.addEventListener("mouseup", alSoltar);
  window.addEventListener("keydown", alPresionarTecla, true);
}

export function iniciarArrastreFila(e, cod) {
  if (typeof window.ocultarTooltipGantt === "function") window.ocultarTooltipGantt();
  codigoActividadArrastrada = cod;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", cod);
  document.body.classList.add("is-dragging-row");
  document.getElementById(`fila-act-${cod.replace(/\./g, '_')}`)?.classList.add("row-dragging");

  const actObj = state.actividadesGlobal.find(a => String(a.codigo).replace(/\.+$/, "") === String(cod).replace(/\.+$/, ""));
  const descCorta = actObj ? actObj.descripcion.substring(0, 26) + (actObj.descripcion.length > 26 ? "…" : "") : cod;

  const dragBadge = document.createElement("div");
  dragBadge.className = "fixed top-[-1000px] left-[-1000px] bg-[#0f2a4a] text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-2xl border border-teal-400 flex items-center space-x-2 z-[9999] pointer-events-none";
  dragBadge.innerHTML = `<span>✊ [${cod}]</span> <span class="font-normal opacity-90">${descCorta}</span>`;
  document.body.appendChild(dragBadge);
  e.dataTransfer.setDragImage(dragBadge, 15, 15);
  setTimeout(() => dragBadge.remove(), 0);

  iniciarBucleAutoScroll();
}

function iniciarBucleAutoScroll() {
  if (animacionAutoScrollId) return;
  const pasoScroll = () => {
    if (codigoActividadArrastrada && velocidadAutoScroll !== 0) {
      const cont = document.getElementById("vista-tabla-gantt-wrapper") || document.getElementById("view-dashboard");
      if (cont) cont.scrollTop += velocidadAutoScroll;
    }
    if (codigoActividadArrastrada) animacionAutoScrollId = requestAnimationFrame(pasoScroll);
    else animacionAutoScrollId = null;
  };
  animacionAutoScrollId = requestAnimationFrame(pasoScroll);
}

// Calcula cuántos niveles hacia abajo tiene la actividad que se está arrastrando (1 si no tiene hijos, 2 si tiene hijos, etc.)
function obtenerProfundidadRama(codBase) {
  const limpio = String(codBase || "").replace(/\.+$/, "");
  if (!limpio) return 1;
  const nivBase = limpio.split(".").length;
  let maxNiv = nivBase;

  (state.actividadesGlobal || []).forEach(a => {
    const c = String(a.codigo || "").replace(/\.+$/, "");
    if (c === limpio || c.startsWith(limpio + ".")) {
      const n = c.split(".").length;
      if (n > maxNiv) maxNiv = n;
    }
  });
  return (maxNiv - nivBase) + 1;
}

// Verifica si reubicar codOrigen respecto a codDestino en el modo indicado excedería los 4 niveles permitidos
function excedeLimiteJerarquicoWBS(codOrigen, codDestino, modo) {
  const origLimpio = String(codOrigen || "").replace(/\.+$/, "");
  const destLimpio = String(codDestino || "").replace(/\.+$/, "");
  if (!origLimpio || !destLimpio) return false;

  const nivelDestino = destLimpio.split(".").length;
  const profOrigen = obtenerProfundidadRama(origLimpio);

  // Si se intenta meter "adentro" (inside), el nuevo nivel raíz de la rama será nivelDestino + 1
  // Si se coloca "arriba" o "abajo" (hermano), el nuevo nivel raíz de la rama será nivelDestino
  const nuevoNivelRaizRama = (modo === "inside") ? (nivelDestino + 1) : nivelDestino;
  const nivelMaximoResultante = nuevoNivelRaizRama + profOrigen - 1;

  return nivelMaximoResultante > 4;
}

export function sobrevolarFilaArrastre(e, trElement) {
  e.preventDefault();

  const cont = document.getElementById("vista-tabla-gantt-wrapper") || document.getElementById("view-dashboard");
  if (cont) {
    const cRect = cont.getBoundingClientRect();
    const umbral = 70;
    const yMouse = e.clientY;
    if (yMouse < cRect.top + umbral) velocidadAutoScroll = -Math.round(12 * Math.max(0.2, (cRect.top + umbral - yMouse) / umbral));
    else if (yMouse > cRect.bottom - umbral) velocidadAutoScroll = Math.round(12 * Math.max(0.2, (yMouse - (cRect.bottom - umbral)) / umbral));
    else velocidadAutoScroll = 0;
  }

  if (trElement.classList.contains("row-dragging")) return;

  if (ultimaFilaObjetivoArrastre && ultimaFilaObjetivoArrastre !== trElement) {
    ultimaFilaObjetivoArrastre.classList.remove("drop-target-above", "drop-target-below", "drop-target-inside", "drop-target-invalid");
  }
  ultimaFilaObjetivoArrastre = trElement;

  const rect = trElement.getBoundingClientRect();
  const yRel = e.clientY - rect.top;
  const margen = Math.max(6, rect.height * 0.24);

  let nuevoModo = "inside";
  if (yRel <= margen) nuevoModo = "above";
  else if (yRel >= rect.height - margen) nuevoModo = "below";

  // Extraer el código de la fila destino a partir de su ID (ej. fila-act-1_1_1_1 -> 1.1.1.1)
  const codDestino = (trElement.id || "").replace("fila-act-", "").replace(/_/g, ".");
  const esInvalidoPorNivel = excedeLimiteJerarquicoWBS(codigoActividadArrastrada, codDestino, nuevoModo);

  const claseDeseada = esInvalidoPorNivel ? "drop-target-invalid" : `drop-target-${nuevoModo}`;
  e.dataTransfer.dropEffect = esInvalidoPorNivel ? "none" : "move";

  if (!trElement.classList.contains(claseDeseada)) {
    trElement.classList.remove("drop-target-above", "drop-target-below", "drop-target-inside", "drop-target-invalid");
    trElement.classList.add(claseDeseada);
  }
  modoInsercion = nuevoModo;
}

export function limpiarBordeArrastre(trElement) {
  // Controlado por ultimaFilaObjetivoArrastre para mantener fluidez 60fps
}

export function finalizarArrastre() {
  velocidadAutoScroll = 0;
  if (animacionAutoScrollId) { cancelAnimationFrame(animacionAutoScrollId); animacionAutoScrollId = null; }
  document.body.classList.remove("is-dragging-row");
  if (ultimaFilaObjetivoArrastre) {
    ultimaFilaObjetivoArrastre.classList.remove("drop-target-above", "drop-target-below", "drop-target-inside", "drop-target-invalid");
    ultimaFilaObjetivoArrastre = null;
  }
  document.querySelectorAll("#lista-actividades tr.row-dragging").forEach(tr => tr.classList.remove("row-dragging"));
  codigoActividadArrastrada = null;
}

export async function soltarFilaArrastre(e, codigoDestino, trElement) {
  e.preventDefault();
  const codOrigen = codigoActividadArrastrada;
  const modoElegido = modoInsercion;
  finalizarArrastre();

  if (!codOrigen || codOrigen === codigoDestino) return;

  const codOrigenLimpio = String(codOrigen).replace(/\.+$/, "");
  const codDestinoLimpio = String(codigoDestino).replace(/\.+$/, "");

  const bloqueOrigen = state.actividadesGlobal.filter(a => {
    const c = String(a.codigo).replace(/\.+$/, "");
    return c === codOrigenLimpio || c.startsWith(codOrigenLimpio + ".");
  }).map(a => String(a.codigo).replace(/\.+$/, ""));

  if (bloqueOrigen.includes(codDestinoLimpio)) {
    notificarToast(`No es posible mover la actividad [${codOrigenLimpio}] dentro de sus propias subtareas.`, "warning", 3500);
    return;
  }

  // Validación preventiva de límite de 4 niveles jerárquicos con mensaje sutil y amigable
  if (excedeLimiteJerarquicoWBS(codOrigenLimpio, codDestinoLimpio, modoElegido)) {
    const nivelDest = codDestinoLimpio.split(".").length;
    if (modoElegido === "inside" && nivelDest >= 4) {
      notificarToast(`Límite de niveles: [${codDestinoLimpio}] ya es de Nivel 4 (máximo permitido). Suelte la actividad arriba o abajo para ubicarla al mismo nivel.`, "warning", 4200);
    } else {
      notificarToast(`Límite de niveles: Reubicar [${codOrigenLimpio}] con sus subtareas aquí generaría un Nivel 5 (el sistema permite hasta 4 niveles).`, "warning", 4200);
    }
    return;
  }

  const etiquetaPosicion = modoElegido === "inside"
    ? `dentro de [${codDestinoLimpio}] (como subtarea)`
    : (modoElegido === "above" ? `antes de [${codDestinoLimpio}]` : `después de [${codDestinoLimpio}]`);

  const confirma = await confirmModal(`¿Desea reubicar la actividad [${codOrigenLimpio}] ${etiquetaPosicion}?`, "Confirmar reubicación", "question");
  if (!confirma) return;

  registrarSnapshotAntesDeAccion(`Reordenar actividad [${codOrigenLimpio}]`);

  try {
    const res = await apiFetch(`/proyectos/${state.proyectoActualId}/reordenar-actividades`, {
      method: "PUT",
      body: JSON.stringify({
        proyecto_id: parseInt(state.proyectoActualId),
        codigo_origen: codOrigenLimpio,
        codigo_destino: codDestinoLimpio,
        modo: modoElegido
      })
    });
    if (res.ok) {
      notificarToast("Estructura WBS reorganizada con éxito.", "success");
      await sincronizarDatosProyecto(state.proyectoActualId);
    } else {
      const err = await res.json().catch(() => ({}));
      notificarToast(err.detail || "No se pudo reubicar la actividad por límite de niveles.", "warning", 4000);
    }
  } catch (err) {
    notificarToast("Error de conexión al intentar reordenar la estructura.", "error");
  }
}

// --- WIZARD CREACIÓN DE ACTIVIDADES ---
let opcionesModoWizard = [];

export function botonSuperiorNuevaActividad() {
  if (!state.proyectoEsGestor) {
    notificarToast("Solo el Gestor del Proyecto puede crear actividades.", "warning");
    return;
  }
  if (!state.codigoFilaSeleccionada) {
    abrirWizardCreacion(null, "raiz");
  } else {
    const codLimpio = String(state.codigoFilaSeleccionada).replace(/\.+$/, "");
    const nivel = codLimpio.split(".").length;
    if (nivel < 4) {
      abrirWizardCreacion(codLimpio, "hijo");
    } else {
      notificarToast(`ℹ️ [${codLimpio}] ya se encuentra en el Nivel 4 (máximo permitido). Se creará una actividad hermana en el mismo nivel.`, "info", 3800);
      abrirWizardCreacion(codLimpio, "hermano");
    }
  }
}

export function abrirWizardCreacion(codigoBase = null, modoForzado = "hijo") {
  state.wizardCodigoPadre = codigoBase;
  opcionesModoWizard = [];

  const contToggle = document.getElementById("wz-contenedor-selector-tipo");
  const selToggle = document.getElementById("wz-select-tipo-creacion");

  if (!codigoBase || modoForzado === "raiz") {
    const raices = state.actividadesGlobal.filter(a => !a.codigo.replace(/\.$/, "").includes("."));
    let maxNum = 0;
    raices.forEach(r => {
      const n = parseInt(r.codigo.replace(/\.$/, ""));
      if (!isNaN(n) && n > maxNum) maxNum = n;
    });
    const codRaiz = `${maxNum + 1}`;

    opcionesModoWizard.push({
      modo: "raiz",
      codigo: codRaiz,
      label: "✨ Nueva actividad principal (Nivel 1)",
      titulo: "Nueva actividad principal (Nivel 1)",
      subtitulo: "Creando actividad principal independiente"
    });
  } else {
    const codLimpio = String(codigoBase).replace(/\.+$/, "");
    const nivel = codLimpio.split(".").length;
    const madre = state.actividadesGlobal.find(a => a.codigo.replace(/\.+$/, "") === codLimpio);
    const descBase = madre ? madre.descripcion : codLimpio;
    const nombresSub = ["", "Tarea (Nivel 2)", "Subtarea (Nivel 3)", "Paso (Nivel 4)"];
    const nombresMismo = ["", "actividad principal (Nivel 1)", "tarea (Nivel 2)", "subtarea (Nivel 3)", "paso (Nivel 4)"];

    // Si se intenta forzar "hijo" sobre una actividad que ya es de Nivel 4, avisar sutilmente y pasar a "hermano"
    if (nivel >= 4 && modoForzado === "hijo") {
      notificarToast(`Alcance jerárquico: El sistema admite hasta 4 niveles de desglose. Se creará al mismo nivel que [${codLimpio}].`, "info", 3800);
      modoForzado = "hermano";
    }

    if (nivel < 4) {
      const hijos = state.actividadesGlobal.filter(a => {
        const c = a.codigo.replace(/\.$/, "");
        return c.startsWith(codLimpio + ".") && c.split(".").length === nivel + 1;
      });
      let maxH = 0;
      hijos.forEach(h => {
        const ult = parseInt(h.codigo.replace(/\.$/, "").split(".").pop());
        if (!isNaN(ult) && ult > maxH) maxH = ult;
      });
      const codHijo = `${codLimpio}.${maxH + 1}`;

      opcionesModoWizard.push({
        modo: "hijo",
        codigo: codHijo,
        label: `➕ ${nombresSub[nivel]} (dependiente de [${codLimpio}])`,
        titulo: `Nueva ${nombresSub[nivel]} para [${codLimpio}]`,
        subtitulo: `Depende de: ${descBase}`
      });
    }

    // Cálculo de código hermano (disponible desde Nivel 1 hasta Nivel 4)
    let codHermano = "1";
    const partes = codLimpio.split(".");
    if (partes.length === 1) {
      const raices = state.actividadesGlobal.filter(a => !a.codigo.replace(/\.$/, "").includes("."));
      let maxR = 0;
      raices.forEach(r => {
        const n = parseInt(r.codigo.replace(/\.$/, ""));
        if (!isNaN(n) && n > maxR) maxR = n;
      });
      codHermano = `${maxR + 1}`;
    } else {
      const padre = partes.slice(0, -1).join(".");
      const hermanos = state.actividadesGlobal.filter(a => a.codigo.startsWith(padre + ".") && a.codigo.split(".").length === partes.length);
      let maxHer = 0;
      hermanos.forEach(h => {
        const ult = parseInt(h.codigo.split(".").pop());
        if (!isNaN(ult) && ult > maxHer) maxHer = ult;
      });
      codHermano = `${padre}.${maxHer + 1}`;
    }

    opcionesModoWizard.push({
      modo: "hermano",
      codigo: codHermano,
      label: `📋 Agregar actividad hermana (${nombresMismo[nivel]})`,
      titulo: `Nueva actividad hermana (${nombresMismo[nivel]})`,
      subtitulo: `Al mismo nivel que [${codLimpio}]`
    });
  }

  if (selToggle) {
    selToggle.innerHTML = "";
    opcionesModoWizard.forEach(op => {
      selToggle.innerHTML += `<option value="${op.modo}">${op.label}</option>`;
    });
    selToggle.value = modoForzado;
  }

  if (contToggle) {
    if (opcionesModoWizard.length > 1) contToggle.classList.remove("hidden");
    else contToggle.classList.add("hidden");
  }

  cambiarModoSeleccionadoWizard(modoForzado);

  const hoy = new Date();
  document.getElementById("wz-input-desc").value = "";
  document.getElementById("wz-input-ini").value = formatearFechaISO(hoy.toISOString().split("T")[0]);

  const esHoras = (state.proyectoModoDuracion === "hours");
  const lblUnidad = document.getElementById("wz-lbl-duracion");
  const sufijoUnidad = document.getElementById("wz-sufijo-duracion");
  const inpDias = document.getElementById("wz-input-dias");
  const inpFin = document.getElementById("wz-input-fin");

  if (esHoras) {
    if (lblUnidad) lblUnidad.innerText = "Horas Duración:";
    if (sufijoUnidad) sufijoUnidad.innerText = "h";
    if (inpDias) inpDias.value = 8;
    if (inpFin) {
      inpFin.readOnly = true;
      inpFin.className = "w-full p-2 bg-slate-100 border border-gray-300 rounded-lg text-xs font-bold text-slate-500 cursor-not-allowed outline-none select-none";
      inpFin.value = formatearFechaISO(hoy.toISOString().split("T")[0]);
    }
  } else {
    if (lblUnidad) lblUnidad.innerText = "Días Duración:";
    if (sufijoUnidad) sufijoUnidad.innerText = "";
    if (inpDias) inpDias.value = 5;
    if (inpFin) {
      inpFin.readOnly = false;
      inpFin.className = "w-full p-2 bg-gray-50 border border-gray-300 rounded-lg text-xs font-bold text-gray-800 outline-none focus:border-[#0f2a4a]";
      const dtFinDef = new Date(hoy);
      dtFinDef.setDate(dtFinDef.getDate() + 4);
      inpFin.value = formatearFechaISO(dtFinDef.toISOString().split("T")[0]);
    }
  }

  const selEst = document.getElementById("wz-input-estado");
  if (selEst) selEst.value = "No iniciado";
  evaluarEstadoWizard("No iniciado");

  state.wizardResponsablesSeleccionados = [];
  const inpBusqWz = document.getElementById("wz-busq-responsable");
  if (inpBusqWz) inpBusqWz.value = "";
  const sugWz = document.getElementById("wz-sug-responsables");
  if (sugWz) sugWz.classList.add("hidden");
  renderizarResponsablesWizard();

  if (!state.catalogoTrabajadoresGlobal || state.catalogoTrabajadoresGlobal.length === 0) {
    apiFetch("/trabajadores").then(r => r.ok ? r.json() : []).then(d => { state.catalogoTrabajadoresGlobal = d; }).catch(() => {});
  }

  irAPasoWizard(1);
  document.getElementById("modal-wizard-creacion")?.classList.remove("hidden");
  setTimeout(() => document.getElementById("wz-input-desc")?.focus(), 100);
}

export function autocompletarResponsableWizard(termino) {
  const term = (termino || "").toLowerCase().trim();
  const divSug = document.getElementById("wz-sug-responsables");
  if (!divSug) return;

  if (!term) {
    divSug.innerHTML = "";
    divSug.classList.add("hidden");
    return;
  }

  const matches = (state.catalogoTrabajadoresGlobal || []).filter(t =>
    (t.estado === "ACTIVO" || !t.estado) &&
    ((t.nombre_completo && t.nombre_completo.toLowerCase().includes(term)) ||
     (t.unidad_organica && t.unidad_organica.toLowerCase().includes(term)))
  );

  divSug.innerHTML = "";
  if (matches.length === 0) {
    divSug.innerHTML = `<div class="p-2 text-gray-400 italic">Sin coincidencias para '${termino}'</div>`;
  } else {
    matches.slice(0, 6).forEach(t => {
      const item = document.createElement("div");
      item.className = "p-2 hover:bg-teal-50 cursor-pointer flex justify-between items-center transition";
      item.innerHTML = `
        <span class="font-bold text-[#0f2a4a]">${t.nombre_completo}</span>
        <span class="text-[10px] font-bold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">${t.unidad_organica}</span>
      `;
      item.onclick = () => {
        if (!state.wizardResponsablesSeleccionados) state.wizardResponsablesSeleccionados = [];
        if (!state.wizardResponsablesSeleccionados.includes(t.nombre_completo)) {
          state.wizardResponsablesSeleccionados.push(t.nombre_completo);
          renderizarResponsablesWizard();
        }
        const inp = document.getElementById("wz-busq-responsable");
        if (inp) inp.value = "";
        divSug.classList.add("hidden");
      };
      divSug.appendChild(item);
    });
  }
  divSug.classList.remove("hidden");
}

export function quitarResponsableWizard(idx) {
  if (!state.wizardResponsablesSeleccionados) return;
  state.wizardResponsablesSeleccionados.splice(idx, 1);
  renderizarResponsablesWizard();
}

export function renderizarResponsablesWizard() {
  const cont = document.getElementById("wz-responsables-seleccionados");
  if (!cont) return;
  const lista = state.wizardResponsablesSeleccionados || [];
  if (lista.length === 0) {
    cont.innerHTML = `<span class="text-[11px] text-gray-400 italic p-1">Ningún responsable seleccionado aún.</span>`;
    return;
  }
  cont.innerHTML = lista.map((nom, idx) => `
    <span class="inline-flex items-center space-x-1 bg-teal-50 text-teal-900 border border-teal-200 px-2 py-0.5 rounded-md text-[11px] font-bold">
      <span>👤 ${nom}</span>
      <button type="button" onclick="quitarResponsableWizard(${idx})" class="text-teal-600 hover:text-rose-600 font-black ml-1 cursor-pointer">&times;</button>
    </span>
  `).join("");
}

window.autocompletarResponsableWizard = autocompletarResponsableWizard;
window.quitarResponsableWizard = quitarResponsableWizard;

export function cambiarTipoCreacionDesdeNivel1(modo) {
  cambiarModoSeleccionadoWizard(modo);
}

export function cambiarModoSeleccionadoWizard(modo) {
  const op = opcionesModoWizard.find(o => o.modo === modo) || opcionesModoWizard[0];
  if (!op) return;

  state.wizardCodigoGenerado = op.codigo;
  const prevCod = document.getElementById("wz-codigo-preview");
  if (prevCod) prevCod.innerText = op.codigo;
  const tit = document.getElementById("wz-titulo");
  if (tit) tit.innerText = op.titulo;
  const sub = document.getElementById("wz-subtitulo");
  if (sub) sub.innerText = op.subtitulo;
}

export function evaluarEstadoWizard(estado) {
  const boxAvance = document.getElementById("wz-box-avance");
  const boxPred = document.getElementById("wz-box-pred");
  const inpAvance = document.getElementById("wz-input-avance");

  if (estado === "En proceso") {
    if (boxAvance) boxAvance.classList.remove("hidden");
    if (boxPred) boxPred.className = "sm:col-span-1";
    if (inpAvance && (!inpAvance.value || parseInt(inpAvance.value) <= 0 || parseInt(inpAvance.value) >= 100)) {
      inpAvance.value = 50;
    }
  } else {
    if (boxAvance) boxAvance.classList.add("hidden");
    if (boxPred) boxPred.className = "sm:col-span-2";
  }
}

export function irAPasoWizard(paso) {
  state.wizardPasoActual = paso;
  document.getElementById("wz-paso-1")?.classList.toggle("hidden", paso !== 1);
  document.getElementById("wz-paso-2")?.classList.toggle("hidden", paso !== 2);
  document.getElementById("wz-paso-3")?.classList.toggle("hidden", paso !== 3);

  const barra = document.getElementById("wz-progreso-barra");
  const btnAnt = document.getElementById("wz-btn-anterior");
  const btnSig = document.getElementById("wz-btn-siguiente");

  if (paso === 1) {
    if (barra) barra.style.width = "33.33%";
    btnAnt?.classList.add("invisible");
    if (btnSig) btnSig.innerText = "Siguiente →";
  } else if (paso === 2) {
    if (barra) barra.style.width = "66.66%";
    btnAnt?.classList.remove("invisible");
    if (btnSig) btnSig.innerText = "Siguiente →";
  } else if (paso === 3) {
    if (barra) barra.style.width = "100%";
    btnAnt?.classList.remove("invisible");
    if (btnSig) btnSig.innerText = "✓ Guardar Registro";
  }
}

export function avanzarPasoWizard() {
  if (state.wizardPasoActual === 1) {
    if (!document.getElementById("wz-input-desc").value.trim()) {
      alert("Por favor consigna una descripción para continuar.");
      return;
    }
    irAPasoWizard(2);
  } else if (state.wizardPasoActual === 2) {
    const fIniVal = document.getElementById("wz-input-ini").value;
    const fFinVal = document.getElementById("wz-input-fin").value;
    const diasVal = parseInt(document.getElementById("wz-input-dias").value);

    if (!fIniVal || !fFinVal || isNaN(diasVal) || diasVal < 1) {
      alert("Verifique las fechas de inicio, término y la cantidad de días.");
      return;
    }
    irAPasoWizard(3);
  } else if (state.wizardPasoActual === 3) {
    guardarActividadDesdeWizard();
  }
}

export function retrocederPasoWizard() {
  if (state.wizardPasoActual > 1) irAPasoWizard(state.wizardPasoActual - 1);
}

export function cerrarWizardCreacion() {
  document.getElementById("modal-wizard-creacion")?.classList.add("hidden");
}

export async function guardarActividadDesdeWizard() {
  const fIniRaw = document.getElementById("wz-input-ini").value;
  const fFinRaw = document.getElementById("wz-input-fin").value;
  const dias = parseInt(document.getElementById("wz-input-dias").value) || 1;
  const estado = document.getElementById("wz-input-estado").value;
  let avance = 0;

  if (estado === "Ejecutado") avance = 100;
  else if (estado === "En proceso") avance = parseInt(document.getElementById("wz-input-avance")?.value) || 50;

  const respFinalWz = (state.wizardResponsablesSeleccionados && state.wizardResponsablesSeleccionados.length > 0)
    ? state.wizardResponsablesSeleccionados.join("; ")
    : "No asignado";

  const payload = {
    proyecto_id: parseInt(state.proyectoActualId),
    codigo: state.wizardCodigoGenerado,
    descripcion: document.getElementById("wz-input-desc").value.trim(),
    responsable: respFinalWz,
    estado: estado,
    avance: avance,
    fecha_inicio: formatearFechaLatina(fIniRaw),
    fecha_fin: formatearFechaLatina(fFinRaw),
    dias: dias,
    predecesores: document.getElementById("wz-input-pred")?.value.trim() || ""
  };

  registrarSnapshotAntesDeAccion(`Crear actividad [${state.wizardCodigoGenerado}]`);

  try {
    const res = await apiFetch(`/actividades`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      cerrarWizardCreacion();
      notificarToast(`Actividad [${state.wizardCodigoGenerado}] creada exitosamente.`, "success");
      await sincronizarDatosProyecto(state.proyectoActualId);
    }
  } catch (e) {
    alert("Error al registrar actividad.");
  }
}

export async function eliminarActividad(cod) {
  if (!state.proyectoEsGestor && state.currentUser?.rol !== "ADMIN_TI") {
    notificarToast("Solo un Gestor del Proyecto puede eliminar actividades.", "warning");
    return;
  }
  const codLimpio = String(cod || "").trim().replace(/\.+$/, "");
  if (!codLimpio) return;

  const hijas = (state.actividadesGlobal || []).filter(a => {
    const c = String(a.codigo || "").replace(/\.+$/, "");
    return c.startsWith(codLimpio + ".") && c !== codLimpio;
  });

  const comsAfectados = (state.comentariosGlobal || []).filter(c => {
    const cCod = String(c.codigo_actividad || "").replace(/\.+$/, "");
    return cCod === codLimpio || cCod.startsWith(codLimpio + ".");
  });

  let mensaje = `¿Está seguro de eliminar la actividad [${codLimpio}]?`;
  if (hijas.length > 0) {
    mensaje = `⚠️ ATENCIÓN: La actividad [${codLimpio}] contiene ${hijas.length} subactividad(es) subordinada(s).\n\nSi continúa, se eliminarán todas en cascada.`;
  }
  if (comsAfectados.length > 0) {
    mensaje += `\n\n💬 Nota: También se eliminarán ${comsAfectados.length} comentario(s) vinculado(s) (podrá recuperarlos si presiona Deshacer Ctrl+Z).`;
  }

  const confirma = await confirmModal(mensaje, "Eliminar Actividad", "danger");
  if (!confirma) return;

  try {
    if (typeof registrarSnapshotAntesDeAccion === "function") {
      registrarSnapshotAntesDeAccion(`Eliminar actividad [${codLimpio}]`);
    }
  } catch (snapErr) {
    console.warn("Aviso snapshot:", snapErr);
  }

  try {
    const res = await apiFetch(`/proyectos/${state.proyectoActualId}/actividades/${encodeURIComponent(codLimpio)}`, { method: "DELETE" });
    if (res.ok) {
      state.codigoFilaSeleccionada = null;
      notificarToast(`Actividad [${codLimpio}] eliminada. (Puede usar Ctrl+Z para revertir)`, "info", 3200);
      await sincronizarDatosProyecto(state.proyectoActualId);
      if (state.vistaProyectoActiva === "kanban" && typeof renderizarTableroKanban === "function") {
        renderizarTableroKanban();
      }
    } else {
      const errData = await res.json().catch(() => ({}));
      notificarToast(errData.detail || "No se pudo eliminar la actividad.", "error", 4000);
    }
  } catch (e) {
    console.error("Error al eliminar actividad:", e);
    notificarToast("Error de comunicación al eliminar la actividad.", "error");
  }
}

// --- MENÚ CONTEXTUAL EN CASCADA ---
export function abrirMenuContextual(event, cod) {
  event.preventDefault();
  event.stopPropagation();
  seleccionarFila(cod);
  state.actividadContextualSeleccionada = state.actividadesGlobal.find(a => a.codigo === cod);
  if (!state.actividadContextualSeleccionada) return;

  const partes = cod.replace(/\.+$/, "").split(".");
  const nivel = partes.length;
  const nombresSubnivel = ["", "subtarea (Nivel 2)", "subtarea (Nivel 3)", "paso (Nivel 4)"];
  const nombresMismoNivel = ["", "actividad principal (Nivel 1)", "tarea (Nivel 2)", "subtarea (Nivel 3)", "paso (Nivel 4)"];

  const menu = document.getElementById("menu-contextual");
  const headerInfo = document.getElementById("mc-header-info");
  if (headerInfo) {
    headerInfo.classList.remove("hidden");
    headerInfo.innerText = `[${cod}] ${state.actividadContextualSeleccionada.descripcion}`;
  }

  const grupoAgregar = document.getElementById("mc-grupo-agregar");
  const btnRaizDirecto = document.getElementById("mc-btn-raiz-directo");
  const btnHijo = document.getElementById("mc-btn-hijo");
  const btnHermano = document.getElementById("mc-btn-hermano");
  const btnRaiz = document.getElementById("mc-btn-raiz");
  const btnResp = document.getElementById("mc-btn-resp");
  const btnElim = document.getElementById("mc-btn-eliminar");
  const btnCom = document.getElementById("mc-btn-comentarios");

  const esMiActividad = state.actividadContextualSeleccionada.responsable && state.actividadContextualSeleccionada.responsable.includes(state.currentUser.username);
  const puedeCrear = state.proyectoEsGestor || esMiActividad;

  if (grupoAgregar) grupoAgregar.classList.toggle("hidden", !puedeCrear);
  if (btnRaizDirecto) btnRaizDirecto.classList.add("hidden");

  if (btnHijo) {
    if (nivel >= 4 || !puedeCrear) btnHijo.classList.add("hidden");
    else {
      btnHijo.classList.remove("hidden");
      const txtHijo = document.getElementById("mc-txt-hijo");
      if (txtHijo) txtHijo.innerText = `Agregar ${nombresSubnivel[nivel]}`;
    }
  }

  if (btnHermano) {
    if (!puedeCrear) btnHermano.classList.add("hidden");
    else {
      btnHermano.classList.remove("hidden");
      const txtHermano = document.getElementById("mc-txt-hermano");
      if (txtHermano) txtHermano.innerText = `Agregar actividad hermana (${nombresMismoNivel[nivel]})`;
    }
  }

  if (btnRaiz) btnRaiz.classList.toggle("hidden", !state.proyectoEsGestor || nivel <= 1);
  if (btnResp) btnResp.classList.toggle("hidden", !state.proyectoEsGestor);
  if (btnElim) btnElim.classList.toggle("hidden", !state.proyectoEsGestor);

  if (btnCom) {
    const coms = obtenerComentariosDeActividad(cod);
    btnCom.classList.remove("hidden");
    const txtCom = document.getElementById("mc-txt-comentarios");
    if (txtCom) txtCom.innerText = coms.length > 0 ? `Ver Comentarios (${coms.length})` : "Agregar Comentario";
  }

  let posX = event.clientX, posY = event.clientY;
  if (posX + 480 > window.innerWidth) posX = window.innerWidth - 490;
  if (posY + 230 > window.innerHeight) posY = window.innerHeight - 235;

  if (menu) {
    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;
    menu.classList.remove("hidden");
  }
}

export function abrirMenuContextualVacio(event) {
  if (!state.proyectoEsGestor) return;
  event.preventDefault();
  event.stopPropagation();

  state.codigoFilaSeleccionada = null;
  document.querySelectorAll("#lista-actividades tr").forEach(tr => tr.classList.remove("row-selected"));
  state.actividadContextualSeleccionada = null;

  const menu = document.getElementById("menu-contextual");
  const headerInfo = document.getElementById("mc-header-info");
  if (headerInfo) headerInfo.classList.add("hidden");

  const grupoAgregar = document.getElementById("mc-grupo-agregar");
  const btnRaizDirecto = document.getElementById("mc-btn-raiz-directo");
  const btnResp = document.getElementById("mc-btn-resp");
  const btnElim = document.getElementById("mc-btn-eliminar");
  const btnCom = document.getElementById("mc-btn-comentarios");

  if (grupoAgregar) grupoAgregar.classList.add("hidden");
  if (btnRaizDirecto) btnRaizDirecto.classList.remove("hidden");
  if (btnResp) btnResp.classList.add("hidden");
  if (btnElim) btnElim.classList.add("hidden");
  if (btnCom) btnCom.classList.add("hidden");

  let posX = event.clientX, posY = event.clientY;
  if (posX + 480 > window.innerWidth) posX = window.innerWidth - 490;
  if (posY + 230 > window.innerHeight) posY = window.innerHeight - 235;

  if (menu) {
    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;
    menu.classList.remove("hidden");
  }
}

export function cerrarMenuContextual() {
  document.getElementById("menu-contextual")?.classList.add("hidden");
}

export function ejecutarAccionContextual(accion) {
  const act = state.actividadContextualSeleccionada;
  const cod = act ? act.codigo : null;
  cerrarMenuContextual();

  if (accion === 'agregar_raiz') abrirWizardCreacion(null, "raiz");
  else if (accion === 'agregar_hijo' && cod) abrirWizardCreacion(cod, "hijo");
  else if (accion === 'agregar_hermano' && cod) abrirWizardCreacion(cod, "hermano");
  else if (accion === 'asignar_resp' && cod) editarResponsable(cod);
  else if (accion === 'eliminar' && cod) eliminarActividad(cod);
  else if (accion === 'ver_comentarios' && cod) abrirModalComentarios(cod);
}

// --- MODAL REAL INTERACTIVO DE ASIGNAR RESPONSABLES ---
export async function editarResponsable(cod) {
  if (!state.proyectoEsGestor && state.currentUser.rol !== "ADMIN_TI") {
    alert("Solo un Gestor del Proyecto puede asignar o modificar responsables.");
    return;
  }

  const codLimpio = String(cod).trim().replace(/\.+$/, "");
  state.actividadMultiRespActual = state.actividadesGlobal.find(a => String(a.codigo).trim().replace(/\.+$/, "") === codLimpio);
  if (!state.actividadMultiRespActual) return;

  if (!state.catalogoTrabajadoresGlobal || state.catalogoTrabajadoresGlobal.length === 0) {
    try {
      const resT = await apiFetch("/trabajadores");
      if (resT.ok) state.catalogoTrabajadoresGlobal = await resT.json();
    } catch(e) {}
  }

  const respStr = String(state.actividadMultiRespActual.responsable || "").trim();
  state.responsablesInicialesEdicion = (respStr && respStr !== "No asignado")
    ? (respStr.includes(";") ? respStr.split(";").map(s => s.trim()).filter(Boolean) : [respStr])
    : [];

  state.listaAsignadosModal = [];
  state.responsablesInicialesEdicion.forEach(nom => {
    const tObj = (state.catalogoTrabajadoresGlobal || []).find(t => t.nombre_completo && t.nombre_completo.trim().toLowerCase() === nom.trim().toLowerCase());
    state.listaAsignadosModal.push({
      nombre_completo: nom,
      unidad_organica: tObj ? tObj.unidad_organica : "Personal"
    });
  });

  renderizarListaAsignadosModal();

  const inpBusqResp = document.getElementById("inp-buscar-resp-actividad");
  if (inpBusqResp) inpBusqResp.value = "";
  const sugResp = document.getElementById("sug-responsables-actividad");
  if (sugResp) sugResp.classList.add("hidden");

  const btnGuardarMulti = document.getElementById("btn-guardar-multi-resp");
  if (btnGuardarMulti) {
    btnGuardarMulti.onclick = async () => {
      const seleccionados = state.listaAsignadosModal.map(r => r.nombre_completo.trim()).filter(Boolean);
      const respFinal = seleccionados.length > 0 ? seleccionados.join("; ") : "No asignado";
      const actRef = state.actividadMultiRespActual;
      const codAct = actRef ? actRef.codigo : null;

      cerrarAsignarResponsables();
      if (!actRef) return;

      registrarSnapshotAntesDeAccion(`Asignar responsable en [${codAct}]`);

      actRef.responsable = respFinal;
      poblarFiltroResponsablesDinamico();
      renderizarTabla();
      if (state.vistaProyectoActiva === "kanban") renderizarTableroKanban();
      const boxInspResp = document.getElementById("insp-box-responsables");
      if (boxInspResp && codigoActividadInspectorActual === String(codAct).replace(/\.+$/, "")) {
        boxInspResp.innerText = respFinal;
      }

      try {
        const res = await apiFetch("/actividades/responsable", {
          method: "PUT",
          body: JSON.stringify({
            proyecto_id: parseInt(state.proyectoActualId),
            codigo: String(codAct).trim(),
            responsable: respFinal
          })
        });

        if (res.ok) {
          notificarToast("Responsable(s) asignado(s) y guardado(s) correctamente.", "success");
        }
      } catch (e) {
        alert("Error al guardar responsable.");
      }

      // Evaluación de nuevos responsables para notificar por correo
      const inicialesSet = new Set((state.responsablesInicialesEdicion || []).map(n => n.trim().toLowerCase()));
      const nuevos = seleccionados.filter(nom => !inicialesSet.has(nom.toLowerCase()));

      if (nuevos.length > 0) {
        const mensajeNotif = nuevos.length === 1
          ? `¿Desea enviar una notificación por correo electrónico al nuevo responsable asignado (${nuevos[0]})?`
          : `¿Desea enviar una notificación por correo electrónico a los ${nuevos.length} nuevos responsables asignados (${nuevos.join(", ")})?`;

        const deseaNotificar = await confirmModal(mensajeNotif, "Notificación Institucional", "question");
        if (deseaNotificar) {
          abrirModalNotificacionCorreo(actRef, nuevos);
        }
      }
    };
  }

  document.getElementById("modal-asignar-responsables")?.classList.remove("hidden");
}

export function renderizarListaAsignadosModal() {
  const contenedor = document.getElementById("lista-checkbox-responsables");
  if (!contenedor) return;
  contenedor.innerHTML = "";

  if (state.listaAsignadosModal.length === 0) {
    contenedor.innerHTML = `<p class="text-xs text-gray-400 italic text-center p-3">No hay responsables asignados. Use el buscador superior para agregar trabajadores.</p>`;
    return;
  }

  state.listaAsignadosModal.forEach((r, idx) => {
    contenedor.innerHTML += `
      <div class="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100/80 transition">
        <label class="flex items-center space-x-2.5 cursor-pointer flex-1">
          <input type="checkbox" checked onchange="solicitarDesmarcarResponsable(${idx})" class="rounded text-[#0f2a4a] focus:ring-0">
          <span class="text-xs font-bold text-gray-800">${r.nombre_completo}</span>
        </label>
        <span class="text-[10px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 whitespace-nowrap ml-2">${r.unidad_organica}</span>
      </div>
    `;
  });
}

export async function solicitarDesmarcarResponsable(idx) {
  const r = state.listaAsignadosModal[idx];
  const seguro = await confirmModal(`¿Está seguro de retirar a '${r.nombre_completo}' de esta actividad?`, "Confirmar Retiro", "warning");
  if (seguro) {
    state.listaAsignadosModal.splice(idx, 1);
    notificarToast(`Se retiró a ${r.nombre_completo}.`, "info");
  }
  renderizarListaAsignadosModal();
}

export function autocompletarResponsableActividad(termino) {
  const term = termino.toLowerCase().trim();
  const divSug = document.getElementById("sug-responsables-actividad");
  if (!divSug) return;

  if (!term) {
    divSug.classList.add("hidden");
    return;
  }

  const matches = (state.catalogoTrabajadoresGlobal || []).filter(t => 
    (t.estado === "ACTIVO" || !t.estado) &&
    (t.nombre_completo.toLowerCase().includes(term) || t.unidad_organica.toLowerCase().includes(term))
  );

  divSug.innerHTML = "";
  if (matches.length === 0) {
    divSug.innerHTML = `<div class="p-2.5 text-gray-400 italic">No se encontraron coincidencias para '${termino}'</div>`;
  } else {
    matches.slice(0, 6).forEach(t => {
      const item = document.createElement("div");
      item.className = "p-2.5 hover:bg-teal-50 cursor-pointer flex justify-between items-center transition";
      item.innerHTML = `
        <span class="font-bold text-[#0f2a4a]">${t.nombre_completo}</span>
        <span class="text-[10px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">${t.unidad_organica}</span>
      `;
      item.onclick = () => {
        const yaExiste = state.listaAsignadosModal.some(a => a.nombre_completo.trim().toLowerCase() === t.nombre_completo.trim().toLowerCase());
        if (!yaExiste) {
          state.listaAsignadosModal.push({
            nombre_completo: t.nombre_completo,
            unidad_organica: t.unidad_organica
          });
          renderizarListaAsignadosModal();
          notificarToast(`Agregado: ${t.nombre_completo}`, "success");
        } else {
          alert(`El trabajador ${t.nombre_completo} ya se encuentra asignado.`);
        }
        document.getElementById("inp-buscar-resp-actividad").value = "";
        divSug.classList.add("hidden");
      };
      divSug.appendChild(item);
    });
  }
  divSug.classList.remove("hidden");
}

export function cerrarAsignarResponsables() {
  document.getElementById("modal-asignar-responsables")?.classList.add("hidden");
  state.actividadMultiRespActual = null;
}

// =========================================================================
// MÓDULO DE NOTIFICACIONES Y ALERTAS PREVENTIVAS DE CIERRE
// =========================================================================
export function abrirModalNotificacionCorreo(act, destinatariosNuevos = []) {
  const modDialog = document.getElementById("modal-dialog-imarpe");
  if (modDialog) modDialog.classList.add("hidden");

  state.actividadNotificacionActual = act;
  state.destinatariosNuevosNotificacion = Array.isArray(destinatariosNuevos) ? destinatariosNuevos : [];
  const duracion = parseInt(act.dias) || 1;

  const textoDestinatarios = state.destinatariosNuevosNotificacion.length > 0 
    ? state.destinatariosNuevosNotificacion.join("; ") 
    : (act.responsable || "Personal");

  const txtAct = document.getElementById("notif-txt-actividad");
  if (txtAct) {
    txtAct.innerHTML = `
      <span class="block text-xs font-bold text-[#0f2a4a]">[${act.codigo}] ${act.descripcion}</span>
      <span class="block text-[11px] font-semibold text-emerald-800 mt-0.5">Destinatario(s) nuevo(s): ${textoDestinatarios}</span>
    `;
  }
  
  const txtDur = document.getElementById("notif-txt-duracion");
  if (txtDur) txtDur.innerText = duracion;
  
  const txtFin = document.getElementById("notif-txt-fin");
  if (txtFin) txtFin.innerText = formatearFechaLatina(act.fecha_fin);
  
  const inpCustom = document.getElementById("notif-input-dias-custom");
  if (inpCustom) inpCustom.value = "";

  const contenedor = document.getElementById("notif-contenedor-opciones-dias");
  if (contenedor) {
    contenedor.innerHTML = "";
    const opcionesPredefinidas = [1, 3, 5, 7];
    let opcionesDisponibles = 0;

    opcionesPredefinidas.forEach(diasAntes => {
      if (diasAntes < duracion) {
        opcionesDisponibles++;
        contenedor.innerHTML += `
          <label class="flex items-center space-x-2 p-1.5 rounded hover:bg-teal-50 cursor-pointer font-bold text-gray-700">
            <input type="checkbox" value="${diasAntes}" class="notif-chk-dia rounded text-teal-600 focus:ring-0 cursor-pointer">
            <span>${diasAntes} ${diasAntes === 1 ? 'día' : 'días'} antes</span>
          </label>
        `;
      }
    });

    if (opcionesDisponibles === 0) {
      contenedor.innerHTML = `<p class="col-span-2 text-gray-400 italic text-[11px] text-center">La actividad dura ${duracion} día(s). Solo se registrará la notificación inicial.</p>`;
    }
  }

  document.getElementById("modal-notificacion-correo")?.classList.remove("hidden");
}

export function cerrarModalNotificacionCorreo() {
  document.getElementById("modal-notificacion-correo")?.classList.add("hidden");
  state.actividadNotificacionActual = null;
  state.destinatariosNuevosNotificacion = [];
}

export async function confirmarEnvioNotificaciones() {
  if (!state.actividadNotificacionActual) {
    cerrarModalNotificacionCorreo();
    return;
  }
  
  const duracion = parseInt(state.actividadNotificacionActual.dias) || 1;
  const seleccionados = Array.from(document.querySelectorAll(".notif-chk-dia:checked")).map(cb => parseInt(cb.value));
  const customInput = document.getElementById("notif-input-dias-custom");
  const customVal = customInput ? parseInt(customInput.value) : NaN;

  if (!isNaN(customVal)) {
    if (customVal >= duracion || customVal <= 0) {
      alert(`⚠️ Plazo personalizado inválido:\nEl valor ingresado (${customVal} días) debe ser estrictamente menor a la duración total de la actividad (${duracion} días).`);
      return;
    }
    if (!seleccionados.includes(customVal)) {
      seleccionados.push(customVal);
    }
  }

  const actRef = state.actividadNotificacionActual;
  const nuevosRef = state.destinatariosNuevosNotificacion;

  cerrarModalNotificacionCorreo();

  try {
    const payload = {
      proyecto_id: parseInt(state.proyectoActualId) || 1,
      codigo_actividad: String(actRef.codigo).trim(),
      destinatarios_nuevos: nuevosRef || [],
      dias_recordatorio: seleccionados.sort((a, b) => b - a)
    };

    const res = await apiFetch("/notificaciones/asignacion", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      notificarToast("Notificación procesada y alertas programadas exitosamente.", "success", 4500);
    }
  } catch (e) {
    alert("Error de comunicación con el servidor al programar notificaciones.");
  }
}

// =========================================================================
// ACELERADORES DE FRICCIÓN CERO: QUICK-ADD INLINE Y PEGADO EN LOTE
// =========================================================================

export async function crearActividadRapidaInline() {
  const inp = document.getElementById("input-quick-add-wbs");
  if (!inp) return;
  const desc = inp.value.trim();
  if (!desc) {
    inp.focus();
    return;
  }

  inp.disabled = true;

  try {
    // Calcular el siguiente código Nivel 1 correlativo
    const raices = (state.actividadesGlobal || []).filter(a => !String(a.codigo).replace(/\.+$/, "").includes("."));
    let maxNum = 0;
    raices.forEach(r => {
      const n = parseInt(String(r.codigo).replace(/\.+$/, ""), 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    });
    const nuevoCodigo = String(maxNum + 1);

    // Calcular fecha inicio hábil y fecha fin hábil (3 días por defecto u 8 horas)
    const hoy = new Date();
    const dtIniHabil = sumarDiasHabiles(hoy, 1);
    const duracionDef = (state.proyectoModoDuracion === "hours") ? 8 : 3;
    const dtFinHabil = calcularFechaFinPorModalidad(dtIniHabil, duracionDef, state.proyectoModoDuracion);

    const fIniStr = `${String(dtIniHabil.getDate()).padStart(2, '0')}/${String(dtIniHabil.getMonth() + 1).padStart(2, '0')}/${dtIniHabil.getFullYear()}`;
    const fFinStr = `${String(dtFinHabil.getDate()).padStart(2, '0')}/${String(dtFinHabil.getMonth() + 1).padStart(2, '0')}/${dtFinHabil.getFullYear()}`;

    registrarSnapshotAntesDeAccion(`Creación rápida [${nuevoCodigo}]`);

    const res = await apiFetch(`/actividades`, {
      method: "POST",
      body: JSON.stringify({
        proyecto_id: parseInt(state.proyectoActualId),
        codigo: nuevoCodigo,
        descripcion: desc,
        responsable: state.currentUser?.nombre_completo || "No asignado",
        estado: "No iniciado",
        avance: 0,
        fecha_inicio: fIniStr,
        fecha_fin: fFinStr,
        dias: duracionDef,
        predecesores: ""
      })
    });

    if (res.ok) {
      inp.value = "";
      notificarToast(`Actividad [${nuevoCodigo}] agregada con éxito.`, "success", 2500);
      await sincronizarDatosProyecto(state.proyectoActualId);
      setTimeout(() => document.getElementById("input-quick-add-wbs")?.focus(), 60);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "No se pudo agregar la actividad.");
      inp.disabled = false;
    }
  } catch (e) {
    alert("Error de conexión al crear la actividad.");
    inp.disabled = false;
  }
}

export function abrirModalPegarListaTareas() {
  if (!state.proyectoEsGestor) return;
  if (state.actividadesGlobal && state.actividadesGlobal.length > 0) {
    alert("ℹ️ El proyecto ya cuenta con actividades registradas.\n\nPara evitar sobrescribir su planificación, la opción 'Pegar lista' solo se utiliza en proyectos en blanco (sin actividades). Puede usar la barra inferior de creación rápida para añadir tareas individuales al final.");
    return;
  }
  const txt = document.getElementById("lote-textarea-lineas");
  if (txt) txt.value = "";
  document.getElementById("modal-pegar-lote-tareas")?.classList.remove("hidden");
  setTimeout(() => txt?.focus(), 100);
}

export function cerrarModalPegarListaTareas() {
  document.getElementById("modal-pegar-lote-tareas")?.classList.add("hidden");
}

export async function confirmarPegadoLoteTareas() {
  const txt = document.getElementById("lote-textarea-lineas")?.value || "";
  const diasDef = parseInt(document.getElementById("lote-input-dias")?.value || "3");
  const encadenar = document.getElementById("lote-chk-encadenar")?.checked !== false;

  const lineas = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lineas.length === 0) {
    alert("⚠️ Pegue o escriba al menos una línea de actividad.");
    return;
  }

  cerrarModalPegarListaTareas();

  try {
    const res = await apiFetch(`/proyectos/${state.proyectoActualId}/actividades-lote`, {
      method: "POST",
      body: JSON.stringify({
        proyecto_id: parseInt(state.proyectoActualId),
        lineas: lineas,
        dias_por_defecto: Math.max(1, diasDef),
        encadenar_secuencialmente: encadenar
      })
    });

    if (res.ok) {
      const data = await res.json();
      notificarToast(data.mensaje || "Cronograma generado con éxito.", "success");
      await sincronizarDatosProyecto(state.proyectoActualId);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "No se pudo procesar el lote de actividades.");
    }
  } catch (e) {
    alert("Error de conexión al procesar la lista.");
  }
}

window.crearActividadRapidaInline = crearActividadRapidaInline;
window.abrirModalPegarListaTareas = abrirModalPegarListaTareas;
window.cerrarModalPegarListaTareas = cerrarModalPegarListaTareas;
window.confirmarPegadoLoteTareas = confirmarPegadoLoteTareas;

// =========================================================================
// CONMUTADOR DE 4 VISTAS, CHECK RÁPIDO 1-CLIC Y TABLERO KANBAN (JIRA STYLE)
// =========================================================================

export async function alternarCheckRapidoActividad(cod) {
  const codLimpio = String(cod).replace(/\.+$/, "");
  if (tieneHijos(codLimpio)) return;
  const act = state.actividadesGlobal.find(a => String(a.codigo).replace(/\.+$/, "") === codLimpio);
  if (!act) return;

  const esMio = esResponsableDeActividad(act);
  if (!state.proyectoEsGestor && !esMio) {
    alert("Solo el gestor o el responsable asignado pueden completar esta actividad.");
    renderizarTabla();
    return;
  }

  if (act.estado === "Ejecutado") {
    act.estado = "No iniciado";
    act.avance = 0;
  } else {
    act.estado = "Ejecutado";
    act.avance = 100;
  }

  await guardarCambioDirecto(act);
  notificarToast(
    act.estado === "Ejecutado" ? `✓ Actividad [${codLimpio}] completada al 100%.` : `Actividad [${codLimpio}] reabierta.`,
    act.estado === "Ejecutado" ? "success" : "info",
    2200
  );
}

export function renderizarBarraAvataresEquipoToolbar() {
  const cont = document.getElementById("toolbar-avatares-equipo");
  const selColab = document.getElementById("filtro-responsable-select");
  if (!cont) return;

  const setPersonas = new Set();
  (state.actividadesGlobal || []).forEach(a => {
    const rStr = (a.responsable || "").trim();
    if (rStr && rStr !== "No asignado") {
      rStr.split(";").map(s => s.trim()).filter(Boolean).forEach(p => setPersonas.add(p));
    }
  });

  const lista = Array.from(setPersonas).sort();
  if (lista.length === 0) {
    cont.innerHTML = "";
    return;
  }

  const activoActual = selColab ? selColab.value : "";
  const mostrar = lista.slice(0, 5);
  const ocultos = lista.slice(5);

  const obtenerDatosAvatar = (nom) => {
    const ini = nom.includes(",")
      ? (nom.split(",")[0].trim()[0] + (nom.split(",")[1]?.trim()[0] || "")).toUpperCase()
      : (nom.split(" ")[0][0] + (nom.split(" ")[1]?.[0] || "")).toUpperCase();
    let hash = 0;
    for (let i = 0; i < nom.length; i++) hash = nom.charCodeAt(i) + ((hash << 5) - hash);
    const color = state.coloresAvatar[Math.abs(hash) % state.coloresAvatar.length];
    return { ini, color };
  };

  let htmlAvatares = mostrar.map(nom => {
    const { ini, color } = obtenerDatosAvatar(nom);
    const esActivo = (activoActual === nom);
    const ringClase = esActivo ? "ring-2 ring-teal-500 scale-110 z-20" : "opacity-90 hover:opacity-100 hover:scale-105";

    return `
      <button type="button" onclick="filtrarPorAvatarToolbar('${nom.replace(/'/g, "\\'")}')"
              style="background-color: ${color};"
              class="w-6 h-6 rounded-full text-white text-[9px] font-black border-2 border-white shadow-2xs flex items-center justify-center transition transform cursor-pointer ${ringClase}"
              title="Filtrar tareas de: ${nom}">
        ${ini}
      </button>
    `;
  }).join("");

  if (ocultos.length > 0) {
    const algunoOcultoActivo = ocultos.includes(activoActual);
    const badgeRing = algunoOcultoActivo ? "bg-teal-600 text-white ring-2 ring-teal-500" : "bg-slate-200 hover:bg-slate-300 text-[#0f2a4a]";

    const itemsDropdown = ocultos.map(nom => {
      const { ini, color } = obtenerDatosAvatar(nom);
      const sel = (activoActual === nom);
      return `
        <button type="button" onclick="filtrarPorAvatarToolbar('${nom.replace(/'/g, "\\'")}'); cerrarMenuAvataresExtras();"
                class="w-full text-left px-3 py-1.5 hover:bg-teal-50 flex items-center justify-between space-x-2 transition cursor-pointer ${sel ? 'bg-teal-50/80 font-black text-teal-900' : 'text-gray-700 font-semibold'}">
          <div class="flex items-center space-x-2 min-w-0">
            <span style="background-color: ${color};" class="w-5 h-5 rounded-full text-white text-[8.5px] font-black flex items-center justify-center flex-shrink-0">${ini}</span>
            <span class="text-xs truncate">${nom}</span>
          </div>
          ${sel ? '<span class="text-teal-600 font-black text-xs">✓</span>' : ''}
        </button>
      `;
    }).join("");

    htmlAvatares += `
      <div class="relative inline-block">
        <button type="button" onclick="alternarMenuAvataresExtras(event)"
                class="w-6 h-6 rounded-full text-[9px] font-black border-2 border-white shadow-2xs flex items-center justify-center transition cursor-pointer ${badgeRing}"
                title="Ver ${ocultos.length} colaboradores más">
          +${ocultos.length}
        </button>
        <div id="dropdown-avatares-extras" onclick="event.stopPropagation()" class="hidden absolute left-0 top-full mt-1.5 w-60 bg-white border border-gray-200 rounded-xl shadow-2xl py-1.5 z-[260] max-h-60 overflow-y-auto divide-y divide-gray-50">
          <div class="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Más colaboradores (${ocultos.length})</div>
          ${itemsDropdown}
        </div>
      </div>
    `;
  }

  cont.innerHTML = htmlAvatares;
}

export function filtrarPorAvatarToolbar(nombre) {
  const sel = document.getElementById("filtro-responsable-select");
  if (!sel) return;
  sel.value = (sel.value === nombre) ? "" : nombre;
  aplicarFiltrosGlobales();
  renderizarBarraAvataresEquipoToolbar();
}

export function alternarMenuAvataresExtras(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById("dropdown-avatares-extras");
  if (menu) menu.classList.toggle("hidden");
}

export function cerrarMenuAvataresExtras() {
  document.getElementById("dropdown-avatares-extras")?.classList.add("hidden");
}

if (typeof window !== "undefined") {
  window.addEventListener("click", () => cerrarMenuAvataresExtras());
}

export function cambiarVistaProyecto(modo) {
  // Normalizar cualquier valor antiguo 'split' a 'gantt'
  const modoEfectivo = (modo === "split" || !modo) ? "gantt" : modo;
  state.vistaProyectoActiva = modoEfectivo;
  localStorage.setItem("sprin_vista_proyecto", modoEfectivo);

  ["lista", "kanban", "gantt"].forEach(m => {
    const btn = document.getElementById(`btn-vista-proy-${m}`);
    if (btn) {
      btn.className = (m === modoEfectivo) ? "sprin-view-btn active" : "sprin-view-btn";
    }
  });

  const controlesTiempoGantt = document.getElementById("grupo-controles-tiempo-gantt");
  if (controlesTiempoGantt) {
    if (modoEfectivo === "lista" || modoEfectivo === "kanban") {
      controlesTiempoGantt.classList.add("hidden");
    } else {
      controlesTiempoGantt.classList.remove("hidden");
    }
  }

  const wrapperTablaGantt = document.getElementById("vista-tabla-gantt-wrapper");
  const wrapperKanban = document.getElementById("vista-kanban-wrapper");

  if (modoEfectivo === "kanban") {
    if (wrapperTablaGantt) wrapperTablaGantt.classList.add("hidden");
    if (wrapperKanban) wrapperKanban.classList.remove("hidden");
    renderizarTableroKanban();
    renderizarBarraAvataresEquipoToolbar();
    return;
  }

  if (wrapperKanban) wrapperKanban.classList.add("hidden");
  if (wrapperTablaGantt) wrapperTablaGantt.classList.remove("hidden");

  if (modoEfectivo === "lista") {
    // Vista Lista: Muestra todas las columnas de gestión tabular y oculta el lienzo Gantt
    state.visibilidadColumnas.gantt = false;
    state.visibilidadColumnas.responsable = true;
    state.visibilidadColumnas.estado = true;
    state.visibilidadColumnas.inicio = true;
    state.visibilidadColumnas.fin = true;
    state.visibilidadColumnas.dias = true;
    state.visibilidadColumnas.avance = true;
  } else {
    // Vista Gantt: Muestra el cronograma Gantt y respeta las columnas que el usuario haya activado en "Personalizar columnas"
    state.visibilidadColumnas.gantt = true;
    const configGuardada = JSON.parse(localStorage.getItem("visibilidad_columnas_gantt_custom") || "null");
    if (configGuardada) {
      state.visibilidadColumnas.responsable = configGuardada.responsable !== false;
      state.visibilidadColumnas.estado = Boolean(configGuardada.estado);
      state.visibilidadColumnas.inicio = Boolean(configGuardada.inicio);
      state.visibilidadColumnas.fin = Boolean(configGuardada.fin);
      state.visibilidadColumnas.dias = Boolean(configGuardada.dias);
      state.visibilidadColumnas.avance = Boolean(configGuardada.avance);
    } else {
      // Por defecto en Gantt: Código + Actividad + Responsables + Lienzo Gantt amplio (igual que Jira Timeline)
      state.visibilidadColumnas.responsable = true;
      state.visibilidadColumnas.estado = false;
      state.visibilidadColumnas.inicio = false;
      state.visibilidadColumnas.fin = false;
      state.visibilidadColumnas.dias = false;
      state.visibilidadColumnas.avance = false;
    }
  }

  if (typeof window.aplicarVisibilidadColumnas === "function") {
    window.aplicarVisibilidadColumnas();
  }
  renderizarTabla();
  renderizarBarraAvataresEquipoToolbar();
}

export function alternarFiltroMisActividades() {
  state.filtroSoloMisActividades = !state.filtroSoloMisActividades;
  const btn = document.getElementById("btn-filtro-mis-actividades");

  if (btn) {
    if (state.filtroSoloMisActividades) {
      btn.className = "h-[30px] px-2.5 rounded-lg text-xs font-black bg-teal-600 hover:bg-teal-700 text-white border border-teal-700 transition shadow-2xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap flex-shrink-0";
      notificarToast("Mostrando únicamente tus actividades asignadas.", "info", 2200);
    } else {
      btn.className = "h-[30px] px-2.5 rounded-lg text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap flex-shrink-0";
    }
  }

  aplicarFiltrosGlobales();
  if (state.vistaProyectoActiva === "kanban") {
    renderizarTableroKanban();
  }
}

// --- MOTOR INTERACTIVO DEL TABLERO KANBAN + INSPECTOR INTEGRAL DE ACTIVIDAD ---
let codigoArrastradoKanban = null;
let codigoUltimoSoltadoKanban = null;
let codigoActividadInspectorActual = null;

export function renderizarTableroKanban() {
  const zonaPend = document.getElementById("kanban-dropzone-pendiente");
  const zonaProc = document.getElementById("kanban-dropzone-proceso");
  const zonaEjec = document.getElementById("kanban-dropzone-ejecutado");

  if (!zonaPend || !zonaProc || !zonaEjec) return;
  zonaPend.innerHTML = "";
  zonaProc.innerHTML = "";
  zonaEjec.innerHTML = "";

  const txtBusq = (document.getElementById("filtro-busqueda")?.value || "").toLowerCase().trim();
  const respFiltro = document.getElementById("filtro-responsable-select")?.value || "";

  const operativas = (state.actividadesGlobal || []).filter(act => {
    if (tieneHijos(act.codigo)) return false;
    if (state.filtroEstadoKPI && act.estado !== state.filtroEstadoKPI) return false;
    if (txtBusq && !act.descripcion.toLowerCase().includes(txtBusq) && !act.codigo.toLowerCase().includes(txtBusq)) return false;
    if (respFiltro && !(act.responsable || "").includes(respFiltro)) return false;
    if (state.filtroSoloMisActividades && !esResponsableDeActividad(act)) return false;
    return true;
  });

  let contPend = 0, contProc = 0, contEjec = 0;
  const coloresFase = [
    "bg-teal-100 text-teal-900 border-teal-200",
    "bg-amber-100 text-amber-900 border-amber-200",
    "bg-indigo-100 text-indigo-900 border-indigo-200",
    "bg-purple-100 text-purple-900 border-purple-200",
    "bg-sky-100 text-sky-900 border-sky-200"
  ];

  operativas.forEach(act => {
    const codLimpio = String(act.codigo).replace(/\.+$/, "");
    const raizCod = codLimpio.split(".")[0];
    const madreRaiz = state.actividadesGlobal.find(a => String(a.codigo).replace(/\.+$/, "") === raizCod);
    const nombreFase = (madreRaiz && madreRaiz.codigo !== codLimpio) ? madreRaiz.descripcion : "Actividad Principal";
    const estiloFase = coloresFase[(parseInt(raizCod, 10) || 1) % coloresFase.length];

    const esMio = esResponsableDeActividad(act);
    const puedeEditar = state.proyectoEsGestor || esMio;

    const card = document.createElement("div");
    const animDrop = (codigoUltimoSoltadoKanban === codLimpio) ? "kanban-card-dropped" : "";
    card.className = `kanban-card-item group select-none ${animDrop}`;
    card.dataset.cod = codLimpio;

    if (puedeEditar) {
      card.onmousedown = (e) => iniciarArrastrePunteroKanban(e, card, codLimpio);
    }

    // Doble clic abre la Ficha Inspector Integral de Actividad (estilo Jira / Linear)
    card.ondblclick = () => {
      abrirInspectorActividad(codLimpio);
    };

    const coms = obtenerComentariosDeActividad(codLimpio).length;

    card.innerHTML = `
      <div class="flex items-start justify-between gap-2 mb-2">
        <p class="text-xs font-bold text-slate-800 leading-snug group-hover:text-[#0f2a4a] transition">${act.descripcion}</p>
        <button type="button" onclick="event.stopPropagation(); abrirInspectorActividad('${codLimpio}')" class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-[#0f2a4a] text-xs px-1 rounded transition cursor-pointer flex-shrink-0" title="Abrir ficha completa de la actividad">✏️</button>
      </div>

      <div class="mb-3 flex items-center justify-between gap-1">
        <span class="inline-block text-[9.5px] font-black uppercase px-2 py-0.5 rounded border truncate max-w-[80%] ${estiloFase}" title="Fase: ${nombreFase}">
          ${nombreFase}
        </span>
        <span class="text-[10px] font-black ${act.avance === 100 ? 'text-emerald-700' : (act.avance > 0 ? 'text-blue-700' : 'text-slate-400')}">${act.avance}%</span>
      </div>

      ${act.estado === "En proceso" ? `
        <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-2.5">
          <div class="bg-blue-600 h-1.5 rounded-full transition-all duration-300" style="width: ${act.avance}%"></div>
        </div>
      ` : ''}

      <div class="flex items-center justify-between pt-2 border-t border-slate-100 text-[10.5px] text-slate-500">
        <div class="flex items-center space-x-2">
          <span class="font-mono font-black text-[#0f2a4a] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">${codLimpio}</span>
          <span class="font-semibold" title="Fecha de vencimiento">📅 ${formatearFechaLatina(act.fecha_fin)}</span>
          ${coms > 0 ? `<button onclick="event.stopPropagation(); abrirModalComentarios('${codLimpio}')" class="text-indigo-600 font-black hover:underline cursor-pointer">💬 ${coms}</button>` : ''}
        </div>
        <div onclick="event.stopPropagation(); ${state.proyectoEsGestor ? `editarResponsable('${codLimpio}')` : ''}" title="${act.responsable || 'Sin asignar'}">
          ${obtenerAvatarHTML(act.responsable)}
        </div>
      </div>
    `;

    if (act.estado === "Ejecutado") {
      zonaEjec.appendChild(card);
      contEjec++;
    } else if (act.estado === "En proceso") {
      zonaProc.appendChild(card);
      contProc++;
    } else {
      zonaPend.appendChild(card);
      contPend++;
    }
  });

  codigoUltimoSoltadoKanban = null;

  // Estados vacíos amigables (Empty States) para cada columna del Tablero Kanban
  if (contPend === 0) {
    zonaPend.innerHTML = `
      <div class="flex-1 flex flex-col items-center justify-center text-center p-6 my-auto border-2 border-dashed border-slate-200/80 rounded-xl bg-white/40 select-none pointer-events-none">
        <div class="w-9 h-9 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <p class="text-xs font-bold text-slate-500">Sin actividades por hacer</p>
        <p class="text-[11px] text-slate-400 mt-0.5 max-w-[200px]">No hay tareas pendientes de inicio en esta columna.</p>
      </div>
    `;
  }

  if (contProc === 0) {
    zonaProc.innerHTML = `
      <div class="flex-1 flex flex-col items-center justify-center text-center p-6 my-auto border-2 border-dashed border-blue-200/60 rounded-xl bg-white/40 select-none pointer-events-none">
        <div class="w-9 h-9 rounded-full bg-blue-50 text-blue-400 flex items-center justify-center mb-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p class="text-xs font-bold text-slate-500">Sin actividades en proceso</p>
        <p class="text-[11px] text-slate-400 mt-0.5 max-w-[210px]">Arrastra una actividad aquí cuando inicies su ejecución.</p>
      </div>
    `;
  }

  if (contEjec === 0) {
    zonaEjec.innerHTML = `
      <div class="flex-1 flex flex-col items-center justify-center text-center p-6 my-auto border-2 border-dashed border-emerald-200/60 rounded-xl bg-white/40 select-none pointer-events-none">
        <div class="w-9 h-9 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p class="text-xs font-bold text-slate-500">Sin actividades ejecutadas</p>
        <p class="text-[11px] text-slate-400 mt-0.5 max-w-[210px]">Arrastra una tarjeta aquí al completar el entregable al 100%.</p>
      </div>
    `;
  }

  const bPend = document.getElementById("kanban-count-pendiente");
  const bProc = document.getElementById("kanban-count-proceso");
  const bEjec = document.getElementById("kanban-count-ejecutado");
  if (bPend) bPend.innerText = contPend;
  if (bProc) bProc.innerText = contProc;
  if (bEjec) bEjec.innerText = contEjec;
}

export function iniciarArrastrePunteroKanban(e, cardEl, codLimpio) {
  // Permitir arrastrar desde cualquier parte de la tarjeta excepto si se hizo clic directamente en un botón (✏️ o 💬)
  if (e.button !== 0 || e.target.closest("button")) return;

  const startX = e.clientX;
  const startY = e.clientY;
  let arrastrando = false;
  let canceladoPorEscape = false;
  let ghostEl = null;
  let offsetX = 0;
  let offsetY = 0;
  let zonaSobrevoladaActual = null;

  const zonasDrop = [
    { el: document.getElementById("kanban-dropzone-pendiente"), col: document.getElementById("kanban-dropzone-pendiente")?.closest(".kanban-col"), estado: "No iniciado" },
    { el: document.getElementById("kanban-dropzone-proceso"), col: document.getElementById("kanban-dropzone-proceso")?.closest(".kanban-col"), estado: "En proceso" },
    { el: document.getElementById("kanban-dropzone-ejecutado"), col: document.getElementById("kanban-dropzone-ejecutado")?.closest(".kanban-col"), estado: "Ejecutado" }
  ].filter(z => z.el);

  const limpiarListeners = () => {
    window.removeEventListener("mousemove", alMover);
    window.removeEventListener("mouseup", alSoltar);
    window.removeEventListener("keydown", alPresionarEscape, true);
  };

  const restaurarVisualKanban = () => {
    document.body.classList.remove("is-dragging-row");
    cardEl.classList.remove("is-dragging");
    if (ghostEl) {
      ghostEl.remove();
      ghostEl = null;
    }
    zonasDrop.forEach(z => z.el.classList.remove("drag-over"));
    codigoArrastradoKanban = null;
  };

  const alPresionarEscape = (ev) => {
    if (ev.key === "Escape" && arrastrando) {
      ev.preventDefault();
      ev.stopPropagation();
      canceladoPorEscape = true;
      limpiarListeners();
      restaurarVisualKanban();
      notificarToast("Movimiento de tarjeta cancelado.", "info", 1800);
    }
  };

  const encontrarZonaEnCoordenada = (x, y) => {
    for (const z of zonasDrop) {
      const contenedor = z.col || z.el;
      const r = contenedor.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return z;
      }
    }
    return null;
  };

  const alMover = (ev) => {
    if (canceladoPorEscape) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;

    if (!arrastrando) {
      if (Math.hypot(dx, dy) < 5) return;
      arrastrando = true;
      codigoArrastradoKanban = codLimpio;
      window.getSelection?.()?.removeAllRanges?.();

      const rect = cardEl.getBoundingClientRect();
      offsetX = startX - rect.left;
      offsetY = startY - rect.top;

      ghostEl = cardEl.cloneNode(true);
      ghostEl.style.position = "fixed";
      ghostEl.style.left = "0px";
      ghostEl.style.top = "0px";
      ghostEl.style.width = `${rect.width}px`;
      ghostEl.style.zIndex = "99999";
      ghostEl.style.pointerEvents = "none";
      ghostEl.style.boxShadow = "0 20px 30px -8px rgba(15, 42, 74, 0.32)";
      ghostEl.style.borderColor = "#0d9488";
      ghostEl.style.transition = "none";
      document.body.appendChild(ghostEl);

      cardEl.classList.add("is-dragging");
      document.body.classList.add("is-dragging-row");
    }

    ev.preventDefault();
    ghostEl.style.transform = `translate3d(${ev.clientX - offsetX}px, ${ev.clientY - offsetY}px, 0) rotate(1.5deg)`;

    const nuevaZona = encontrarZonaEnCoordenada(ev.clientX, ev.clientY);

    if (zonaSobrevoladaActual && zonaSobrevoladaActual !== nuevaZona?.el) {
      zonaSobrevoladaActual.classList.remove("drag-over");
    }
    if (nuevaZona) {
      nuevaZona.el.classList.add("drag-over");
      zonaSobrevoladaActual = nuevaZona.el;
    } else {
      zonaSobrevoladaActual = null;
    }
  };

  const alSoltar = async (ev) => {
    limpiarListeners();
    if (!arrastrando || canceladoPorEscape) return;

    const zonaDestino = encontrarZonaEnCoordenada(ev.clientX, ev.clientY);
    restaurarVisualKanban();

    if (zonaDestino) {
      await kanbanSoltarActividad(
        { preventDefault: () => {}, currentTarget: zonaDestino.el, dataTransfer: { getData: () => codLimpio } },
        zonaDestino.estado
      );
    }
  };

  window.addEventListener("mousemove", alMover);
  window.addEventListener("mouseup", alSoltar);
  window.addEventListener("keydown", alPresionarEscape, true);
}

export function kanbanPermitirSoltar(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  if (!e.currentTarget.classList.contains("drag-over")) {
    e.currentTarget.classList.add("drag-over");
  }
}

export function kanbanSalirZona(e) {
  // Evitar parpadeo cuando el cursor pasa sobre elementos hijos dentro de la columna
  if (e.currentTarget.contains(e.relatedTarget)) return;
  e.currentTarget.classList.remove("drag-over");
}

export async function kanbanSoltarActividad(e, nuevoEstado) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");

  const cod = codigoArrastradoKanban || e.dataTransfer.getData("text/plain");
  if (!cod) return;

  const act = state.actividadesGlobal.find(a => String(a.codigo).replace(/\.+$/, "") === cod);
  if (!act || act.estado === nuevoEstado) return;

  if (!state.ejecutandoUndoRedo && state.ultimoSnapshotSincronizado) {
    registrarSnapshotEnPilaUndo(`Mover [${cod}] a ${nuevoEstado}`, state.ultimoSnapshotSincronizado);
  }

  act.estado = nuevoEstado;
  if (nuevoEstado === "Ejecutado") act.avance = 100;
  else if (nuevoEstado === "No iniciado") act.avance = 0;
  else if (nuevoEstado === "En proceso" && (act.avance === 0 || act.avance === 100)) act.avance = 50;

  codigoUltimoSoltadoKanban = cod;

  // Actualización optimista instantánea sin parpadeo de recarga completa
  recalcularJerarquiaWBS();
  renderizarTableroKanban();
  renderizarTabla();

  try {
    await apiFetch(`/actividades`, {
      method: "POST",
      body: JSON.stringify({
        proyecto_id: parseInt(state.proyectoActualId) || 1,
        codigo: String(act.codigo).trim(),
        descripcion: String(act.descripcion || "").trim(),
        responsable: String(act.responsable || "No asignado").trim(),
        estado: act.estado,
        avance: parseInt(act.avance) || 0,
        fecha_inicio: formatearFechaLatina(act.fecha_inicio),
        fecha_fin: formatearFechaLatina(act.fecha_fin),
        dias: parseInt(act.dias) || 1,
        predecesores: String(act.predecesores || "").trim()
      })
    });
    state.ultimoSnapshotSincronizado = clonarActividadesSnapshot(state.actividadesGlobal);
    notificarToast(`✓ [${cod}] movida a "${nuevoEstado}" (${act.avance}%)`, "success", 2000);
  } catch (err) {
    console.error("Error sincronizando Kanban:", err);
  }
}

// --- VENTANA EDITAR ACTIVIDAD (CON PORCENTAJE EDITABLE EXACTO Y SUB-MODALES APILADOS) ---
export function abrirInspectorActividad(cod) {
  const codLimpio = String(cod).replace(/\.+$/, "");
  const act = state.actividadesGlobal.find(a => String(a.codigo).replace(/\.+$/, "") === codLimpio);
  if (!act) return;

  codigoActividadInspectorActual = codLimpio;
  const esMio = esResponsableDeActividad(act);
  const puedeEditarTodo = state.proyectoEsGestor;
  const puedeEditarProgreso = state.proyectoEsGestor || esMio;

  const raizCod = codLimpio.split(".")[0];
  const madreRaiz = state.actividadesGlobal.find(a => String(a.codigo).replace(/\.+$/, "") === raizCod);
  const nombreFase = (madreRaiz && madreRaiz.codigo !== codLimpio) ? `Fase: [${raizCod}] ${madreRaiz.descripcion}` : "Actividad operativa";

  document.getElementById("insp-badge-codigo").innerText = `[${codLimpio}]`;
  document.getElementById("insp-txt-fase-madre").innerText = nombreFase;

  const inpDesc = document.getElementById("insp-input-descripcion");
  inpDesc.value = act.descripcion || "";
  inpDesc.disabled = !puedeEditarTodo;

  const selEst = document.getElementById("insp-select-estado");
  const rngAv = document.getElementById("insp-range-avance");
  const numAv = document.getElementById("insp-input-avance-num");

  const avActual = parseInt(act.avance) || 0;
  selEst.value = act.estado || "No iniciado";
  selEst.disabled = !puedeEditarProgreso;
  rngAv.value = avActual;
  rngAv.disabled = !puedeEditarProgreso;
  if (numAv) {
    numAv.value = avActual;
    numAv.disabled = !puedeEditarProgreso;
  }

  const esHoras = (state.proyectoModoDuracion === "hours");
  document.getElementById("insp-lbl-unidad-duracion").innerText = esHoras ? "⏱️ Duración (horas)" : "⏱️ Duración (días hábiles)";

  const inpIni = document.getElementById("insp-input-inicio");
  const inpDias = document.getElementById("insp-input-dias");
  const inpFin = document.getElementById("insp-input-fin");

  inpIni.value = formatearFechaISO(act.fecha_inicio);
  inpDias.value = act.dias || 1;
  inpFin.value = formatearFechaISO(act.fecha_fin);

  inpIni.disabled = !puedeEditarTodo;
  inpDias.disabled = !puedeEditarTodo;
  inpFin.disabled = !puedeEditarTodo || esHoras;

  document.getElementById("insp-box-responsables").innerText = act.responsable || "No asignado";
  document.getElementById("insp-box-predecesoras").innerText = act.predecesores ? `Depende de: [${act.predecesores}]` : "Sin predecesoras";

  // Abrir sub-modales ENCIMA sin cerrar "Editar actividad"
  const btnResp = document.getElementById("insp-btn-cambiar-resp");
  btnResp.classList.toggle("hidden", !puedeEditarTodo);
  btnResp.onclick = () => {
    editarResponsable(codLimpio);
  };

  const btnPred = document.getElementById("insp-btn-cambiar-pred");
  btnPred.classList.toggle("hidden", !puedeEditarTodo);
  btnPred.onclick = () => {
    if (typeof window.abrirModalDependencias === "function") window.abrirModalDependencias(codLimpio);
  };

  const coms = obtenerComentariosDeActividad(codLimpio).length;
  const btnComs = document.getElementById("insp-btn-comentarios");
  btnComs.innerText = `💬 Comentarios (${coms})`;
  btnComs.onclick = () => {
    abrirModalComentarios(codLimpio);
  };

  const btnElim = document.getElementById("insp-btn-eliminar");
  btnElim.classList.toggle("hidden", !puedeEditarTodo);
  btnElim.onclick = async () => {
    cerrarInspectorActividad();
    await eliminarActividad(codLimpio);
    if (state.vistaProyectoActiva === "kanban") renderizarTableroKanban();
  };

  document.getElementById("modal-inspector-actividad")?.classList.remove("hidden");
}

export function sincronizarEstadoAvanceInspector(origen) {
  const selEst = document.getElementById("insp-select-estado");
  const rngAv = document.getElementById("insp-range-avance");
  const numAv = document.getElementById("insp-input-avance-num");
  if (!selEst || !rngAv || !numAv) return;

  if (origen === "estado") {
    if (selEst.value === "Ejecutado") {
      rngAv.value = 100;
      numAv.value = 100;
    } else if (selEst.value === "No iniciado") {
      rngAv.value = 0;
      numAv.value = 0;
    } else if (selEst.value === "En proceso" && (parseInt(numAv.value) === 0 || parseInt(numAv.value) === 100)) {
      rngAv.value = 50;
      numAv.value = 50;
    }
  } else if (origen === "rango") {
    const val = parseInt(rngAv.value) || 0;
    numAv.value = val;
    if (val === 100) selEst.value = "Ejecutado";
    else if (val === 0) selEst.value = "No iniciado";
    else selEst.value = "En proceso";
  } else if (origen === "numero") {
    if (numAv.value === "") return;
    let val = parseInt(numAv.value);
    if (isNaN(val)) return;
    if (val > 100) { val = 100; numAv.value = 100; }
    if (val < 0) { val = 0; numAv.value = 0; }
    rngAv.value = val;
    if (val === 100) selEst.value = "Ejecutado";
    else if (val === 0) selEst.value = "No iniciado";
    else selEst.value = "En proceso";
  }
}

export function normalizarInputPorcentajeInspector() {
  const numAv = document.getElementById("insp-input-avance-num");
  const rngAv = document.getElementById("insp-range-avance");
  if (!numAv || !rngAv) return;
  let val = parseInt(numAv.value);
  if (isNaN(val) || val < 0) val = 0;
  if (val > 100) val = 100;
  numAv.value = val;
  rngAv.value = val;
  sincronizarEstadoAvanceInspector("numero");
}

export function refrescarDatosInspectorActivo() {
  if (!codigoActividadInspectorActual) return;
  const act = state.actividadesGlobal.find(a => String(a.codigo).replace(/\.+$/, "") === codigoActividadInspectorActual);
  if (!act) return;
  const boxResp = document.getElementById("insp-box-responsables");
  const boxPred = document.getElementById("insp-box-predecesoras");
  const inpIni = document.getElementById("insp-input-inicio");
  const inpFin = document.getElementById("insp-input-fin");
  const btnComs = document.getElementById("insp-btn-comentarios");

  if (boxResp) boxResp.innerText = act.responsable || "No asignado";
  if (boxPred) boxPred.innerText = act.predecesores ? `Depende de: [${act.predecesores}]` : "Sin predecesoras";
  if (inpIni && act.fecha_inicio) inpIni.value = formatearFechaISO(act.fecha_inicio);
  if (inpFin && act.fecha_fin) inpFin.value = formatearFechaISO(act.fecha_fin);
  if (btnComs) {
    const coms = obtenerComentariosDeActividad(codigoActividadInspectorActual).length;
    btnComs.innerText = `💬 Comentarios (${coms})`;
  }
}

export function recalcularPlazoEnInspector(campoModificado) {
  const inpIni = document.getElementById("insp-input-inicio");
  const inpDias = document.getElementById("insp-input-dias");
  const inpFin = document.getElementById("insp-input-fin");
  if (!inpIni?.value) return;

  const dtIni = new Date(inpIni.value + "T00:00:00");
  if (campoModificado === "inicio" || campoModificado === "dias") {
    const d = Math.max(1, parseFloat(inpDias.value) || 1);
    const nuevoFin = calcularFechaFinPorModalidad(dtIni, d, state.proyectoModoDuracion);
    inpFin.value = nuevoFin.toISOString().split("T")[0];
  } else if (campoModificado === "fin" && inpFin.value) {
    const dtFin = new Date(inpFin.value + "T00:00:00");
    if (dtFin < dtIni) {
      inpFin.value = inpIni.value;
      inpDias.value = 1;
      return;
    }
    const diasHab = contarDiasHabilesEntre(dtIni, dtFin);
    inpDias.value = (state.proyectoModoDuracion === "hours") ? diasHab * 8 : diasHab;
  }
}

export function cerrarInspectorActividad() {
  document.getElementById("modal-inspector-actividad")?.classList.add("hidden");
  codigoActividadInspectorActual = null;
}

export async function guardarCambiosInspectorActividad() {
  if (!codigoActividadInspectorActual) return;
  const act = state.actividadesGlobal.find(a => String(a.codigo).replace(/\.+$/, "") === codigoActividadInspectorActual);
  if (!act) return;

  const nuevaDesc = document.getElementById("insp-input-descripcion")?.value.trim();
  if (!nuevaDesc) {
    alert("La descripción de la actividad no puede quedar vacía.");
    return;
  }

  normalizarInputPorcentajeInspector();

  if (state.proyectoEsGestor) {
    act.descripcion = nuevaDesc;
    const valIni = document.getElementById("insp-input-inicio")?.value;
    const valFin = document.getElementById("insp-input-fin")?.value;
    const valDias = parseInt(document.getElementById("insp-input-dias")?.value) || 1;
    if (valIni) act.fecha_inicio = formatearFechaLatina(valIni);
    if (valFin) act.fecha_fin = formatearFechaLatina(valFin);
    act.dias = Math.max(1, valDias);
  }

  act.estado = document.getElementById("insp-select-estado")?.value || act.estado;
  act.avance = parseInt(document.getElementById("insp-input-avance-num")?.value) || 0;

  cerrarInspectorActividad();
  await guardarCambioDirecto(act);
  if (state.vistaProyectoActiva === "kanban") renderizarTableroKanban();
  notificarToast(`✓ Actividad [${act.codigo}] actualizada correctamente.`, "success", 2400);
}

// =========================================================================
// MOTOR DE DESHACER (CTRL+Z) Y REHACER (CTRL+Y) DE FRICCIÓN CERO CON COMENTARIOS AMARRADOS
// =========================================================================

const LIMITE_PILA_UNDO = 20;

export function clonarActividadesSnapshot(lista) {
  return (lista || []).map(a => ({
    proyecto_id: parseInt(state.proyectoActualId) || 1,
    codigo: String(a.codigo || "").replace(/\.+$/, ""),
    descripcion: String(a.descripcion || ""),
    responsable: String(a.responsable || "No asignado"),
    estado: String(a.estado || "No iniciado"),
    avance: parseInt(a.avance) || 0,
    fecha_inicio: String(a.fecha_inicio || ""),
    fecha_fin: String(a.fecha_fin || ""),
    dias: parseInt(a.dias) || 1,
    predecesores: String(a.predecesores || "")
  }));
}

export function clonarComentariosSnapshot(listaComs) {
  return (listaComs || []).map(c => ({
    id: c.id,
    proyecto_id: parseInt(state.proyectoActualId) || 1,
    codigo_actividad: String(c.codigo_actividad || "").replace(/\.+$/, ""),
    usuario_id: c.usuario_id,
    autor_nombre: String(c.autor_nombre || ""),
    autor_unidad: String(c.autor_unidad || ""),
    texto: String(c.texto || ""),
    fecha_creacion: String(c.fecha_creacion || ""),
    fecha_edicion: c.fecha_edicion || null
  }));
}

export function registrarSnapshotEnPilaUndo(etiqueta, snapshotPrevio, comentariosPrevios = null) {
  if (state.ejecutandoUndoRedo || !snapshotPrevio) return;
  if (!state.undoStack) state.undoStack = [];
  if (!state.redoStack) state.redoStack = [];

  const comsFoto = clonarComentariosSnapshot(comentariosPrevios !== null ? comentariosPrevios : state.comentariosGlobal);
  const serialPrevio = JSON.stringify({ a: snapshotPrevio, c: comsFoto });
  const ultimoItem = state.undoStack.length > 0 ? state.undoStack[state.undoStack.length - 1] : null;
  const topeActual = ultimoItem ? JSON.stringify({ a: ultimoItem.actividades, c: ultimoItem.comentarios || [] }) : null;
  if (serialPrevio === topeActual) return;

  state.undoStack.push({
    etiqueta: etiqueta || "Acción",
    actividades: JSON.parse(JSON.stringify(snapshotPrevio)),
    comentarios: comsFoto
  });

  if (state.undoStack.length > LIMITE_PILA_UNDO) {
    state.undoStack.shift();
  }
  state.redoStack = [];
  actualizarBotonesUndoRedoUI();
}

export function registrarSnapshotAntesDeAccion(etiqueta) {
  if (state.ejecutandoUndoRedo) return;
  const fotoActs = clonarActividadesSnapshot(state.actividadesGlobal);
  const fotoComs = clonarComentariosSnapshot(state.comentariosGlobal);
  registrarSnapshotEnPilaUndo(etiqueta, fotoActs, fotoComs);
}

export function actualizarBotonesUndoRedoUI() {
  const btnUndo = document.getElementById("btn-undo-proy");
  const btnRedo = document.getElementById("btn-redo-proy");

  const tieneUndo = (state.undoStack && state.undoStack.length > 0);
  const tieneRedo = (state.redoStack && state.redoStack.length > 0);

  if (btnUndo) {
    btnUndo.disabled = !tieneUndo;
    btnUndo.className = tieneUndo
      ? "h-[24px] w-[26px] rounded flex items-center justify-center text-[#0f2a4a] hover:bg-white hover:text-teal-700 shadow-2xs cursor-pointer transition"
      : "h-[24px] w-[26px] rounded flex items-center justify-center text-slate-400 opacity-40 cursor-not-allowed transition";
    btnUndo.title = tieneUndo
      ? `Deshacer: ${state.undoStack[state.undoStack.length - 1].etiqueta} (Ctrl + Z)`
      : "Deshacer última acción (Ctrl + Z)";
  }

  if (btnRedo) {
    btnRedo.disabled = !tieneRedo;
    btnRedo.className = tieneRedo
      ? "h-[24px] w-[26px] rounded flex items-center justify-center text-[#0f2a4a] hover:bg-white hover:text-teal-700 shadow-2xs cursor-pointer transition"
      : "h-[24px] w-[26px] rounded flex items-center justify-center text-slate-400 opacity-40 cursor-not-allowed transition";
    btnRedo.title = tieneRedo
      ? `Rehacer: ${state.redoStack[state.redoStack.length - 1].etiqueta} (Ctrl + Y)`
      : "Rehacer acción (Ctrl + Y)";
  }
}

export async function ejecutarDeshacerProyecto() {
  if (!state.proyectoActualId || state.ejecutandoUndoRedo || !state.undoStack || state.undoStack.length === 0) return;

  state.ejecutandoUndoRedo = true;
  const itemUndo = state.undoStack.pop();

  // Guardar foto actual (actividades + comentarios) en la pila de Rehacer (Redo)
  state.redoStack.push({
    etiqueta: itemUndo.etiqueta,
    actividades: clonarActividadesSnapshot(state.actividadesGlobal),
    comentarios: clonarComentariosSnapshot(state.comentariosGlobal)
  });

  try {
    const res = await apiFetch(`/proyectos/${state.proyectoActualId}/restaurar-snapshot`, {
      method: "POST",
      body: JSON.stringify({
        etiqueta_accion: itemUndo.etiqueta,
        operacion: "DESHACER",
        actividades: itemUndo.actividades,
        comentarios: itemUndo.comentarios || []
      })
    });

    if (res.ok) {
      await sincronizarDatosProyecto(state.proyectoActualId);
      state.ultimoSnapshotSincronizado = clonarActividadesSnapshot(state.actividadesGlobal);
      if (state.vistaProyectoActiva === "kanban") renderizarTableroKanban();
      notificarToast(`↶ Deshecho: ${itemUndo.etiqueta}`, "info", 2200);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "No se pudo deshacer la acción.");
    }
  } catch (e) {
    console.error("Error en Deshacer:", e);
  } finally {
    state.ejecutandoUndoRedo = false;
    actualizarBotonesUndoRedoUI();
  }
}

export async function ejecutarRehacerProyecto() {
  if (!state.proyectoActualId || state.ejecutandoUndoRedo || !state.redoStack || state.redoStack.length === 0) return;

  state.ejecutandoUndoRedo = true;
  const itemRedo = state.redoStack.pop();

  // Guardar foto actual (actividades + comentarios) de vuelta en la pila de Deshacer (Undo)
  state.undoStack.push({
    etiqueta: itemRedo.etiqueta,
    actividades: clonarActividadesSnapshot(state.actividadesGlobal),
    comentarios: clonarComentariosSnapshot(state.comentariosGlobal)
  });

  try {
    const res = await apiFetch(`/proyectos/${state.proyectoActualId}/restaurar-snapshot`, {
      method: "POST",
      body: JSON.stringify({
        etiqueta_accion: itemRedo.etiqueta,
        operacion: "REHACER",
        actividades: itemRedo.actividades,
        comentarios: itemRedo.comentarios || []
      })
    });

    if (res.ok) {
      await sincronizarDatosProyecto(state.proyectoActualId);
      state.ultimoSnapshotSincronizado = clonarActividadesSnapshot(state.actividadesGlobal);
      if (state.vistaProyectoActiva === "kanban") renderizarTableroKanban();
      notificarToast(`↷ Rehecho: ${itemRedo.etiqueta}`, "info", 2200);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "No se pudo rehacer la acción.");
    }
  } catch (e) {
    console.error("Error en Rehacer:", e);
  } finally {
    state.ejecutandoUndoRedo = false;
    actualizarBotonesUndoRedoUI();
  }
}

// Escucha global inteligente de teclado para Ctrl+Z y Ctrl+Y / Ctrl+Shift+Z
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    const dashboard = document.getElementById("view-dashboard");
    if (!dashboard || dashboard.classList.contains("hidden")) return;

    // Si el usuario está escribiendo dentro de un input, textarea o select, respetar el Ctrl+Z nativo del texto
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) {
      return;
    }

    // No disparar si hay algún modal abierto por encima
    const hayModalAbierto = Array.from(document.querySelectorAll(".fixed")).some(el =>
      el.id && el.id.startsWith("modal-") && !el.classList.contains("hidden")
    );
    if (hayModalAbierto) return;

    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        ejecutarDeshacerProyecto();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        ejecutarRehacerProyecto();
      }
    }
  });
}

// Exposición de funciones clave al ámbito global
window.cambiarVistaProyecto = cambiarVistaProyecto;
window.alternarFiltroMisActividades = alternarFiltroMisActividades;
window.alternarCheckRapidoActividad = alternarCheckRapidoActividad;
window.renderizarBarraAvataresEquipoToolbar = renderizarBarraAvataresEquipoToolbar;
window.filtrarPorAvatarToolbar = filtrarPorAvatarToolbar;
window.alternarMenuAvataresExtras = alternarMenuAvataresExtras;
window.cerrarMenuAvataresExtras = cerrarMenuAvataresExtras;
window.filtrarPorEstadoKPI = filtrarPorEstadoKPI;
window.renderizarTableroKanban = renderizarTableroKanban;
window.kanbanPermitirSoltar = kanbanPermitirSoltar;
window.kanbanSalirZona = kanbanSalirZona;
window.kanbanSoltarActividad = kanbanSoltarActividad;
window.ejecutarDeshacerProyecto = ejecutarDeshacerProyecto;
window.ejecutarRehacerProyecto = ejecutarRehacerProyecto;
window.actualizarBotonesUndoRedoUI = actualizarBotonesUndoRedoUI;
window.registrarSnapshotAntesDeAccion = registrarSnapshotAntesDeAccion;
window.abrirInspectorActividad = abrirInspectorActividad;
window.cerrarInspectorActividad = cerrarInspectorActividad;
window.sincronizarEstadoAvanceInspector = sincronizarEstadoAvanceInspector;
window.normalizarInputPorcentajeInspector = normalizarInputPorcentajeInspector;
window.refrescarDatosInspectorActivo = refrescarDatosInspectorActivo;
window.recalcularPlazoEnInspector = recalcularPlazoEnInspector;
window.guardarCambiosInspectorActividad = guardarCambiosInspectorActividad;