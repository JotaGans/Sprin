import { state } from "../../core/state.js";
import { parsearFechaUniversal } from "../../core/ui-dialogs.js";
import { renderizarTabla } from "./project-wbs.js";

export function obtenerListaResponsablesAsignados(responsablesStr) {
  if (!responsablesStr || responsablesStr === "No asignado" || responsablesStr === "-" || String(responsablesStr).trim() === "") return [];
  const str = String(responsablesStr).trim();
  if (str.includes(";")) return str.split(";").map(s => s.trim()).filter(Boolean);
  return [str];
}

export function obtenerAvatarHTML(responsablesStr) {
  const listaNombres = obtenerListaResponsablesAsignados(responsablesStr);
  if (listaNombres.length === 0) {
    return `<div class="w-6 h-6 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center text-[10px] font-bold mx-auto" title="Sin responsable">?</div>`;
  }

  let avataresHTML = "";
  const maxMostrar = 2;
  const mostrar = listaNombres.slice(0, maxMostrar);
  const restantes = listaNombres.length - maxMostrar;

  mostrar.forEach(nom => {
    let iniciales = "";
    if (nom.includes(",")) {
      const partes = nom.split(",");
      const apellido = partes[0].trim().split(" ")[0];
      const nombre = partes[1] ? partes[1].trim().split(" ")[0] : "";
      iniciales = (apellido[0] + (nombre ? nombre[0] : "")).toUpperCase();
    } else {
      const partes = nom.split(" ");
      iniciales = (partes[0][0] + (partes[1] ? partes[1][0] : "")).toUpperCase();
    }

    let hash = 0;
    for (let i = 0; i < nom.length; i++) hash = nom.charCodeAt(i) + ((hash << 5) - hash);
    const colorBg = state.coloresAvatar[Math.abs(hash) % state.coloresAvatar.length];

    avataresHTML += `<div class="avatar-circle" style="background-color: ${colorBg};">${iniciales}</div>`;
  });

  if (restantes > 0) {
    avataresHTML += `<div class="avatar-circle bg-gray-600 text-[9px] font-black">+${restantes}</div>`;
  }

  return `<div class="avatar-group cursor-pointer">${avataresHTML}</div>`;
}

export function obtenerMiniAvataresGanttHTML(responsablesStr) {
  const listaNombres = obtenerListaResponsablesAsignados(responsablesStr);
  if (listaNombres.length === 0) return "";

  let avataresHTML = "";
  const maxMostrar = 2;
  const mostrar = listaNombres.slice(0, maxMostrar);
  const restantes = listaNombres.length - maxMostrar;

  mostrar.forEach(nom => {
    let iniciales = "";
    if (nom.includes(",")) {
      const partes = nom.split(",");
      const apellido = partes[0].trim().split(" ")[0];
      const nombre = partes[1] ? partes[1].trim().split(" ")[0] : "";
      iniciales = (apellido[0] + (nombre ? nombre[0] : "")).toUpperCase();
    } else {
      const partes = nom.split(" ");
      iniciales = (partes[0][0] + (partes[1] ? partes[1][0] : "")).toUpperCase();
    }

    let hash = 0;
    for (let i = 0; i < nom.length; i++) hash = nom.charCodeAt(i) + ((hash << 5) - hash);
    const colorBg = state.coloresAvatar[Math.abs(hash) % state.coloresAvatar.length];

    avataresHTML += `<div class="gantt-avatar-circle" style="background-color: ${colorBg};">${iniciales}</div>`;
  });

  if (restantes > 0) {
    avataresHTML += `<div class="gantt-avatar-circle bg-gray-700 text-[7px] font-black">+${restantes}</div>`;
  }

  return `<div class="inline-flex items-center ml-1.5 align-middle select-none">${avataresHTML}</div>`;
}

export function construirCalendarioAnual() {
  const anioActual = new Date().getFullYear();
  let minAnio = anioActual, maxAnio = anioActual;

  if (state.actividadesGlobal && state.actividadesGlobal.length > 0) {
    state.actividadesGlobal.forEach(a => {
      const dtIni = parsearFechaUniversal(a.fecha_inicio);
      const dtFin = parsearFechaUniversal(a.fecha_fin);
      if (dtIni) minAnio = Math.min(minAnio, dtIni.getFullYear());
      if (dtFin) maxAnio = Math.max(maxAnio, dtFin.getFullYear());
    });
  }

  state.diasTotalesAnio = [];
  state.semanasTotales = [];

  let currDia = new Date(minAnio, 0, 1);
  const finCalendario = new Date(maxAnio + 1, 11, 31);
  const ahora = new Date();
  ahora.setHours(0, 0, 0, 0);

  while (currDia <= finCalendario) {
    const dNum = currDia.getDate();
    const mIdx = currDia.getMonth();
    const yNum = currDia.getFullYear();
    const esHoy = (currDia.getTime() === ahora.getTime());

    state.diasTotalesAnio.push({
      fecha: new Date(currDia),
      dia: String(dNum).padStart(2, '0'),
      mes: mIdx,
      mesNombre: state.nombresMeses[mIdx],
      anio: yNum,
      diaSemana: currDia.getDay(),
      esHoy: esHoy
    });
    currDia.setDate(currDia.getDate() + 1);
  }

  let currSem = new Date(minAnio, 0, 1);
  while (currSem.getDay() !== 1) currSem.setDate(currSem.getDate() - 1);
  let nroSemGlobal = 1;

  while (currSem <= finCalendario || currSem.getFullYear() <= maxAnio + 1) {
    const dLunes = currSem.getDate();
    const mIndex = currSem.getMonth();
    const yIndex = currSem.getFullYear();
    const fechaIniSem = new Date(currSem);
    const fechaFinSem = new Date(currSem.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    const esSemanaActual = (ahora >= fechaIniSem && ahora <= fechaFinSem);

    if (esSemanaActual) state.indiceSemanaHoy = nroSemGlobal - 1;

    state.semanasTotales.push({
      nro: nroSemGlobal,
      fechaLunes: fechaIniSem,
      fechaDomingo: fechaFinSem,
      dia: String(dLunes).padStart(2, '0'),
      mes: mIndex,
      mesNombre: state.nombresMeses[mIndex],
      anio: yIndex,
      esHoy: esSemanaActual
    });

    currSem.setDate(currSem.getDate() + 7);
    nroSemGlobal++;
    if (currSem > finCalendario && currSem.getDay() === 1) break;
  }
}

// Función auxiliar para obtener la ventana de tiempo según el modo y el offset del scroll
function calcularVentanaTemporal() {
  const modo = state.modoZoom || "semanas";
  const offset = Math.max(0, state.semanaInicioIndex || 0);

  if (modo === "dias") {
    const ventanaDias = 28;
    const maxOffset = Math.max(0, state.diasTotalesAnio.length - ventanaDias);
    const startIdx = Math.min(maxOffset, offset * 7);
    const dias = state.diasTotalesAnio.slice(startIdx, startIdx + ventanaDias);
    if (!dias.length) return null;
    const tIni = dias[0].fecha.getTime();
    const ultDia = dias[dias.length - 1].fecha;
    const tFin = new Date(ultDia.getFullYear(), ultDia.getMonth(), ultDia.getDate(), 23, 59, 59).getTime();
    return { modo, items: dias, tIni, tFin, duracion: tFin - tIni };
  }

  if (modo === "meses") {
    // 1 unidad de scroll = 1 mes desplazado
    const baseYear = new Date().getFullYear();
    const startMonthTotal = (baseYear * 12) + Math.floor(offset / 4);
    const mesesItems = [];
    for (let i = 0; i < 12; i++) {
      const currentMonthTotal = startMonthTotal + i;
      const y = Math.floor(currentMonthTotal / 12);
      const m = currentMonthTotal % 12;
      mesesItems.push({ anio: y, mes: m, nombre: state.nombresMeses[m].substring(0, 3) });
    }
    const tIni = new Date(mesesItems[0].anio, mesesItems[0].mes, 1).getTime();
    const tFin = new Date(mesesItems[11].anio, mesesItems[11].mes + 1, 0, 23, 59, 59).getTime();
    return { modo, items: mesesItems, tIni, tFin, duracion: tFin - tIni };
  }

  if (modo === "trimestres") {
    // 1 unidad de scroll = 1 trimestre desplazado
    const baseYear = new Date().getFullYear();
    const startQTotal = (baseYear * 4) + Math.floor(offset / 12);
    const trimestresItems = [];
    for (let i = 0; i < 8; i++) {
      const currQ = startQTotal + i;
      const y = Math.floor(currQ / 4);
      const q = (currQ % 4) + 1;
      trimestresItems.push({ anio: y, q: `T${q}`, startMonth: (q - 1) * 3 });
    }
    const tIni = new Date(trimestresItems[0].anio, trimestresItems[0].startMonth, 1).getTime();
    const tFin = new Date(trimestresItems[7].anio, trimestresItems[7].startMonth + 3, 0, 23, 59, 59).getTime();
    return { modo, items: trimestresItems, tIni, tFin, duracion: tFin - tIni };
  }

  if (modo === "semestres") {
    // 1 unidad de scroll = 1 semestre desplazado
    const baseYear = new Date().getFullYear();
    const startSTotal = (baseYear * 2) + Math.floor(offset / 24);
    const semestresItems = [];
    for (let i = 0; i < 6; i++) {
      const currS = startSTotal + i;
      const y = Math.floor(currS / 2);
      const s = (currS % 2) + 1;
      semestresItems.push({ anio: y, s: `S${s}`, startMonth: (s - 1) * 6 });
    }
    const tIni = new Date(semestresItems[0].anio, semestresItems[0].startMonth, 1).getTime();
    const tFin = new Date(semestresItems[5].anio, semestresItems[5].startMonth + 6, 0, 23, 59, 59).getTime();
    return { modo, items: semestresItems, tIni, tFin, duracion: tFin - tIni };
  }

  // Semanas (modo por defecto)
  const ventanaSemanas = 16;
  const maxOffset = Math.max(0, state.semanasTotales.length - ventanaSemanas);
  const startIdx = Math.min(maxOffset, offset);
  const semanas = state.semanasTotales.slice(startIdx, startIdx + ventanaSemanas);
  if (!semanas.length) return null;
  const tIni = semanas[0].fechaLunes.getTime();
  const tFin = new Date(semanas[semanas.length - 1].fechaDomingo).getTime();
  return { modo: "semanas", items: semanas, tIni, tFin, duracion: tFin - tIni };
}

export function renderizarCabeceraGantt() {
  const divMeses = document.getElementById("gantt-header-meses");
  const divSemanas = document.getElementById("gantt-header-semanas");
  if (!divMeses || !divSemanas) return;

  divMeses.innerHTML = "";
  divSemanas.innerHTML = "";

  const ventana = calcularVentanaTemporal();
  if (!ventana) return;

  if (ventana.modo === "dias") {
    const gruposMes = [];
    let mesActual = null, mesNombreSolo = null, anioSolo = null, contador = 0;

    ventana.items.forEach(d => {
      const label = `${d.mesNombre} ${d.anio}`;
      if (mesActual === null || mesActual !== label) {
        if (mesActual !== null) gruposMes.push({ nombreCompleto: mesActual, count: contador });
        mesActual = label;
        contador = 1;
      } else contador++;
    });
    if (mesActual !== null) gruposMes.push({ nombreCompleto: mesActual, count: contador });

    gruposMes.forEach(g => {
      const pct = (g.count / ventana.items.length) * 100;
      divMeses.innerHTML += `<div style="width: ${pct}%;" class="text-center font-black border-r border-[#1c335a] text-[10px] tracking-wide text-teal-200 overflow-hidden whitespace-nowrap truncate px-0.5">${g.nombreCompleto}</div>`;
    });

    ventana.items.forEach(d => {
      const esFinSemana = (d.diaSemana === 0 || d.diaSemana === 6);
      const claseHoy = d.esHoy ? "bg-teal-500 text-white font-black rounded-xs shadow" : (esFinSemana ? "text-gray-400 bg-blue-950/40" : "text-teal-300 opacity-90");
      divSemanas.innerHTML += `<div class="flex-1 text-center py-0.5 border-r border-[#1c335a] text-[9px] font-mono overflow-hidden whitespace-nowrap ${claseHoy}">${d.dia}</div>`;
    });
    return;
  }

  if (ventana.modo === "semanas") {
    const gruposMes = [];
    let mesActual = null, contador = 0;

    ventana.items.forEach(s => {
      const label = `${s.mesNombre} ${s.anio}`;
      if (mesActual === null || mesActual !== label) {
        if (mesActual !== null) gruposMes.push({ nombreCompleto: mesActual, count: contador });
        mesActual = label;
        contador = 1;
      } else contador++;
    });
    if (mesActual !== null) gruposMes.push({ nombreCompleto: mesActual, count: contador });

    gruposMes.forEach(g => {
      const pct = (g.count / ventana.items.length) * 100;
      divMeses.innerHTML += `<div style="width: ${pct}%;" class="text-center font-bold border-r border-[#1c335a] text-[10px] overflow-hidden whitespace-nowrap truncate px-0.5">${g.nombreCompleto}</div>`;
    });

    ventana.items.forEach(s => {
      const claseHoy = s.esHoy ? "header-semana-actual rounded-sm shadow" : "opacity-90";
      divSemanas.innerHTML += `<div class="flex-1 text-center py-0.5 border-r border-[#1c335a] text-[9px] font-mono overflow-hidden whitespace-nowrap ${claseHoy}">${s.dia}</div>`;
    });
    return;
  }

  if (ventana.modo === "meses") {
    const aniosUnicos = [...new Set(ventana.items.map(m => m.anio))];
    aniosUnicos.forEach(y => {
      const count = ventana.items.filter(m => m.anio === y).length;
      const pct = (count / ventana.items.length) * 100;
      divMeses.innerHTML += `<div style="width: ${pct}%;" class="text-center font-black border-r border-[#1c335a] text-[10px] text-teal-200 tracking-widest">${y}</div>`;
    });

    const mesActualNum = new Date().getMonth();
    const anioActualNum = new Date().getFullYear();

    ventana.items.forEach(m => {
      const esHoy = (m.anio === anioActualNum && m.mes === mesActualNum);
      const claseHoy = esHoy ? "bg-teal-500 text-white font-black" : "text-teal-200";
      divSemanas.innerHTML += `<div class="flex-1 text-center py-0.5 border-r border-[#1c335a] text-[9.5px] font-bold overflow-hidden ${claseHoy}">${m.nombre}</div>`;
    });
    return;
  }

  if (ventana.modo === "trimestres") {
    const aniosUnicos = [...new Set(ventana.items.map(t => t.anio))];
    aniosUnicos.forEach(y => {
      const count = ventana.items.filter(t => t.anio === y).length;
      const pct = (count / ventana.items.length) * 100;
      divMeses.innerHTML += `<div style="width: ${pct}%;" class="text-center font-black border-r border-[#1c335a] text-[10px] text-teal-200">${y}</div>`;
    });

    ventana.items.forEach(t => {
      divSemanas.innerHTML += `<div class="flex-1 text-center py-0.5 border-r border-[#1c335a] text-[9.5px] font-bold text-teal-200">${t.q}</div>`;
    });
    return;
  }

  if (ventana.modo === "semestres") {
    const aniosUnicos = [...new Set(ventana.items.map(s => s.anio))];
    aniosUnicos.forEach(y => {
      const count = ventana.items.filter(s => s.anio === y).length;
      const pct = (count / ventana.items.length) * 100;
      divMeses.innerHTML += `<div style="width: ${pct}%;" class="text-center font-black border-r border-[#1c335a] text-[10px] text-teal-200">${y}</div>`;
    });

    ventana.items.forEach(s => {
      divSemanas.innerHTML += `<div class="flex-1 text-center py-0.5 border-r border-[#1c335a] text-[9.5px] font-bold text-teal-200">${s.s}</div>`;
    });
  }
}

export function renderizarGanttFila(act, esMadre, codLimpio) {
  const ventana = calcularVentanaTemporal();
  if (!ventana) return "";

  const tInicioVisible = ventana.tIni;
  const tFinVisible = ventana.tFin;
  const duracionVisibleMs = ventana.duracion;

  const mostrarAvatares = (state.visibilidadColumnas.avatares_gantt !== false);
  const mostrarPorcentajes = (state.visibilidadColumnas.porcentajes_gantt !== false);

  // 1. Líneas guía verticales continuas de arriba a abajo + Columna Hoy destacada
  let divisionesHTML = "";
  if (ventana.modo === "dias") {
    divisionesHTML = ventana.items.map(d => {
      const esFinde = (d.diaSemana === 0 || d.diaSemana === 6);
      const bgCol = d.esHoy ? "bg-teal-500/15 border-r-2 border-r-teal-500/60" : (esFinde ? "bg-slate-100/70 border-r border-slate-200/50" : "border-r border-slate-200/50");
      return `<div class="flex-1 h-full ${bgCol}"></div>`;
    }).join("");
  } else if (ventana.modo === "semanas") {
    divisionesHTML = ventana.items.map(s => `<div class="flex-1 h-full border-r border-slate-200/60 ${s.esHoy ? 'bg-teal-500/12 border-r-2 border-r-teal-500/50' : ''}"></div>`).join("");
  } else {
    divisionesHTML = ventana.items.map(() => `<div class="flex-1 h-full border-r border-slate-200/60"></div>`).join("");
  }

  const dtIniObj = parsearFechaUniversal(act.fecha_inicio);
  const dtFinObj = parsearFechaUniversal(act.fecha_fin);
  let barraOElementoHTML = "";

  if (dtIniObj && dtFinObj) {
    const dtIni = dtIniObj.getTime();
    const dtFin = new Date(dtFinObj.getFullYear(), dtFinObj.getMonth(), dtFinObj.getDate(), 23, 59, 59).getTime();

    if (dtFin >= tInicioVisible && dtIni <= tFinVisible) {
      const startClamped = Math.max(dtIni, tInicioVisible);
      const endClamped = Math.min(dtFin, tFinVisible);
      const leftPct = Math.min(100, Math.max(0, ((startClamped - tInicioVisible) / duracionVisibleMs) * 100));
      const widthPct = Math.min(100 - leftPct, Math.max(2.2, ((endClamped - startClamped) / duracionVisibleMs) * 100));
      const esBarraAncha = widthPct >= 8.5;
      const tienePredecesor = Boolean(act.predecesores && String(act.predecesores).trim() !== "");
      const tooltipBarra = `[${codLimpio}] ${act.descripcion} | ${act.fecha_inicio} al ${act.fecha_fin} (${act.avance}%) ${tienePredecesor ? '| Predecesoras: ' + act.predecesores : ''} — Clic para actualizar estado`;

      if (esMadre) {
        // Barra Resumen de Fase Madre (Estilo Bracket Ejecutivo con progreso interno)
        barraOElementoHTML = `
          <div class="absolute top-2 bottom-2 z-10 gantt-bar-interactive" style="left: ${leftPct}%; width: ${widthPct}%;" title="${tooltipBarra}">
            <div class="w-full h-full bg-[#0f2a4a] rounded-md shadow-xs relative overflow-hidden flex items-center justify-between px-2">
              <div class="absolute top-0 bottom-0 left-0 bg-teal-500/35 transition-all duration-300" style="width: ${act.avance}%;"></div>
              <span class="relative z-10 text-[9.5px] font-bold text-teal-200 truncate pr-2">${esBarraAncha ? act.descripcion : ''}</span>
              ${mostrarPorcentajes ? `<span class="relative z-10 text-[9.5px] font-black text-white bg-black/25 px-1.5 py-0.2 rounded">${act.avance}%</span>` : ''}
            </div>
          </div>
        `;
      } else {
        // Barra Operativa Estilo Jira Timeline (Verde Esmeralda = Ejecutado, Azul Brillante = En Proceso, Gris Pizarra = Por Hacer)
        const esActividadCritica = state.capaCpmActiva && state.datosCpmGlobal?.actividadesCriticas?.has(codLimpio);
        let bgBarra = "#64748b"; // Por Hacer (Slate elegante estilo Jira)
        let bgProgreso = "#475569";

        if (state.capaCpmActiva) {
          bgBarra = esActividadCritica ? "#dc2626" : "#94a3b8";
          bgProgreso = esActividadCritica ? "#b91c1c" : "#64748b";
        } else if (act.estado === "Ejecutado") {
          bgBarra = "#10b981"; // Verde Jira
          bgProgreso = "#059669";
        } else if (act.estado === "En proceso") {
          bgBarra = "#2563eb"; // Azul Jira
          bgProgreso = "#1d4ed8";
        }

        // Avatar circular integrado dentro de la barra a la izquierda (como en Jira)
        const listaResp = obtenerListaResponsablesAsignados(act.responsable);
        let avatarInternoHTML = "";
        if (mostrarAvatares && listaResp.length > 0 && widthPct >= 4.2) {
          const primerNom = listaResp[0];
          const ini = primerNom.includes(",")
            ? (primerNom.split(",")[0].trim()[0] + (primerNom.split(",")[1]?.trim()[0] || "")).toUpperCase()
            : (primerNom.split(" ")[0][0] + (primerNom.split(" ")[1]?.[0] || "")).toUpperCase();
          avatarInternoHTML = `
            <span class="w-5 h-5 rounded-full bg-white/95 text-[#0f2a4a] font-black text-[8.5px] flex items-center justify-center shadow-xs flex-shrink-0 border border-white" title="${act.responsable}">
              ${ini}
            </span>
          `;
        }

        // Iconos de estado y enlace de dependencia a la derecha dentro de la barra
        const checkDoneHTML = act.estado === "Ejecutado" ? `<span class="text-[10px] font-black text-white drop-shadow-2xs">✓</span>` : "";
        const linkDepHTML = tienePredecesor ? `<span class="text-[9.5px] text-white/90" title="Predecesora: ${act.predecesores}">🔗</span>` : "";
        const opacidadCpm = (state.capaCpmActiva && !esActividadCritica) ? "opacity-40" : "opacity-100";

        barraOElementoHTML = `
          <div onclick="event.stopPropagation(); editarEstado('${codLimpio}')"
               ondblclick="event.stopPropagation(); editarFechaFin('${codLimpio}')"
               class="absolute top-1.5 bottom-1.5 z-10 rounded-md shadow-xs overflow-hidden flex items-center justify-between px-1.5 gantt-bar-interactive ${opacidadCpm}"
               style="left: ${leftPct}%; width: ${widthPct}%; background-color: ${bgBarra};"
               title="${tooltipBarra}">
            
            <!-- Relleno sutil de porcentaje cuando está En Proceso -->
            ${act.estado === "En proceso" && act.avance > 0 ? `<div class="absolute inset-y-0 left-0 pointer-events-none" style="width: ${act.avance}%; background-color: ${bgProgreso};"></div>` : ''}

            <!-- Izquierda: Avatar integrado + Nombre corto si la barra es ancha -->
            <div class="relative z-10 flex items-center space-x-1.5 min-w-0 overflow-hidden">
              ${avatarInternoHTML}
              ${esBarraAncha ? `<span class="text-[10px] font-bold text-white truncate drop-shadow-2xs">${act.descripcion}</span>` : ''}
            </div>

            <!-- Derecha: Porcentaje, Check de completado e Icono de dependencia -->
            <div class="relative z-10 flex items-center space-x-1 flex-shrink-0 pl-1">
              ${mostrarPorcentajes && widthPct >= 6.0 && act.avance > 0 && act.avance < 100 ? `<span class="text-[9px] font-black text-white/95 bg-black/20 px-1 rounded">${act.avance}%</span>` : ''}
              ${checkDoneHTML}
              ${linkDepHTML}
            </div>
          </div>
        `;
      }
    }
  }

  return `
    <div class="gantt-row-canvas">
      <div class="absolute inset-0 flex pointer-events-none">${divisionesHTML}</div>
      ${barraOElementoHTML}
    </div>
  `;
}

export function autoAjustarSemanaInicio() {
  if (!state.actividadesGlobal || state.actividadesGlobal.length === 0) {
    irASemanaActual();
    return;
  }

  let minTimestamp = null;
  state.actividadesGlobal.forEach(a => {
    const dt = parsearFechaUniversal(a.fecha_inicio);
    if (dt) {
      const t = dt.getTime();
      if (minTimestamp === null || t < minTimestamp) minTimestamp = t;
    }
  });

  if (minTimestamp !== null && state.semanasTotales.length > 0) {
    let indexEncontrado = -1;
    for (let i = 0; i < state.semanasTotales.length; i++) {
      const tLunes = new Date(state.semanasTotales[i].fechaLunes).setHours(0, 0, 0, 0);
      const tDomingo = new Date(state.semanasTotales[i].fechaDomingo).setHours(23, 59, 59, 999);
      if (minTimestamp >= tLunes && minTimestamp <= tDomingo) {
        indexEncontrado = i;
        break;
      }
    }
    fijarSemanaInicio(indexEncontrado >= 0 ? Math.max(1, indexEncontrado) : 1);
  } else {
    irASemanaActual();
  }
}

export function irAInicioProyecto() {
  fijarSemanaInicio(1);
}

export function irASemanaActual() {
  const ahora = new Date().getTime();
  let indexHoy = state.semanasTotales.findIndex(s => {
    const tIni = new Date(s.fechaLunes).setHours(0, 0, 0, 0);
    const tFin = new Date(s.fechaDomingo).setHours(23, 59, 59, 999);
    return ahora >= tIni && ahora <= tFin;
  });
  fijarSemanaInicio(indexHoy >= 0 ? Math.max(1, indexHoy) : 1);
}

export function fijarSemanaInicio(val) {
  let num = parseInt(val);
  if (isNaN(num) || num < 1) num = 1;
  state.semanaInicioIndex = num - 1;
  const input = document.getElementById("input-semana-inicio");
  if (input) input.value = num;
  renderizarCabeceraGantt();
  renderizarTabla();
}

export function cambiarSemanaInicio(delta) {
  const baseActual = (state.semanaInicioIndex || 0) + 1;
  let val = baseActual + delta;
  if (val < 1) val = 1;
  fijarSemanaInicio(val);
}

export function desplazarGanttPorEscala(direccion) {
  const dir = direccion > 0 ? 1 : -1;
  let salto = 1;
  if (state.modoZoom === "meses") salto = 4;
  else if (state.modoZoom === "trimestres") salto = 12;
  else if (state.modoZoom === "semestres") salto = 24;
  cambiarSemanaInicio(dir * salto);
}

window.desplazarGanttPorEscala = desplazarGanttPorEscala;

export function fijarModoZoomDirecto(modo) {
  state.modoZoom = modo;
  const labelEscala = document.getElementById("txt-escala-activa-label");
  if (labelEscala) labelEscala.innerText = modo.charAt(0).toUpperCase() + modo.slice(1);

  const boxSem = document.getElementById("box-input-semana");
  if (boxSem) {
    if (modo === "dias" || modo === "semanas") {
      boxSem.classList.remove("sem-oculto");
    } else {
      boxSem.classList.add("sem-oculto");
    }
  }

  renderizarCabeceraGantt();
  renderizarTabla();
}