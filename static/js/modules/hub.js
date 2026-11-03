import { state } from "../core/state.js";
import { apiFetch } from "../core/api.js";
import { notificarToast, confirmModal, formatearFechaLatina, formatearFechaISO, abrirInputCustom } from "../core/ui-dialogs.js";
import { cargarCatalogoUnidades } from "./admin-ti.js";

const SVG_OJO_ABIERTO = `
  <svg class="w-4 h-4 text-gray-500 hover:text-[#0f2a4a] transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
`;

const SVG_OJO_CERRADO = `
  <svg class="w-4 h-4 text-amber-600 hover:text-amber-800 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
  </svg>
`;

let filtroSaludActivoHub = "";
let modoRadarHub = "equipo"; // 'equipo' | 'mio'

export async function cargarHubProyectos() {
  if (!state.token) return;

  document.getElementById("view-login")?.classList.add("hidden");

  try {
    const promesasHub = [apiFetch("/proyectos")];

    if (typeof window.cargarMisPendientesServidor === "function") {
      promesasHub.push(window.cargarMisPendientesServidor().catch(() => null));
    }

    if (!state.catalogoUnidadesGlobal || state.catalogoUnidadesGlobal.length === 0) {
      promesasHub.push(
        apiFetch("/unidades-organicas")
          .then(r => r.ok ? r.json() : [])
          .then(d => { state.catalogoUnidadesGlobal = d; })
          .catch(() => null)
      );
    }

    const [res] = await Promise.all(promesasHub);
    if (!res || !res.ok) throw new Error("Error al cargar proyectos");
    state.proyectosUsuarioGlobal = await res.json();
    sessionStorage.setItem("sprin_cache_proyectos_hub", JSON.stringify(state.proyectosUsuarioGlobal));

    // Seleccionar automáticamente el modo inicial del Radar según el rol del usuario
    const tieneRolDirectivoOGestor = state.currentUser?.rol === "ADMIN_TI" ||
      (state.proyectosUsuarioGlobal || []).some(p => p.es_gestor === 1 || p.rol_efectivo === "AUTORIDAD" || p.rol_efectivo === "GESTOR");
    modoRadarHub = tieneRolDirectivoOGestor ? "equipo" : "mio";

    const badgePerfil = document.getElementById("hub-badge-perfil-activo");
    if (badgePerfil) {
      const esAutoridad = (state.proyectosUsuarioGlobal || []).some(p => p.rol_efectivo === "AUTORIDAD");
      if (state.currentUser?.rol === "ADMIN_TI") badgePerfil.innerHTML = `${SVG_ROL_GESTOR}<span>Supervisión Global TI</span>`;
      else if (esAutoridad) badgePerfil.innerHTML = `${SVG_ROL_AUTORIDAD}<span>Supervisión Directiva (${state.currentUser?.unidad_organica || 'ROF'})</span>`;
      else if (tieneRolDirectivoOGestor) badgePerfil.innerHTML = `${SVG_ROL_GESTOR}<span>Gestión de Proyectos (${state.currentUser?.unidad_organica || 'IMARPE'})</span>`;
      else badgePerfil.innerText = `Panel Operativo (${state.currentUser?.unidad_organica || 'IMARPE'})`;
    }

    inicializarScrollTopHub();

    inicializarFiltrosHub();
    actualizarKPIsHub(state.proyectosUsuarioGlobal);
    renderizarRadarPreventivoHub();
    aplicarConmutadorVistaHub();
    filtrarProyectosHub();
  } catch (err) {
    console.error("Error al cargar Hub:", err);
  } finally {
    document.getElementById("view-hub")?.classList.remove("hidden");
  }
}

export function actualizarKPIsHub(lista) {
  const visibles = (lista || []).filter(p => !state.idsProyectosOcultos.has(p.id));
  const total = visibles.length;
  const sumaAvance = visibles.reduce((acc, p) => acc + (p.avance_global || 0), 0);
  const promAvance = total > 0 ? Math.round(sumaAvance / total) : 0;

  const enPlazo = visibles.filter(p => p.salud_proyecto === "EN_PLAZO" || p.salud_proyecto === "COMPLETADO").length;
  const porVencer = visibles.filter(p => p.salud_proyecto === "ATENCION").length;
  const vencidos = visibles.filter(p => p.salud_proyecto === "CRITICO").length;

  const elTotal = document.getElementById("hub-kpi-total-proy");
  const elProm = document.getElementById("hub-kpi-prom-avance");
  const elBarra = document.getElementById("hub-kpi-prom-barra");
  const elPlazo = document.getElementById("hub-kpi-en-plazo");
  const elPorVenc = document.getElementById("hub-kpi-por-vencer");
  const elVenc = document.getElementById("hub-kpi-vencidos");

  if (elTotal) elTotal.innerText = total;
  if (elProm) elProm.innerText = `${promAvance}%`;
  if (elBarra) elBarra.style.width = `${promAvance}%`;
  if (elPlazo) elPlazo.innerText = enPlazo;
  if (elPorVenc) elPorVenc.innerText = porVencer;
  if (elVenc) elVenc.innerText = vencidos;
}

export function hubFiltrarPorSalud(saludKey) {
  if (!saludKey || filtroSaludActivoHub === saludKey) {
    filtroSaludActivoHub = "";
  } else {
    filtroSaludActivoHub = saludKey;
  }

  const mapaCards = {
    "EN_PLAZO": { id: "hub-card-kpi-plazo", cls: "kpi-pill-active-emerald" },
    "ATENCION": { id: "hub-card-kpi-atencion", cls: "kpi-pill-active-amber" },
    "CRITICO": { id: "hub-card-kpi-critico", cls: "kpi-pill-active-rose" }
  };

  Object.entries(mapaCards).forEach(([key, conf]) => {
    const el = document.getElementById(conf.id);
    if (el) {
      el.classList.remove("kpi-pill-active-emerald", "kpi-pill-active-amber", "kpi-pill-active-rose");
      if (filtroSaludActivoHub === key) el.classList.add(conf.cls);
    }
  });

  filtrarProyectosHub();
}

export function cambiarModoRadarHub(nuevoModo) {
  modoRadarHub = nuevoModo;
  renderizarRadarPreventivoHub();
}

const SVG_CARPETA_PROY = `<svg class="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>`;

const SVG_EDIFICIO_UO = `<svg class="w-3.5 h-3.5 text-teal-700 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>`;

const SVG_ENGRANAJE_PROC = `<svg class="w-3.5 h-3.5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`;

const SVG_ROL_GESTOR = `<svg class="w-3 h-3 text-amber-700 mr-1 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>`;

const SVG_ROL_AUTORIDAD = `<svg class="w-3 h-3 text-purple-700 mr-1 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" /></svg>`;

export function renderizarRadarPreventivoHub() {
  const listaContenedor = document.getElementById("hub-radar-lista-items");
  const badgeEquipo = document.getElementById("hub-radar-badge-equipo");
  const badgeMio = document.getElementById("hub-radar-badge-mio");
  const badgeResumenHeader = document.getElementById("hub-radar-badge-resumen-header");
  const btnEquipo = document.getElementById("btn-radar-modo-equipo");
  const btnMio = document.getElementById("btn-radar-modo-mio");
  const icoEquipo = document.getElementById("ico-radar-modo-equipo");
  if (!listaContenedor) return;

  const qFiltro = (document.getElementById("hub-radar-input-filtro")?.value || "").toLowerCase().trim();

  const proyectosConAlertas = [];
  let totalActividadesEnAlertaGlobal = 0;
  const tareasMias = [];

  (state.proyectosUsuarioGlobal || []).forEach(p => {
    if (state.idsProyectosOcultos.has(p.id)) return;
    const esGestorProy = (p.es_gestor === 1 || p.es_gestor === true || state.currentUser?.rol === "ADMIN_TI") && p.rol_efectivo !== "AUTORIDAD";

    const listaAlertasProy = p.alertas_responsables || [];
    if (listaAlertasProy.length > 0) {
      totalActividadesEnAlertaGlobal += listaAlertasProy.length;
      const vencidas = listaAlertasProy.filter(a => a.tipo_alerta === "VENCIDA");
      const porVencer = listaAlertasProy.filter(a => a.tipo_alerta === "POR_VENCER");
      const masCritica = listaAlertasProy[0];

      proyectosConAlertas.push({
        proyecto_id: p.id,
        proyecto_nombre: p.nombre,
        unidad_organica: p.unidad_organica || "S/U",
        es_gestor: esGestorProy,
        vencidas_count: vencidas.length,
        por_vencer_count: porVencer.length,
        total_alertas: listaAlertasProy.length,
        peor_dias: masCritica.dias_restantes ?? 999,
        top_alerta: masCritica,
        todas_alertas: listaAlertasProy
      });
    }

    (p.mis_tareas_proyecto || []).forEach(t => {
      tareasMias.push({
        ...t,
        proyecto_id: p.id,
        proyecto_nombre: p.nombre,
        unidad_organica: p.unidad_organica || "S/U",
        es_gestor: esGestorProy,
        tipo_alerta: (t.dias_restantes !== null && t.dias_restantes < 0)
          ? "VENCIDA"
          : ((t.dias_restantes !== null && t.dias_restantes <= 5) ? "POR_VENCER" : "EN_PLAZO")
      });
    });
  });

  proyectosConAlertas.sort((a, b) => a.peor_dias - b.peor_dias);
  tareasMias.sort((a, b) => (a.dias_restantes ?? 999) - (b.dias_restantes ?? 999));

  if (badgeEquipo) badgeEquipo.innerText = proyectosConAlertas.length;
  if (badgeMio) badgeMio.innerText = tareasMias.length;

  // Fondo institucional #0f2a4a al estar activo, pero con peso tipográfico estilizado (font-semibold en lugar de font-black)
  const clsActivo = "px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#0f2a4a] text-white shadow-2xs transition cursor-pointer flex items-center space-x-1.5 tracking-wide";
  const clsInactivo = "px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-600 hover:text-[#0f2a4a] transition cursor-pointer flex items-center space-x-1.5";
  if (btnEquipo) btnEquipo.className = (modoRadarHub === "equipo") ? clsActivo : clsInactivo;
  if (btnMio) btnMio.className = (modoRadarHub === "mio") ? clsActivo : clsInactivo;

  if (icoEquipo) {
    icoEquipo.setAttribute(
      "class",
      modoRadarHub === "equipo"
        ? "w-3.5 h-3.5 text-amber-300 flex-shrink-0 transition-colors"
        : "w-3.5 h-3.5 text-amber-600 flex-shrink-0 transition-colors"
    );
  }

  if (modoRadarHub === "equipo") {
    const filtradosProy = proyectosConAlertas.filter(item => {
      if (!qFiltro) return true;
      const concatAlertas = item.todas_alertas.map(a => `${a.codigo} ${a.descripcion} ${a.responsable}`).join(" ");
      const texto = `${item.proyecto_nombre} ${item.unidad_organica} ${concatAlertas}`.toLowerCase();
      return texto.includes(qFiltro);
    });

    if (badgeResumenHeader) {
      const nProy = filtradosProy.length;
      const txtProy = nProy === 1 ? "1 proyecto con alerta" : `${nProy} proyectos con alertas`;
      const txtActs = totalActividadesEnAlertaGlobal === 1 ? "1 actividad" : `${totalActividadesEnAlertaGlobal} actividades`;
      badgeResumenHeader.innerText = `${txtProy} (${txtActs})`;
    }

    if (filtradosProy.length === 0) {
      listaContenedor.innerHTML = `
        <div class="col-span-full py-3.5 px-4 text-center text-slate-500 font-semibold text-xs bg-slate-50 rounded-xl border border-slate-200/70">
          Ningún proyecto bajo su supervisión presenta actividades vencidas ni próximas a vencer en los siguientes 5 días.
        </div>
      `;
      listaContenedor.style.maxHeight = "82px";
      return;
    }

    listaContenedor.innerHTML = filtradosProy.map(item => {
      const al = item.top_alerta;
      const tieneVencidas = item.vencidas_count > 0;
      const tienePorVencer = item.por_vencer_count > 0;

      const partesEstado = [];
      if (tieneVencidas) {
        partesEstado.push(`<span class="text-rose-600 font-black">${item.vencidas_count} ${item.vencidas_count === 1 ? 'vencida' : 'vencidas'}</span>`);
      }
      if (tienePorVencer) {
        partesEstado.push(`<span class="text-amber-700 font-black">${item.por_vencer_count} por vencer</span>`);
      }
      const resumenEstadoHTML = partesEstado.join('<span class="text-slate-300 mx-1">·</span>');
      const dotColor = tieneVencidas ? "bg-rose-500" : "bg-amber-500";

      // Fondo sutil diferenciado: rojo muy tenue si tiene vencidas; amarillo/ámbar muy tenue si solo tiene por vencer
      const estiloFondoMiniCard = tieneVencidas
        ? "bg-rose-50/40 border-rose-200/75 hover:bg-rose-50/65 hover:border-rose-300"
        : "bg-amber-50/40 border-amber-200/75 hover:bg-amber-50/65 hover:border-amber-300";

      const respLista = (al.responsable || "No asignado").split(";").map(s => s.trim()).filter(Boolean);
      const primerResp = respLista[0] || "No asignado";
      const apellidoCorto = primerResp.includes(",") ? primerResp.split(",")[0].trim() : primerResp.split(" ")[0];
      const ini = primerResp.includes(",")
        ? (primerResp.split(",")[0].trim()[0] + (primerResp.split(",")[1]?.trim()[0] || "")).toUpperCase()
        : (primerResp.split(" ")[0][0] + (primerResp.split(" ")[1]?.[0] || "")).toUpperCase();

      const nomProyEscapado = (item.proyecto_nombre || "").replace(/'/g, "\\'");
      const extrasCount = item.total_alertas - 1;
      const jsonAlertasAttr = encodeURIComponent(JSON.stringify(item.todas_alertas));

      return `
        <div ondblclick="ingresarAlProyecto(${item.proyecto_id}, '${nomProyEscapado}', ${item.es_gestor})"
             title="Doble clic para ingresar al proyecto"
             class="h-[82px] px-3 py-2 rounded-xl border ${estiloFondoMiniCard} flex flex-col justify-between transition relative cursor-pointer select-none shadow-2xs">
          
          <div class="flex items-center justify-between gap-1">
            <div class="flex items-center space-x-1.5 min-w-0 text-[10.5px] truncate">
              <span class="w-2 h-2 rounded-full ${dotColor} flex-shrink-0"></span>
              <div class="truncate">${resumenEstadoHTML}</div>
            </div>

            <div class="flex items-center space-x-1 flex-shrink-0">
              <span class="text-[9px] font-black text-[#0f2a4a] bg-white px-1.5 py-0.2 rounded border border-slate-200/90">${item.unidad_organica}</span>
              
              <button type="button"
                      onclick="event.stopPropagation()"
                      onmouseenter="mostrarTooltipProyectoAlertasHub(event, this)"
                      onmouseleave="ocultarTooltipMiniCardRadar()"
                      data-proy="${(item.proyecto_nombre || '').replace(/"/g, '&quot;')}"
                      data-uo="${item.unidad_organica}"
                      data-alertas="${jsonAlertasAttr}"
                      class="w-4 h-4 rounded-full bg-white hover:bg-[#0f2a4a] text-slate-500 hover:text-white border border-slate-200/90 flex items-center justify-center text-[9.5px] font-serif italic font-black transition cursor-help">
                i
              </button>

              <button type="button" onclick="event.stopPropagation(); ingresarAlProyecto(${item.proyecto_id}, '${nomProyEscapado}', ${item.es_gestor})" class="w-4 h-4 rounded bg-[#0f2a4a] hover:bg-teal-600 text-white font-black text-[10px] flex items-center justify-center transition cursor-pointer" title="Abrir proyecto">
                →
              </button>
            </div>
          </div>

          <div class="text-[10.5px] font-bold text-[#0f2a4a]/85 truncate flex items-center space-x-1.5 leading-none">
            ${SVG_CARPETA_PROY}
            <span class="truncate">${item.proyecto_nombre}</span>
          </div>

          <div class="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-200/60 text-[10.5px] leading-none">
            <div class="flex items-center space-x-1 flex-shrink-0">
              <span class="w-4 h-4 rounded-full bg-[#0f2a4a] text-white text-[8px] font-black flex items-center justify-center flex-shrink-0">${ini || '?'}</span>
              <span class="font-bold text-slate-700 truncate max-w-[72px]">${apellidoCorto}</span>
            </div>
            <div class="flex items-center space-x-1 min-w-0 flex-1 justify-end">
              <span class="text-slate-600 font-medium truncate"><strong class="font-mono text-[#0f2a4a]">[${al.codigo}]</strong> ${al.descripcion}</span>
              ${extrasCount > 0 ? `<span class="px-1 py-0.2 rounded bg-white/90 border border-slate-200 text-[#0f2a4a] font-black text-[9px] flex-shrink-0">+${extrasCount}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join("");

    requestAnimationFrame(() => ajustarAlturaRadarSegunContenido());
    return;
  }

  // MODO 2: MIS ACTIVIDADES ASIGNADAS
  const misFiltradas = tareasMias.filter(item => {
    if (!qFiltro) return true;
    const texto = `${item.descripcion || ''} ${item.proyecto_nombre || ''} ${item.unidad_organica || ''} ${item.codigo || ''}`.toLowerCase();
    return texto.includes(qFiltro);
  });

  if (badgeResumenHeader) {
    const nMias = misFiltradas.length;
    badgeResumenHeader.innerText = nMias === 1 ? "1 actividad asignada" : `${nMias} actividades asignadas`;
  }

  if (misFiltradas.length === 0) {
    listaContenedor.innerHTML = `
      <div class="col-span-full py-3.5 px-4 text-center text-slate-500 font-semibold text-xs bg-slate-50 rounded-xl border border-slate-200/70">
        No tienes actividades operativas pendientes asignadas a tu nombre en los proyectos.
      </div>
    `;
    listaContenedor.style.maxHeight = "82px";
    return;
  }

  listaContenedor.innerHTML = misFiltradas.map(al => {
    const esVencida = al.tipo_alerta === "VENCIDA";
    const esPorVencer = al.tipo_alerta === "POR_VENCER";

    let dotColor = "bg-emerald-500";
    let txtPlazoColor = "text-emerald-700";
    let estiloFondoMio = "bg-slate-50/60 border-slate-200/90 hover:bg-white hover:border-teal-500";
    let plazoCorto = al.fecha_fin ? `Vence: ${al.fecha_fin}` : "En plazo";

    if (esVencida) {
      dotColor = "bg-rose-500";
      txtPlazoColor = "text-rose-600";
      estiloFondoMio = "bg-rose-50/40 border-rose-200/75 hover:bg-rose-50/65 hover:border-rose-300";
      plazoCorto = `Venció hace ${Math.abs(al.dias_restantes)}d (${al.fecha_fin})`;
    } else if (esPorVencer) {
      dotColor = "bg-amber-500";
      txtPlazoColor = "text-amber-700";
      estiloFondoMio = "bg-amber-50/40 border-amber-200/75 hover:bg-amber-50/65 hover:border-amber-300";
      plazoCorto = al.dias_restantes === 0 ? `Vence HOY (${al.fecha_fin})` : `Vence en ${al.dias_restantes}d (${al.fecha_fin})`;
    }

    const nomProyEscapado = (al.proyecto_nombre || "").replace(/'/g, "\\'");
    const jsonUnica = encodeURIComponent(JSON.stringify([al]));

    return `
      <div ondblclick="ingresarAlProyecto(${al.proyecto_id}, '${nomProyEscapado}', ${al.es_gestor})"
           title="Doble clic para ingresar al proyecto"
           class="h-[82px] px-3 py-2 rounded-xl border ${estiloFondoMio} flex flex-col justify-between transition relative cursor-pointer select-none shadow-2xs">
        <div class="flex items-center justify-between gap-1">
          <div class="flex items-center space-x-1.5 min-w-0">
            <span class="w-2 h-2 rounded-full ${dotColor} flex-shrink-0"></span>
            <span class="text-[10.5px] font-black ${txtPlazoColor} truncate">${plazoCorto}</span>
          </div>
          <div class="flex items-center space-x-1 flex-shrink-0">
            <span class="text-[9px] font-black text-[#0f2a4a] bg-white px-1.5 py-0.2 rounded border border-slate-200">${al.unidad_organica}</span>
            <button type="button"
                    onclick="event.stopPropagation()"
                    onmouseenter="mostrarTooltipProyectoAlertasHub(event, this)"
                    onmouseleave="ocultarTooltipMiniCardRadar()"
                    data-proy="${(al.proyecto_nombre || '').replace(/"/g, '&quot;')}"
                    data-uo="${al.unidad_organica}"
                    data-alertas="${jsonUnica}"
                    class="w-4 h-4 rounded-full bg-white hover:bg-[#0f2a4a] text-slate-500 hover:text-white border border-slate-200/90 flex items-center justify-center text-[9.5px] font-serif italic font-black transition cursor-help">
              i
            </button>
            <button type="button" onclick="event.stopPropagation(); ingresarAlProyecto(${al.proyecto_id}, '${nomProyEscapado}', ${al.es_gestor})" class="w-4 h-4 rounded bg-[#0f2a4a] hover:bg-teal-600 text-white font-black text-[10px] flex items-center justify-center transition cursor-pointer" title="Abrir proyecto">
              →
            </button>
          </div>
        </div>

        <div class="text-[10.5px] font-bold text-[#0f2a4a]/85 truncate flex items-center space-x-1.5 leading-none">
          ${SVG_CARPETA_PROY}
          <span class="truncate">${al.proyecto_nombre}</span>
        </div>

        <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60 text-[10.5px] leading-none">
          <span class="font-semibold text-slate-700 truncate"><strong class="font-mono text-[#0f2a4a]">[${al.codigo}]</strong> ${al.descripcion}</span>
          <span class="text-[9.5px] font-black text-teal-800 bg-white px-1.5 py-0.2 rounded border border-teal-200 flex-shrink-0">${al.avance || 0}%</span>
        </div>
      </div>
    `;
  }).join("");

  requestAnimationFrame(() => ajustarAlturaRadarSegunContenido());
}

// Motor Inteligente de Posicionamiento Anti-Recorte (Voltea hacia arriba si no cabe abajo en la pantalla)
function posicionarTooltipInteligenteEnPantalla(tip, triggerEl) {
  const rect = triggerEl.getBoundingClientRect();
  const tipWidth = tip.offsetWidth || 310;
  const tipHeight = tip.offsetHeight || 220;
  const margenVentana = 12;

  // Cálculo horizontal: alinear respecto al elemento disparador sin salirse por izquierda ni derecha
  let left = rect.left + (rect.width / 2) - (tipWidth / 2);
  if (left + tipWidth > window.innerWidth - margenVentana) {
    left = window.innerWidth - tipWidth - margenVentana;
  }
  if (left < margenVentana) {
    left = margenVentana;
  }

  // Cálculo vertical inteligente: si abajo se corta, abrir hacia arriba del elemento
  const espacioAbajo = window.innerHeight - rect.bottom;
  const espacioArriba = rect.top;
  let top = rect.bottom + 8;

  if (espacioAbajo < tipHeight + 16 && espacioArriba > espacioAbajo) {
    top = Math.max(margenVentana, rect.top - tipHeight - 8);
  } else if (top + tipHeight > window.innerHeight - margenVentana) {
    top = Math.max(margenVentana, window.innerHeight - tipHeight - margenVentana);
  }

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

// Tooltip Ejecutivo para Descripción del Proyecto (en Tarjetas y en Tabla) con posicionamiento inteligente
export function mostrarTooltipDescripcionHub(e, btnEl) {
  let tip = document.getElementById("hub-radar-custom-tooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "hub-radar-custom-tooltip";
    document.body.appendChild(tip);
  }
  tip.className = "fixed z-[9999] pointer-events-none w-72 bg-[#0f2a4a] text-white border border-teal-400/40 rounded-xl p-3.5 shadow-2xl text-xs transition-opacity duration-100 opacity-0";

  const proy = btnEl.getAttribute("data-proy") || "Proyecto";
  const uo = btnEl.getAttribute("data-uo") || "S/U";
  const desc = btnEl.getAttribute("data-desc") || "Sin descripción adicional registrada.";
  const esGestor = btnEl.getAttribute("data-gestor") === "1";

  tip.innerHTML = `
    <div class="flex items-center justify-between gap-2 border-b border-white/15 pb-1.5 mb-2">
      <span class="text-[9.5px] font-black uppercase tracking-wider text-teal-300">Descripción / Alcance</span>
      <span class="text-[9.5px] font-black bg-white/10 text-white px-1.5 py-0.2 rounded">${uo}</span>
    </div>
    <p class="font-bold text-white text-xs leading-snug mb-1.5">${proy}</p>
    <p class="font-medium text-slate-200 text-[11px] leading-relaxed bg-white/5 p-2 rounded-lg border border-white/10">${desc}</p>
    ${esGestor ? '<span class="block text-[9.5px] text-teal-300/90 mt-2 italic">Haz clic en el botón (i) para editar la descripción</span>' : ''}
  `;

  posicionarTooltipInteligenteEnPantalla(tip, btnEl);
  tip.classList.remove("opacity-0");
  tip.classList.add("opacity-100");
}

// Tooltip Ejecutivo para Alertas Desglosadas con posicionamiento inteligente anti-recorte
export function mostrarTooltipProyectoAlertasHub(e, btnEl) {
  let tip = document.getElementById("hub-radar-custom-tooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "hub-radar-custom-tooltip";
    document.body.appendChild(tip);
  }
  tip.className = "fixed z-[9999] pointer-events-none w-80 bg-[#0f2a4a] text-white border border-teal-400/40 rounded-xl p-3.5 shadow-2xl text-xs transition-opacity duration-100 opacity-0";

  const proy = btnEl.getAttribute("data-proy") || "";
  const uo = btnEl.getAttribute("data-uo") || "S/U";
  let listaAlertas = [];
  try {
    listaAlertas = JSON.parse(decodeURIComponent(btnEl.getAttribute("data-alertas") || "[]"));
  } catch (err) {
    listaAlertas = [];
  }

  const vencidas = listaAlertas.filter(a => a.tipo_alerta === "VENCIDA");
  const porVencer = listaAlertas.filter(a => a.tipo_alerta === "POR_VENCER");
  const otras = listaAlertas.filter(a => a.tipo_alerta !== "VENCIDA" && a.tipo_alerta !== "POR_VENCER");

  const renderBloque = (items, titulo, dotClass, colorTitulo, verboFecha) => {
    if (items.length === 0) return "";
    const mostrar = items.slice(0, 4);
    const restantes = items.length - mostrar.length;
    return `
      <div class="mt-2">
        <div class="flex items-center space-x-1.5 text-[9.5px] font-black uppercase tracking-wider ${colorTitulo} mb-1">
          <span class="w-2 h-2 rounded-full ${dotClass}"></span>
          <span>${titulo} (${items.length})</span>
        </div>
        <div class="space-y-1.5">
          ${mostrar.map(a => `
            <div class="bg-white/5 p-1.5 rounded-lg border border-white/10 text-[10.5px]">
              <div class="flex items-center justify-between gap-1 font-bold text-white">
                <span class="truncate"><span class="font-mono text-teal-300">[${a.codigo}]</span> ${a.descripcion}</span>
                <span class="text-[9.5px] font-mono ${verboFecha === 'Venció:' ? 'text-rose-300' : 'text-amber-300'} flex-shrink-0">${verboFecha} ${a.fecha_fin}</span>
              </div>
              <div class="text-[10px] text-slate-300 truncate mt-0.5">Responsable: ${a.responsable || 'No asignado'} · Avance: ${a.avance || 0}%</div>
            </div>
          `).join("")}
          ${restantes > 0 ? `<div class="text-[10px] text-teal-200 italic text-right">+ ${restantes} ${restantes === 1 ? 'actividad adicional' : 'actividades adicionales'}...</div>` : ''}
        </div>
      </div>
    `;
  };

  tip.innerHTML = `
    <div class="border-b border-white/15 pb-2 mb-1">
      <div class="flex items-center justify-between gap-2">
        <span class="text-[9.5px] font-black uppercase tracking-wider bg-teal-500/20 text-teal-300 px-1.5 py-0.2 rounded border border-teal-400/30">${uo}</span>
        <span class="text-[10px] text-slate-300 font-semibold">${listaAlertas.length} ${listaAlertas.length === 1 ? 'actividad en seguimiento' : 'actividades en seguimiento'}</span>
      </div>
      <p class="font-bold text-white text-xs leading-snug mt-1">${proy}</p>
    </div>
    ${renderBloque(vencidas, "Con plazo vencido", "bg-rose-500", "text-rose-300", "Venció:")}
    ${renderBloque(porVencer, "Próximas a vencer (≤ 5 días)", "bg-amber-400", "text-amber-300", "Vence:")}
    ${renderBloque(otras, "En plazo programado", "bg-emerald-400", "text-emerald-300", "Vence:")}
  `;

  posicionarTooltipInteligenteEnPantalla(tip, btnEl);
  tip.classList.remove("opacity-0");
  tip.classList.add("opacity-100");
}

export function mostrarTooltipMiniCardRadar(e, btnEl) {
  mostrarTooltipProyectoAlertasHub(e, btnEl);
}

export function ocultarTooltipMiniCardRadar() {
  const tip = document.getElementById("hub-radar-custom-tooltip");
  if (tip) {
    tip.classList.remove("opacity-100");
    tip.classList.add("opacity-0");
  }
}

function ajustarAlturaRadarSegunContenido() {
  const lista = document.getElementById("hub-radar-lista-items");
  if (!lista) return;
  const ALTURA_MIN_UNA_FILA = 82;
  const alturaContenidoReal = Math.max(ALTURA_MIN_UNA_FILA, lista.scrollHeight);
  const alturaActual = parseInt(lista.style.maxHeight || "174", 10);
  if (alturaActual > alturaContenidoReal) {
    lista.style.maxHeight = `${alturaContenidoReal}px`;
  }
}

export function iniciarRedimensionVerticalRadar(e) {
  e.preventDefault();
  const lista = document.getElementById("hub-radar-lista-items");
  if (!lista) return;

  const startY = e.clientY;
  const startHeight = lista.offsetHeight;
  const ALTURA_MIN_UNA_TARJETA = 82;
  const ALTURA_MAX_CONTENIDO = Math.max(ALTURA_MIN_UNA_TARJETA, lista.scrollHeight);

  document.body.style.cursor = "ns-resize";
  document.body.style.userSelect = "none";

  const alMoverMouse = (ev) => {
    const deltaY = ev.clientY - startY;
    const nuevaAltura = Math.min(ALTURA_MAX_CONTENIDO, Math.max(ALTURA_MIN_UNA_TARJETA, startHeight + deltaY));
    lista.style.maxHeight = `${nuevaAltura}px`;
  };

  const alSoltarMouse = () => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", alMoverMouse);
    window.removeEventListener("mouseup", alSoltarMouse);
  };

  window.addEventListener("mousemove", alMoverMouse);
  window.addEventListener("mouseup", alSoltarMouse);
}

export function alternarColapsoRadar() {
  const cuerpo = document.getElementById("hub-radar-cuerpo");
  const headerBar = document.getElementById("hub-radar-header-bar");
  const ico = document.getElementById("ico-colapso-radar");
  const txt = document.getElementById("txt-colapso-radar");
  if (!cuerpo) return;

  const oculto = cuerpo.classList.toggle("hidden");
  if (headerBar) {
    headerBar.className = oculto
      ? "bg-white rounded-2xl px-4 py-2.5 border border-slate-200/95 flex items-center justify-between shadow-2xs"
      : "bg-white rounded-t-2xl px-4 py-2.5 border border-b-0 border-slate-200/95 flex items-center justify-between shadow-2xs";
  }
  if (ico) ico.innerText = oculto ? "▼" : "▲";
  if (txt) txt.innerText = oculto ? "Expandir" : "Contraer";
}

export function alternarColapsoPortafolioHub() {
  const cuerpo = document.getElementById("hub-portafolio-cuerpo");
  const headerBar = document.getElementById("hub-portafolio-header-bar");
  const ico = document.getElementById("ico-colapso-portafolio");
  const txt = document.getElementById("txt-colapso-portafolio");
  if (!cuerpo) return;

  const oculto = cuerpo.classList.toggle("hidden");
  if (headerBar) {
    headerBar.className = oculto
      ? "bg-white rounded-2xl px-4 py-2.5 border border-slate-200/95 flex items-center justify-between shadow-2xs"
      : "bg-white rounded-t-2xl px-4 py-2.5 border border-b-0 border-slate-200/95 flex items-center justify-between shadow-2xs";
  }
  if (ico) ico.innerText = oculto ? "▼" : "▲";
  if (txt) txt.innerText = oculto ? "Expandir" : "Contraer";
}

export function alternarMenuConfigVistasHub(e) {
  if (e) e.stopPropagation();
  document.getElementById("hub-dropdown-config-vistas")?.classList.toggle("hidden");
}

export function conmutarVisibilidadBloqueHub(bloque, visible) {
  if (bloque === "radar") {
    document.getElementById("hub-contenedor-radar-alertas")?.classList.toggle("hidden", !visible);
  } else if (bloque === "portafolio") {
    document.getElementById("hub-contenedor-portafolio-bloque")?.classList.toggle("hidden", !visible);
  }
}

export function restablecerBloquesHub() {
  const chkRadar = document.getElementById("chk-hub-ver-radar");
  const chkPort = document.getElementById("chk-hub-ver-portafolio");
  if (chkRadar) chkRadar.checked = true;
  if (chkPort) chkPort.checked = true;

  document.getElementById("hub-contenedor-radar-alertas")?.classList.remove("hidden");
  document.getElementById("hub-radar-cuerpo")?.classList.remove("hidden");
  document.getElementById("hub-contenedor-portafolio-bloque")?.classList.remove("hidden");
  document.getElementById("hub-portafolio-cuerpo")?.classList.remove("hidden");

  const headerR = document.getElementById("hub-radar-header-bar");
  if (headerR) headerR.className = "bg-white rounded-t-2xl px-4 py-2.5 border border-b-0 border-slate-200/95 flex items-center justify-between shadow-2xs";
  const headerP = document.getElementById("hub-portafolio-header-bar");
  if (headerP) headerP.className = "bg-white rounded-t-2xl px-4 py-2.5 border border-b-0 border-slate-200/95 flex items-center justify-between shadow-2xs";

  const icoR = document.getElementById("ico-colapso-radar");
  const txtR = document.getElementById("txt-colapso-radar");
  if (icoR) icoR.innerText = "▲";
  if (txtR) txtR.innerText = "Contraer";

  const icoP = document.getElementById("ico-colapso-portafolio");
  const txtP = document.getElementById("txt-colapso-portafolio");
  if (icoP) icoP.innerText = "▲";
  if (txtP) txtP.innerText = "Contraer";

  document.getElementById("hub-dropdown-config-vistas")?.classList.add("hidden");
}

if (typeof window !== "undefined") {
  window.addEventListener("click", () => {
    document.getElementById("hub-dropdown-config-vistas")?.classList.add("hidden");
  });
}

export function cambiarVistaHub(modo) {
  state.vistaHubActual = modo;
  localStorage.setItem("vista_hub_proyectos", modo);
  
  if (typeof window.adaptarVistaHubPendientes === "function") {
    window.adaptarVistaHubPendientes(modo);
  }

  aplicarConmutadorVistaHub();
  filtrarProyectosHub();
}

export function aplicarConmutadorVistaHub() {
  const btnGrid = document.getElementById("btn-vista-grid");
  const btnTable = document.getElementById("btn-vista-table");
  const cardsWrapper = document.getElementById("hub-vista-cards-wrapper") || document.getElementById("grid-proyectos-hub");
  const tableCont = document.getElementById("hub-proyectos-tabla-contenedor");

  if (state.vistaHubActual === "table") {
    if (btnTable) btnTable.className = "sprin-view-btn active";
    if (btnGrid) btnGrid.className = "sprin-view-btn";
    if (cardsWrapper) cardsWrapper.classList.add("hidden");
    if (tableCont) tableCont.classList.remove("hidden");
  } else {
    if (btnGrid) btnGrid.className = "sprin-view-btn active";
    if (btnTable) btnTable.className = "sprin-view-btn";
    if (cardsWrapper) cardsWrapper.classList.remove("hidden");
    if (tableCont) tableCont.classList.add("hidden");
  }
}

export function guardarOcultosLocalStorage() {
  localStorage.setItem("proyectos_ocultos_ids", JSON.stringify(Array.from(state.idsProyectosOcultos)));
  actualizarBotonOcultosHubUI();
}

export function actualizarBotonOcultosHubUI() {
  const btnOcultos = document.getElementById("btn-toggle-proyectos-ocultos");
  if (!btnOcultos) return;

  const cant = state.idsProyectosOcultos.size;
  if (cant > 0) {
    btnOcultos.classList.remove("hidden");
    if (state.mostrandoOcultosHub) {
      btnOcultos.className = "h-[32px] px-2.5 rounded-lg text-xs font-black bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition flex items-center space-x-1 cursor-pointer whitespace-nowrap flex-shrink-0";
      btnOcultos.innerHTML = `
        <svg class="w-3.5 h-3.5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <span>Ver activos (${cant})</span>
      `;
      btnOcultos.title = "Volver al panel principal de proyectos";
    } else {
      btnOcultos.className = "w-[32px] h-[32px] rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition flex items-center justify-center cursor-pointer flex-shrink-0";
      btnOcultos.innerHTML = `
        <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      `;
      btnOcultos.title = `Ver proyectos ocultos (${cant})`;
    }
  } else {
    btnOcultos.classList.add("hidden");
    state.mostrandoOcultosHub = false;
  }
}

export function alternarVerProyectosOcultos() {
  state.mostrandoOcultosHub = !state.mostrandoOcultosHub;
  actualizarBotonOcultosHubUI();
  filtrarProyectosHub();
}

export function alternarOcultarProyecto(id, event) {
  if (event) event.stopPropagation();
  if (state.idsProyectosOcultos.has(id)) {
    state.idsProyectosOcultos.delete(id);
    notificarToast("Proyecto restaurado al panel principal.", "success");
    if (state.idsProyectosOcultos.size === 0) {
      state.mostrandoOcultosHub = false;
    }
  } else {
    state.idsProyectosOcultos.add(id);
    notificarToast("Proyecto ocultado de la vista principal.", "info");
  }
  guardarOcultosLocalStorage();
  actualizarKPIsHub(state.proyectosUsuarioGlobal);
  renderizarRadarPreventivoHub();
  filtrarProyectosHub();
}

export async function solicitarEliminarProyecto(id, nombre, event) {
  if (event) event.stopPropagation();

  const pObj = state.proyectosUsuarioGlobal.find(p => p.id === id);
  const totalActs = pObj ? (pObj.total_actividades || 0) : 0;

  if (totalActs > 0) {
    alert(`⚠️ No se puede eliminar el proyecto '${nombre}'.\n\nEl proyecto contiene ${totalActs} actividad(es). Debe ingresar al proyecto y eliminar todas sus actividades para poder borrarlo.`);
    return;
  }

  const confirma = await confirmModal(
    `¿Está seguro de eliminar permanentemente el proyecto '${nombre}'?\n\nEsta acción no se puede deshacer.`,
    "Eliminar proyecto vacío",
    "danger"
  );

  if (!confirma) return;

  try {
    const res = await apiFetch(`/proyectos/${id}`, { method: "DELETE" });
    if (res.ok) {
      state.idsProyectosOcultos.delete(id);
      guardarOcultosLocalStorage();
      notificarToast(`Proyecto '${nombre}' eliminado con éxito.`, "info");
      await cargarHubProyectos();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al eliminar el proyecto.");
    }
  } catch (e) {
    alert("Error de conexión al eliminar el proyecto.");
  }
}

const SVG_CANDADO_MINIMAL = `<svg class="w-3.5 h-3.5 text-slate-400 hover:text-[#0f2a4a] transition flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>`;

const SVG_MUNDO_MINIMAL = `<svg class="w-3.5 h-3.5 text-teal-600 hover:text-teal-800 transition flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>`;

function construirIndicadorSaludMinimal(p) {
  const cantVenc = parseInt(p.vencidas_count) || 0;
  const cantPorVenc = parseInt(p.por_vencer_count) || 0;

  if (p.salud_proyecto === "CRITICO" && cantVenc > 0) {
    const palabra = cantVenc === 1 ? "vencida" : "vencidas";
    return `
      <span class="inline-flex items-center space-x-1.5 text-[11px] font-bold text-rose-600 whitespace-nowrap" title="Proyecto con ${cantVenc} ${palabra}">
        <span class="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0"></span>
        <span>${cantVenc} ${palabra}</span>
      </span>
    `;
  }
  if (p.salud_proyecto === "ATENCION" && cantPorVenc > 0) {
    return `
      <span class="inline-flex items-center space-x-1.5 text-[11px] font-bold text-amber-600 whitespace-nowrap" title="Proyecto con ${cantPorVenc} actividad(es) por vencer en 5 días o menos">
        <span class="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0"></span>
        <span>${cantPorVenc} por vencer</span>
      </span>
    `;
  }
  return `
    <span class="inline-flex items-center space-x-1.5 text-[11px] font-bold text-emerald-600 whitespace-nowrap" title="Cronograma al día">
      <span class="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
      <span>En plazo</span>
    </span>
  `;
}

export function abrirModalMisPendientesHub() {
  const modal = document.getElementById("modal-mis-pendientes-hub");
  if (modal) modal.classList.remove("hidden");
  sincronizarContadorHeaderPendientes();
}

export function cerrarModalMisPendientesHub() {
  const modal = document.getElementById("modal-mis-pendientes-hub");
  if (modal) modal.classList.add("hidden");
  sincronizarContadorHeaderPendientes();
}

export function sincronizarContadorHeaderPendientes() {
  const badgeModal = document.getElementById("hub-tarjeta-pendientes-badge");
  const badgeHeader = document.getElementById("hub-header-pendientes-count");
  if (badgeModal && badgeHeader) {
    const numMatch = (badgeModal.innerText || "0").match(/\d+/);
    badgeHeader.innerText = numMatch ? numMatch[0] : "0";
  }
}

export function renderizarTarjetasHub(lista) {
  const grid = document.getElementById("grid-proyectos-hub");
  if (!grid) return;
  grid.innerHTML = "";

  actualizarBotonOcultosHubUI();
  setTimeout(sincronizarContadorHeaderPendientes, 120);

  const listaFinal = lista.filter(p => state.mostrandoOcultosHub ? state.idsProyectosOcultos.has(p.id) : !state.idsProyectosOcultos.has(p.id));
  const badgePortafolio = document.getElementById("hub-portafolio-badge-visibles");
  if (badgePortafolio) {
    badgePortafolio.innerText = listaFinal.length === 1 ? "1 proyecto" : `${listaFinal.length} proyectos`;
  }

  listaFinal.forEach(p => {
    const rolEfectivo = p.rol_efectivo || (p.es_gestor ? 'GESTOR' : 'RESPONSABLE');
    const esGestor = (p.es_gestor === 1 || p.es_gestor === true || state.currentUser.rol === "ADMIN_TI") && rolEfectivo !== "AUTORIDAD";
    const totalActs = p.total_actividades || 0;
    const esProyectoVacio = totalActs === 0;
    const puedeEliminar = esGestor && esProyectoVacio;
    const esPublico = (p.visibilidad === "PUBLICO");

    let badgeRolClases = "bg-blue-50 text-blue-800 border-blue-200/80";
    let badgeRolHTML = `<span>Responsable</span>`;

    if (rolEfectivo === "GESTOR" || esGestor) {
      badgeRolClases = "bg-amber-50 text-amber-900 border-amber-200/90";
      badgeRolHTML = `${SVG_ROL_GESTOR}<span>Gestor</span>`;
    } else if (rolEfectivo === "AUTORIDAD") {
      badgeRolClases = "bg-purple-50 text-purple-800 border-purple-200/80";
      badgeRolHTML = `${SVG_ROL_AUTORIDAD}<span>Autoridad</span>`;
    } else if (rolEfectivo === "VISUALIZADOR") {
      badgeRolClases = "bg-slate-100 text-slate-700 border-slate-300";
      badgeRolHTML = `<span>Visualizador</span>`;
    }

    const indicadorSaludHTML = construirIndicadorSaludMinimal(p);
    const iconoAlcanceHTML = esPublico
      ? `<span class="inline-flex items-center justify-center cursor-help" title="Proyecto público institucional">${SVG_MUNDO_MINIMAL}</span>`
      : `<span class="inline-flex items-center justify-center cursor-help" title="Proyecto privado (solo miembros asignados)">${SVG_CANDADO_MINIMAL}</span>`;

    const textoDesc = (p.descripcion && p.descripcion.trim() !== "") ? p.descripcion.trim() : "Sin descripción adicional registrada.";
    const descEscapada = (p.descripcion || "").replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const avanceVal = parseInt(p.avance_global) || 0;
    const estaOculto = state.idsProyectosOcultos.has(p.id);

    const barraColorClase = avanceVal === 100 ? "bg-emerald-500" : "bg-teal-600";

    let siglaUnidad = "";
    let nombreCompletoUnidad = "";
    if (p.unidad_organica && p.unidad_organica.trim() !== "") {
      const uRaw = p.unidad_organica.trim().toUpperCase();
      const uObj = (state.catalogoUnidadesGlobal || []).find(u => 
        u.sigla.toUpperCase() === uRaw || 
        u.nombre.trim().toUpperCase() === uRaw
      );
      siglaUnidad = uObj ? uObj.sigla : p.unidad_organica.trim();
      nombreCompletoUnidad = uObj ? uObj.nombre : p.unidad_organica.trim();
    }

    const tooltipUo = nombreCompletoUnidad ? `title="${nombreCompletoUnidad}${esGestor ? ' (Doble clic para cambiar)' : ''}"` : '';
    const estiloCursorUo = esGestor ? 'cursor-pointer hover:text-teal-700 transition' : '';

    const procesoValor = (p.proceso_relacionado || p.proceso_nombre || p.proceso_codigo || "").trim();
    const nombreLimpioProceso = procesoValor ? procesoValor : "Sin proceso asignado";
    const tooltipProceso = `title="${nombreLimpioProceso}${esGestor ? ' (Doble clic para cambiar)' : ''}"`;
    const estiloCursorProceso = esGestor ? 'cursor-pointer hover:opacity-100 transition' : '';

    let slotAlertaSimetricoHTML = `
      <div class="mt-4 h-[48px] px-3.5 rounded-xl border border-slate-100 bg-slate-50/70 flex items-center justify-between text-[11px] text-slate-400">
        <span class="inline-flex items-center space-x-1.5 font-semibold">
          <svg class="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          <span>Cronograma sin alertas de retraso</span>
        </span>
        <span class="text-[10px] font-bold text-slate-400">${totalActs} act.</span>
      </div>
    `;

    if (p.alertas_responsables && p.alertas_responsables.length > 0) {
      const topAl = p.alertas_responsables[0];
      const esVenc = topAl.tipo_alerta === "VENCIDA";
      const respCorto = (topAl.responsable || "No asignado").split(";")[0].trim();
      const extrasEnProyecto = p.alertas_responsables.length - 1;
      const jsonAlertasProy = encodeURIComponent(JSON.stringify(p.alertas_responsables));

      const etiquetaPrefijo = esVenc
        ? `<span class="text-rose-600 font-extrabold">Con retraso:</span>`
        : `<span class="text-amber-700 font-extrabold">Por vencer:</span>`;
      const claseFecha = esVenc ? "text-rose-600 font-bold" : "text-amber-700 font-bold";

      slotAlertaSimetricoHTML = `
        <div onmouseenter="mostrarTooltipProyectoAlertasHub(event, this)"
             onmouseleave="ocultarTooltipMiniCardRadar()"
             data-proy="${(p.nombre || '').replace(/"/g, '&quot;')}"
             data-uo="${siglaUnidad || 'S/U'}"
             data-alertas="${jsonAlertasProy}"
             class="mt-4 h-[48px] px-3.5 py-1.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:border-slate-300 flex flex-col justify-center text-[10.5px] transition cursor-help">
          <div class="flex items-center justify-between gap-1.5 leading-tight">
            <span class="truncate text-slate-700 font-semibold">${etiquetaPrefijo} [${topAl.codigo}] ${topAl.descripcion}</span>
            <span class="font-mono text-[10px] ${claseFecha} flex-shrink-0">${topAl.fecha_fin}</span>
          </div>
          <div class="flex items-center justify-between gap-1 text-[10px] text-slate-500 leading-tight mt-0.5">
            <span class="truncate">Responsable: <strong class="text-slate-700">${respCorto}</strong></span>
            ${extrasEnProyecto > 0 ? `<span class="inline-flex items-center space-x-1 text-[9.5px] font-bold text-[#0f2a4a] bg-slate-200/80 px-1.5 py-0.5 rounded-md flex-shrink-0"><span>+${extrasEnProyecto} más</span><span class="w-3.5 h-3.5 rounded-full bg-[#0f2a4a] text-white inline-flex items-center justify-center text-[8.5px] font-serif italic font-bold leading-none">i</span></span>` : ''}
          </div>
        </div>
      `;
    }

    const card = document.createElement("div");
    card.className = "bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between hover:border-teal-500/50 relative h-[365px]";
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-3.5 gap-1">
          <div class="flex items-center space-x-2">
            <span class="inline-flex items-center text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider whitespace-nowrap border ${badgeRolClases}">
              ${badgeRolHTML}
            </span>
            ${iconoAlcanceHTML}
            <span class="text-slate-200">|</span>
            ${indicadorSaludHTML}
          </div>
          <div class="flex items-center space-x-1">
            <button onclick="alternarOcultarProyecto(${p.id}, event)" class="p-1 rounded hover:bg-slate-100 transition cursor-pointer" title="${estaOculto ? 'Restaurar al panel principal' : 'Ocultar proyecto de la vista'}">
              ${estaOculto ? SVG_OJO_ABIERTO : SVG_OJO_CERRADO}
            </button>
            ${puedeEliminar ? `
              <button onclick="solicitarEliminarProyecto(${p.id}, '${p.nombre.replace(/'/g, "\\'")}', event)" class="p-1 rounded text-rose-400 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer" title="Eliminar proyecto vacío">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            ` : ''}
            <span class="text-xs font-black px-2 py-0.5 rounded bg-slate-100 text-[#0f2a4a]">${avanceVal}%</span>
          </div>
        </div>
        
        <div class="flex items-start justify-between gap-2 h-[44px]">
          <h3 class="font-bold text-[15px] text-[#0f2a4a] tracking-tight leading-snug line-clamp-2 break-words flex-1" title="${p.nombre.replace(/"/g, '&quot;')}">${p.nombre}</h3>
          
          <button type="button"
                  onclick="event.stopPropagation(); ${esGestor ? `editarDescripcionProyecto(${p.id}, '${descEscapada}')` : ''}"
                  onmouseenter="mostrarTooltipDescripcionHub(event, this)"
                  onmouseleave="ocultarTooltipMiniCardRadar()"
                  data-proy="${p.nombre.replace(/"/g, '&quot;')}"
                  data-uo="${siglaUnidad || 'Sin UO'}"
                  data-desc="${textoDesc.replace(/"/g, '&quot;')}"
                  data-gestor="${esGestor ? '1' : '0'}"
                  class="w-5 h-5 rounded-full bg-slate-100 hover:bg-[#0f2a4a] text-slate-500 hover:text-white flex items-center justify-center text-[11px] font-serif italic font-black transition cursor-pointer flex-shrink-0 mt-0.5">
            i
          </button>
        </div>
        
        <div class="flex items-center gap-x-2 mt-2 text-[11px] truncate">
          <span ${tooltipUo} 
                ondblclick="${esGestor ? `editarUnidadOrganicaProyecto(${p.id}, '${siglaUnidad}')` : ''}"
                class="font-bold text-teal-800 inline-flex items-center space-x-1 flex-shrink-0 ${estiloCursorUo}">
            ${SVG_EDIFICIO_UO}
            <span>${siglaUnidad || 'Sin UO'}</span>
          </span>
          <span class="text-slate-300">•</span>
          <span ${tooltipProceso} 
                ondblclick="${esGestor ? `editarProcesoProyectoModal(${p.id})` : ''}"
                class="font-semibold text-[#0f2a4a] opacity-60 hover:opacity-100 inline-flex items-center space-x-1 truncate ${estiloCursorProceso}">
            ${SVG_ENGRANAJE_PROC}
            <span class="truncate">${nombreLimpioProceso}</span>
          </span>
        </div>

        ${slotAlertaSimetricoHTML}
      </div>

      <div class="pt-3">
        <div class="w-full bg-slate-100 rounded-full h-2 mb-3.5 overflow-hidden shadow-inner">
          <div class="${barraColorClase} h-2 rounded-full transition-all duration-500" style="width: ${avanceVal}%"></div>
        </div>

        <div class="grid grid-cols-3 gap-2.5 mb-4 text-center">
          <div class="bg-emerald-50/80 py-2 px-2 rounded-xl border border-emerald-100">
            <span class="block text-[9px] font-black text-emerald-700 uppercase">Ejecutado</span>
            <span class="text-xs font-black text-emerald-900 mt-0.5 block">${p.ejecutadas || 0}</span>
          </div>
          <div class="bg-amber-50/80 py-2 px-2 rounded-xl border border-amber-100">
            <span class="block text-[9px] font-black text-amber-700 uppercase">En proceso</span>
            <span class="text-xs font-black text-amber-900 mt-0.5 block">${p.en_proceso || 0}</span>
          </div>
          <div class="bg-rose-50/80 py-2 px-2 rounded-xl border border-rose-100">
            <span class="block text-[9px] font-black text-rose-700 uppercase">No iniciado</span>
            <span class="text-xs font-black text-rose-900 mt-0.5 block">${p.pendientes || 0}</span>
          </div>
        </div>

        <button onclick="ingresarAlProyecto(${p.id}, '${p.nombre.replace(/'/g, "\\'")}', ${esGestor})" class="w-full py-2.5 bg-[#0f2a4a] hover:bg-[#1b4f8a] text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center space-x-1.5 cursor-pointer">
          <span>Ingresar al proyecto</span>
          <span class="text-sm leading-none">→</span>
        </button>
      </div>
    `;
    grid.appendChild(card);
  });

  if (!state.mostrandoOcultosHub) {
    const cardNuevo = document.createElement("div");
    cardNuevo.onclick = abrirModalNuevoProyecto;
    cardNuevo.className = "bg-slate-50/60 hover:bg-white rounded-2xl p-6 border-2 border-dashed border-slate-300 hover:border-teal-500 transition-all cursor-pointer flex flex-col items-center justify-center text-center group h-[365px] shadow-2xs hover:shadow-md";
    cardNuevo.innerHTML = `
      <div class="w-12 h-12 rounded-full bg-teal-50 group-hover:bg-teal-600 text-teal-600 group-hover:text-white flex items-center justify-center text-xl font-black mb-3 transition shadow-2xs">
        +
      </div>
      <h4 class="text-sm font-black text-gray-700 group-hover:text-[#0f2a4a] transition">Nuevo proyecto o programa</h4>
      <p class="text-[11px] text-gray-400 mt-1 max-w-[200px]">Cree un proyecto en blanco o seleccione una plantilla oficial o personal.</p>
      <span class="mt-4 text-[11px] font-bold text-teal-600 bg-teal-50 px-3 py-1 rounded-lg border border-teal-100 group-hover:bg-teal-600 group-hover:text-white transition">Comenzar</span>
    `;
    grid.appendChild(cardNuevo);
  }
}

export function renderizarTablaHub(lista) {
  const tbody = document.getElementById("hub-proyectos-tabla-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  actualizarBotonOcultosHubUI();
  setTimeout(sincronizarContadorHeaderPendientes, 120);

  const listaFinal = lista.filter(p => state.mostrandoOcultosHub ? state.idsProyectosOcultos.has(p.id) : !state.idsProyectosOcultos.has(p.id));
  const badgePortafolio = document.getElementById("hub-portafolio-badge-visibles");
  if (badgePortafolio) {
    badgePortafolio.innerText = listaFinal.length === 1 ? "1 proyecto" : `${listaFinal.length} proyectos`;
  }

  if (listaFinal.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-gray-400 font-semibold italic">No se encontraron proyectos con los filtros seleccionados.</td></tr>`;
    return;
  }

  listaFinal.forEach((p, idx) => {
    const rolEfectivo = p.rol_efectivo || (p.es_gestor ? 'GESTOR' : 'RESPONSABLE');
    const esGestor = (p.es_gestor === 1 || p.es_gestor === true || state.currentUser.rol === "ADMIN_TI") && rolEfectivo !== "AUTORIDAD";
    const totalActs = p.total_actividades || 0;
    const esProyectoVacio = totalActs === 0;
    const puedeEliminar = esGestor && esProyectoVacio;
    const esPublico = (p.visibilidad === "PUBLICO");

    let badgeRolHTML = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-50 text-blue-900 border border-blue-200">Responsable</span>`;
    if (rolEfectivo === "GESTOR" || esGestor) {
      badgeRolHTML = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-50 text-amber-900 border border-amber-200">${SVG_ROL_GESTOR}<span>Gestor</span></span>`;
    } else if (rolEfectivo === "AUTORIDAD") {
      badgeRolHTML = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-50 text-purple-900 border border-purple-200">${SVG_ROL_AUTORIDAD}<span>Autoridad</span></span>`;
    } else if (rolEfectivo === "VISUALIZADOR") {
      badgeRolHTML = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-100 text-slate-700 border border-slate-300">Visualizador</span>`;
    }

    const indicadorSaludHTML = construirIndicadorSaludMinimal(p);
    const iconoAlcanceHTML = esPublico
      ? `<span class="inline-flex items-center justify-center cursor-help flex-shrink-0" title="Proyecto público institucional">${SVG_MUNDO_MINIMAL}</span>`
      : `<span class="inline-flex items-center justify-center cursor-help flex-shrink-0" title="Proyecto privado">${SVG_CANDADO_MINIMAL}</span>`;

    const pct = p.avance_global || 0;
    const estaOculto = state.idsProyectosOcultos.has(p.id);
    const textoDesc = (p.descripcion && p.descripcion.trim() !== "") ? p.descripcion.trim() : "Sin descripción adicional registrada.";
    const descEscapada = (p.descripcion || "").replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const procesoValor = (p.proceso_relacionado || p.proceso_nombre || p.proceso_codigo || "").trim();
    const nombreLimpioProceso = procesoValor ? procesoValor : "Sin proceso asignado";

    let hitoCoordHTML = `<span class="text-[11px] text-slate-400 italic">Al día sin alertas</span>`;
    if (p.alertas_responsables && p.alertas_responsables.length > 0) {
      const al = p.alertas_responsables[0];
      const esV = al.tipo_alerta === "VENCIDA";
      const extras = p.alertas_responsables.length - 1;
      const jsonAlertasTabla = encodeURIComponent(JSON.stringify(p.alertas_responsables));
      const prefijoTxt = esV ? `<span class="text-rose-600 font-bold">Con retraso:</span>` : `<span class="text-amber-700 font-bold">Por vencer:</span>`;

      hitoCoordHTML = `
        <div onmouseenter="mostrarTooltipProyectoAlertasHub(event, this)"
             onmouseleave="ocultarTooltipMiniCardRadar()"
             data-proy="${p.nombre.replace(/"/g, '&quot;')}"
             data-uo="${p.unidad_organica || 'S/U'}"
             data-alertas="${jsonAlertasTabla}"
             class="text-[11px] leading-tight truncate cursor-help">
          <div class="font-semibold text-slate-700 truncate">
            ${prefijoTxt} [${al.codigo}] ${al.descripcion}
          </div>
          <div class="text-[10px] text-slate-500 mt-0.5 flex items-center justify-between gap-1">
            <span class="truncate"><strong>${(al.responsable || '').split(';')[0]}</strong> · <span class="${esV ? 'text-rose-600 font-bold' : 'text-amber-700 font-bold'}">${al.fecha_fin}</span></span>
            ${extras > 0 ? `<span class="inline-flex items-center space-x-1 text-[9px] font-bold text-[#0f2a4a] bg-slate-200/80 px-1.5 py-0.2 rounded flex-shrink-0"><span>+${extras}</span><span class="w-3 h-3 rounded-full bg-[#0f2a4a] text-white inline-flex items-center justify-center text-[8px] font-serif italic font-bold leading-none">i</span></span>` : ''}
          </div>
        </div>
      `;
    }

    tbody.innerHTML += `
      <tr class="hover:bg-slate-50/80 transition border-b border-gray-100">
        <td class="p-2.5 text-center text-gray-400 font-mono text-xs">${idx + 1}</td>
        <td class="p-2.5 truncate">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="bg-teal-50 text-teal-900 border border-teal-200 px-1.5 py-0.2 rounded text-[10px] font-black flex-shrink-0">${p.unidad_organica || 'S/U'}</span>
            <span class="font-bold text-[#0f2a4a] text-xs truncate" title="${p.nombre.replace(/"/g, '&quot;')}">${p.nombre}</span>
            ${iconoAlcanceHTML}
            <button type="button"
                    onclick="event.stopPropagation(); ${esGestor ? `editarDescripcionProyecto(${p.id}, '${descEscapada}')` : ''}"
                    onmouseenter="mostrarTooltipDescripcionHub(event, this)"
                    onmouseleave="ocultarTooltipMiniCardRadar()"
                    data-proy="${p.nombre.replace(/"/g, '&quot;')}"
                    data-uo="${p.unidad_organica || 'S/U'}"
                    data-desc="${textoDesc.replace(/"/g, '&quot;')}"
                    data-gestor="${esGestor ? '1' : '0'}"
                    class="w-4 h-4 rounded-full bg-slate-100 hover:bg-[#0f2a4a] text-slate-500 hover:text-white text-[10px] font-serif italic font-black flex items-center justify-center flex-shrink-0 cursor-pointer">
              i
            </button>
          </div>
          <div class="text-[10.5px] text-[#0f2a4a] font-semibold opacity-60 hover:opacity-100 mt-0.5 flex items-center gap-1 truncate transition">
            ${SVG_ENGRANAJE_PROC}
            <span class="truncate ${esGestor ? 'cursor-pointer hover:underline' : ''}" 
                  title="${nombreLimpioProceso}" 
                  ondblclick="${esGestor ? `editarProcesoProyectoModal(${p.id})` : ''}">
              ${nombreLimpioProceso}
            </span>
          </div>
        </td>
        <td class="p-2.5 text-center whitespace-nowrap">${indicadorSaludHTML}</td>
        <td class="p-2.5 text-center whitespace-nowrap">${badgeRolHTML}</td>
        <td class="p-2.5 text-center">
          <div class="flex items-center space-x-1.5 justify-center">
            <div class="w-12 bg-gray-200 rounded-full h-1.5 overflow-hidden hidden sm:block">
              <div class="bg-teal-600 h-1.5 rounded-full" style="width: ${pct}%;"></div>
            </div>
            <span class="font-black text-gray-800 text-xs">${pct}%</span>
          </div>
        </td>
        <td class="p-2.5 truncate">${hitoCoordHTML}</td>
        <td class="p-2.5 text-center whitespace-nowrap">
          <div class="inline-flex items-center space-x-1 text-[10.5px] font-black">
            <span class="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200" title="Ejecutadas">${p.ejecutadas || 0}</span>
            <span class="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" title="En proceso">${p.en_proceso || 0}</span>
            <span class="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200" title="No iniciadas">${p.pendientes || 0}</span>
          </div>
        </td>
        <td class="p-2.5 pr-4 whitespace-nowrap">
          <div class="flex items-center justify-end space-x-1.5">
            <div class="inline-flex items-center justify-end space-x-0.5 w-[44px] flex-shrink-0">
              <button onclick="alternarOcultarProyecto(${p.id}, event)" class="p-1 rounded hover:bg-gray-200 transition cursor-pointer" title="${estaOculto ? 'Restaurar al panel' : 'Ocultar vista'}">
                ${estaOculto ? SVG_OJO_ABIERTO : SVG_OJO_CERRADO}
              </button>
              ${puedeEliminar ? `
                <button onclick="solicitarEliminarProyecto(${p.id}, '${p.nombre.replace(/'/g, "\\'")}', event)" class="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer" title="Eliminar proyecto vacío">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              ` : ''}
            </div>
            <button onclick="ingresarAlProyecto(${p.id}, '${p.nombre.replace(/'/g, "\\'")}', ${esGestor})" class="w-[78px] text-center bg-[#0f2a4a] hover:bg-[#1b4f8a] text-white text-[11px] font-bold py-1 rounded-lg transition shadow-2xs cursor-pointer flex-shrink-0">
              Ingresar →
            </button>
          </div>
        </td>
      </tr>
    `;
  });
}

export function exportarResumenProyectosExcel() {
  if (!state.proyectosUsuarioGlobal || state.proyectosUsuarioGlobal.length === 0) {
    alert("No hay proyectos para exportar.");
    return;
  }

  const limpiarCeldaCSV = (val) => String(val ?? "").replace(/(\r\n|\n|\r)/gm, " ").replace(/;/g, ",").replace(/"/g, '""').trim();

  const cabeceras = [
    "ID_Proyecto",
    "Nombre_Proyecto",
    "Sigla_Unidad_Organica",
    "Codigo_Proceso",
    "Nombre_Proceso_Institucional",
    "Alcance_Visibilidad",
    "Modalidad_Temporal",
    "Rol_Usuario_Actual",
    "Estado_Salud_Portafolio",
    "Estado_General_Avance",
    "Avance_Porcentaje_Num",
    "Total_Actividades_Operativas",
    "Actividades_Ejecutadas",
    "Actividades_En_Proceso",
    "Actividades_No_Iniciadas",
    "Actividades_Vencidas",
    "Actividades_Por_Vencer_5d",
    "Proximo_Hito_O_Retraso_Critico",
    "Responsable_Hito_Critico",
    "Fecha_Limite_Hito_Critico",
    "Descripcion_Alcance_Proyecto",
    "Fecha_Registro_Proyecto"
  ];

  let csv = "\uFEFF" + cabeceras.join(";") + "\n";

  state.proyectosUsuarioGlobal.forEach(p => {
    const rol = p.rol_efectivo || ((p.es_gestor === 1 || p.es_gestor === true || state.currentUser.rol === "ADMIN_TI") ? "GESTOR" : "RESPONSABLE");
    const av = parseInt(p.avance_global) || 0;
    const estadoGen = av === 100 ? "Ejecutado" : (av > 0 ? "En proceso" : "No iniciado");

    const mapaSalud = {
      "CRITICO": "CON RETRASO",
      "ATENCION": "POR VENCER (<=5d)",
      "COMPLETADO": "COMPLETADO (100%)",
      "EN_PLAZO": "EN PLAZO"
    };
    const saludTexto = mapaSalud[p.salud_proyecto] || "EN PLAZO";

    let codProc = p.proceso_codigo || "";
    let nomProc = p.proceso_nombre || p.proceso_relacionado || "Sin proceso asignado";
    if (!codProc && nomProc.includes(" - ")) {
      const partesP = nomProc.split(" - ");
      codProc = partesP[0].trim();
      nomProc = partesP.slice(1).join(" - ").trim();
    }

    const modTemp = (p.duration_mode === "hours" || p.unidad_tiempo === "HORAS") ? "Horas Netas" : "Días Hábiles";
    const topAl = (p.alertas_responsables && p.alertas_responsables.length > 0) ? p.alertas_responsables[0] : null;
    const hitoCritico = topAl ? `[${topAl.codigo}] ${topAl.descripcion}` : "Sin alertas de plazo";
    const respCritico = topAl ? (topAl.responsable || "No asignado") : "-";
    const fechaCritica = topAl ? (topAl.fecha_fin || "-") : "-";

    const fila = [
      p.id,
      `"${limpiarCeldaCSV(p.nombre)}"`,
      `"${limpiarCeldaCSV(p.unidad_organica || 'Sin UO')}"`,
      `"${limpiarCeldaCSV(codProc || 'S/C')}"`,
      `"${limpiarCeldaCSV(nomProc)}"`,
      `"${limpiarCeldaCSV(p.visibilidad || 'PRIVADO')}"`,
      `"${modTemp}"`,
      `"${rol}"`,
      `"${saludTexto}"`,
      `"${estadoGen}"`,
      av,
      p.total_actividades || 0,
      p.ejecutadas || 0,
      p.en_proceso || 0,
      p.pendientes || 0,
      p.vencidas_count || 0,
      p.por_vencer_count || 0,
      `"${limpiarCeldaCSV(hitoCritico)}"`,
      `"${limpiarCeldaCSV(respCritico)}"`,
      `"${limpiarCeldaCSV(fechaCritica)}"`,
      `"${limpiarCeldaCSV(p.descripcion || '')}"`,
      `"${limpiarCeldaCSV(p.fecha_creacion || '')}"`
    ];
    csv += fila.join(";") + "\n";
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `SPRIN_IMARPE_Matriz_Portafolio_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
  notificarToast("Matriz analítica del portafolio descargada en Excel.", "success");
}

export function abrirModalNuevoProyecto() { 
  if (state.catalogoUnidadesGlobal.length === 0) cargarCatalogoUnidades();
  if (state.catalogoProcesosGlobal.length === 0) cargarCatalogoProcesos();

  document.getElementById("input-nuevo-proy-nombre").value = "";
  document.getElementById("input-nuevo-proy-desc").value = "";
  document.getElementById("input-nuevo-proy-uo-busq").value = "";
  document.getElementById("input-nuevo-proy-uo-valor").value = "";
  document.getElementById("sugerencias-uo-proyecto")?.classList.add("hidden");

  const inpProcBusq = document.getElementById("input-nuevo-proy-proceso-busq");
  if (inpProcBusq) inpProcBusq.value = "";
  const inpProcCod = document.getElementById("input-nuevo-proy-proceso-codigo");
  if (inpProcCod) inpProcCod.value = "";
  const inpProcNom = document.getElementById("input-nuevo-proy-proceso-nombre");
  if (inpProcNom) inpProcNom.value = "";
  const inpProcPers = document.getElementById("input-nuevo-proy-proceso-personalizado");
  if (inpProcPers) inpProcPers.value = "0";
  const contOtro = document.getElementById("contenedor-otro-subproceso");
  if (contOtro) contOtro.classList.add("hidden");
  const inpOtroTexto = document.getElementById("input-otro-subproceso-texto");
  if (inpOtroTexto) inpOtroTexto.value = "";
  const divSugProc = document.getElementById("nuevo-proy-proceso-sugerencias");
  if (divSugProc) divSugProc.classList.add("hidden");

  const selModo = document.getElementById("input-nuevo-proy-duration-mode");
  if (selModo) selModo.value = "business_days";
  const selVis = document.getElementById("input-nuevo-proy-visibilidad");
  if (selVis) selVis.value = "PRIVADO";

  cambiarTabNuevoProyecto("blanco");
  document.getElementById("modal-nuevo-proyecto")?.classList.remove("hidden"); 
}

export function cerrarModalNuevoProyecto() { 
  document.getElementById("modal-nuevo-proyecto")?.classList.add("hidden"); 
}

export async function autocompletarProcesoNuevoProy(termino) {
  const term = (termino || "").toLowerCase().trim();
  const divSug = document.getElementById("nuevo-proy-proceso-sugerencias");
  const contOtro = document.getElementById("contenedor-otro-subproceso");
  if (!divSug) return;

  if (!term) {
    divSug.innerHTML = "";
    divSug.classList.add("hidden");
    return;
  }

  if (!state.catalogoProcesosGlobal || state.catalogoProcesosGlobal.length === 0) {
    await cargarCatalogoProcesos();
  }

  const matches = (state.catalogoProcesosGlobal || []).filter(p => 
    (p.codigo && p.codigo.toLowerCase().includes(term)) ||
    (p.nombre && p.nombre.toLowerCase().includes(term))
  );

  divSug.innerHTML = "";
  if (matches.length === 0) {
    divSug.innerHTML = `<div class="p-2.5 text-gray-400 italic bg-white text-center">No se encontraron procesos que coincidan con '${termino}'</div>`;
  } else {
    matches.slice(0, 8).forEach(p => {
      const item = document.createElement("div");
      item.className = "p-2.5 hover:bg-teal-50 cursor-pointer flex justify-between items-center transition border-b border-gray-100 last:border-0 bg-white font-semibold text-gray-800";
      item.innerHTML = `
        <span class="truncate pr-2">${p.nombre}</span>
        <strong class="text-[#0f2a4a] bg-slate-100 px-1.5 py-0.5 rounded border text-[10px] flex-shrink-0">[${p.codigo}]</strong>
      `;
      item.onclick = () => {
        document.getElementById("input-nuevo-proy-proceso-busq").value = `${p.codigo} - ${p.nombre}`;
        document.getElementById("input-nuevo-proy-proceso-codigo").value = p.codigo;
        document.getElementById("input-nuevo-proy-proceso-nombre").value = p.nombre;
        document.getElementById("input-nuevo-proy-proceso-personalizado").value = "0";
        divSug.classList.add("hidden");
        if (contOtro) contOtro.classList.add("hidden");
      };
      divSug.appendChild(item);
    });
  }

  const itemOtro = document.createElement("div");
  itemOtro.className = "p-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold cursor-pointer border-t border-amber-200 flex items-center justify-between";
  itemOtro.innerHTML = `<span>⚙️ Otro subproceso (personalizado)</span> <span class="text-[10px] text-amber-700">Especificar</span>`;
  itemOtro.onclick = () => {
    document.getElementById("input-nuevo-proy-proceso-busq").value = "Otro subproceso";
    document.getElementById("input-nuevo-proy-proceso-codigo").value = "OTRO";
    document.getElementById("input-nuevo-proy-proceso-nombre").value = "";
    document.getElementById("input-nuevo-proy-proceso-personalizado").value = "1";
    divSug.classList.add("hidden");
    if (contOtro) {
      contOtro.classList.remove("hidden");
      document.getElementById("input-otro-subproceso-texto")?.focus();
    }
  };
  divSug.appendChild(itemOtro);
  divSug.classList.remove("hidden");
}

export function autocompletarUOProyecto(termino) {
  const term = termino.toLowerCase().trim();
  const divSug = document.getElementById("sugerencias-uo-proyecto");
  if (!divSug) return;

  if (!term) {
    divSug.classList.add("hidden");
    return;
  }
  const matches = (state.catalogoUnidadesGlobal || []).filter(u => 
    u.sigla.toLowerCase().includes(term) || u.nombre.toLowerCase().includes(term)
  );
  divSug.innerHTML = "";
  if (matches.length === 0) {
    divSug.innerHTML = `<div class="p-2 text-gray-400">Sin coincidencias</div>`;
  } else {
    matches.slice(0, 5).forEach(u => {
      const item = document.createElement("div");
      item.className = "p-2 hover:bg-teal-50 cursor-pointer flex justify-between font-semibold";
      item.innerHTML = `<span>${u.nombre}</span><strong class="text-[#0f2a4a] ml-2">[${u.sigla}]</strong>`;
      item.onclick = () => {
        document.getElementById("input-nuevo-proy-uo-busq").value = `${u.sigla} - ${u.nombre}`;
        document.getElementById("input-nuevo-proy-uo-valor").value = u.sigla;
        divSug.classList.add("hidden");
      };
      divSug.appendChild(item);
    });
  }
  divSug.classList.remove("hidden");
}

export function autocompletarUOClonacion(termino) {
  const term = (termino || "").toLowerCase().trim();
  const divSug = document.getElementById("sugerencias-uo-clonacion");
  if (!divSug) return;

  if (!term) {
    divSug.classList.add("hidden");
    return;
  }
  const matches = (state.catalogoUnidadesGlobal || []).filter(u =>
    u.sigla.toLowerCase().includes(term) || u.nombre.toLowerCase().includes(term)
  );
  divSug.innerHTML = "";
  if (matches.length === 0) {
    divSug.innerHTML = `<div class="p-2 text-gray-400">Sin coincidencias</div>`;
  } else {
    matches.slice(0, 5).forEach(u => {
      const item = document.createElement("div");
      item.className = "p-2 hover:bg-teal-50 cursor-pointer flex justify-between font-semibold";
      item.innerHTML = `<span>${u.nombre}</span><strong class="text-[#0f2a4a] ml-2">[${u.sigla}]</strong>`;
      item.onclick = () => {
        document.getElementById("np-input-clon-uo-busq").value = `${u.sigla} - ${u.nombre}`;
        document.getElementById("np-input-clon-uo-valor").value = u.sigla;
        divSug.classList.add("hidden");
      };
      divSug.appendChild(item);
    });
  }
  divSug.classList.remove("hidden");
}

export async function guardarNuevoProyecto(e) {
  e.preventDefault();
  const nombre = document.getElementById("input-nuevo-proy-nombre").value.trim();
  const descripcion = document.getElementById("input-nuevo-proy-desc").value.trim();
  const uoBusq = document.getElementById("input-nuevo-proy-uo-busq").value.trim();
  const uoValor = document.getElementById("input-nuevo-proy-uo-valor").value.trim();

  const durationMode = document.getElementById("input-nuevo-proy-duration-mode")?.value || "business_days";
  const visibilidad = document.getElementById("input-nuevo-proy-visibilidad")?.value || "PRIVADO";

  const esPers = document.getElementById("input-nuevo-proy-proceso-personalizado")?.value === "1";
  const procCod = esPers ? "OTRO" : (document.getElementById("input-nuevo-proy-proceso-codigo")?.value || "");
  const procNom = esPers 
    ? (document.getElementById("input-otro-subproceso-texto")?.value.trim() || "Otro subproceso")
    : (document.getElementById("input-nuevo-proy-proceso-nombre")?.value || "");

  if (!nombre) {
    alert("Por favor ingresa un nombre para el proyecto.");
    return;
  }

  const unidadValida = (state.catalogoUnidadesGlobal || []).find(u => 
    u.sigla.toUpperCase() === uoValor.toUpperCase() ||
    u.sigla.toUpperCase() === uoBusq.toUpperCase() ||
    `${u.sigla} - ${u.nombre}`.toUpperCase() === uoBusq.toUpperCase() ||
    u.nombre.toUpperCase() === uoBusq.toUpperCase()
  );

  if (!unidadValida) {
    alert("⚠️ La Unidad de Organización no existe:\nDebe buscar y seleccionar una unidad que exista oficialmente.");
    document.getElementById("input-nuevo-proy-uo-busq").focus();
    return;
  }

  const uoFinal = unidadValida.sigla;
  const procRelacionado = procCod && procNom ? `${procCod} - ${procNom}` : (procNom || procCod || "");

  try {
    const res = await apiFetch("/proyectos", {
      method: "POST",
      body: JSON.stringify({ 
        nombre: nombre, 
        descripcion: descripcion, 
        unidad_organica: uoFinal,
        duration_mode: durationMode,
        visibilidad: visibilidad,
        proceso_codigo: procCod,
        proceso_nombre: procNom,
        proceso_relacionado: procRelacionado,
        es_proceso_personalizado: esPers ? 1 : 0
      })
    });
    
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "No se pudo crear el proyecto en el servidor.");
    }

    cerrarModalNuevoProyecto();
    await cargarHubProyectos();
    notificarToast("Proyecto creado exitosamente.", "success");
  } catch (err) {
    alert(err.message);
  }
}

export function editarDescripcionProyecto(id, descActual) {
  abrirInputCustom({
    titulo: "Editar descripción del proyecto",
    mensaje: "Escribe máximo 120 caracteres:",
    tipo: "text",
    valorActual: descActual || "",
    onAceptar: async (nuevaDesc) => {
      const descFinal = (nuevaDesc || "").trim().substring(0, 120);
      try {
        const res = await apiFetch(`/proyectos/${id}/descripcion`, {
          method: "PUT",
          body: JSON.stringify({ descripcion: descFinal })
        });

        if (res.ok) {
          await cargarHubProyectos();
        } else {
          const err = await res.json().catch(() => ({}));
          alert(err.detail || "No se pudo actualizar la descripción.");
        }
      } catch (e) {
        alert("Error de conexión al actualizar la descripción.");
      }
    }
  });
  
  const txtInput = document.getElementById("mic-input-text");
  if (txtInput) {
    txtInput.setAttribute("maxlength", "120");
    txtInput.placeholder = "Ej.: Proyecto institucional orientado a...";
  }
}

let proyectoEditandoUoId = null;

export function editarUnidadOrganicaProyecto(idProy, siglaActual) {
  const proyectoObj = (state.proyectosUsuarioGlobal || []).find(p => p.id === idProy);
  const esGestorDeEsteProyecto = proyectoObj ? (proyectoObj.es_gestor === 1 || proyectoObj.es_gestor === true) : false;

  if (!esGestorDeEsteProyecto && state.currentUser.rol !== "ADMIN_TI") {
    alert("Solo el gestor del proyecto puede modificar la unidad de organización.");
    return;
  }

  proyectoEditandoUoId = idProy;

  if (!state.catalogoUnidadesGlobal || state.catalogoUnidadesGlobal.length === 0) {
    cargarCatalogoUnidades();
  }

  const modalEl = document.getElementById("modal-editar-uo-proyecto");
  if (modalEl) modalEl.remove();

  const modalHtml = `
    <div id="modal-editar-uo-proyecto" class="fixed inset-0 bg-black/60 z-[120] flex items-center justify-center p-4 backdrop-blur-[1px]">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 flex flex-col">
        <div class="bg-[#0f2a4a] text-white p-4 flex justify-between items-center">
          <div class="flex items-center space-x-2">
            <span class="text-xl">🏢</span>
            <h3 class="font-black text-sm tracking-wide">Modificar unidad de organización</h3>
          </div>
          <button onclick="cerrarModalEditarUoProyecto()" class="text-white text-2xl font-bold hover:text-gray-300 leading-none">&times;</button>
        </div>
        
        <div class="p-6 space-y-4 text-xs">
          <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-blue-950 font-medium">
            Unidad actual asignada: <strong class="text-[#0f2a4a]">[${siglaActual}]</strong>
          </div>

          <div class="relative">
            <label class="block font-bold text-gray-700 uppercase mb-1">Buscar unidad (por sigla o nombre):</label>
            <input type="text" id="edit-uo-input-busq" oninput="autocompletarModalUOProyecto(this.value)" placeholder="Escriba sigla o nombre completo de unidad..." class="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg font-semibold text-gray-800 outline-none focus:bg-white focus:border-[#0f2a4a] transition" autocomplete="off">
            <input type="hidden" id="edit-uo-input-valor">
            <div id="edit-uo-sugerencias" class="hidden absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-lg shadow-2xl mt-1 max-h-48 overflow-y-auto z-[130] text-xs divide-y divide-gray-100"></div>
          </div>
        </div>

        <div class="p-3 bg-gray-100 border-t border-gray-200 flex justify-end space-x-2">
          <button type="button" onclick="cerrarModalEditarUoProyecto()" class="px-3.5 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold rounded-lg transition cursor-pointer">Cancelar</button>
          <button type="button" onclick="confirmarCambioUoProyecto()" class="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition shadow cursor-pointer">Actualizar unidad</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  setTimeout(() => document.getElementById("edit-uo-input-busq")?.focus(), 100);
}

export function autocompletarModalUOProyecto(termino) {
  const term = (termino || "").toLowerCase().trim();
  const divSug = document.getElementById("edit-uo-sugerencias");
  if (!divSug) return;

  if (!term) {
    divSug.innerHTML = "";
    divSug.classList.add("hidden");
    document.getElementById("edit-uo-input-valor").value = "";
    return;
  }

  const matches = (state.catalogoUnidadesGlobal || []).filter(u => 
    (u.estado === 'ACTIVO' || !u.estado) && (
      u.sigla.toLowerCase().includes(term) || 
      u.nombre.toLowerCase().includes(term)
    )
  );

  divSug.innerHTML = "";
  if (matches.length === 0) {
    divSug.innerHTML = `<div class="p-2.5 text-gray-400 italic">No se encontraron unidades con '${termino}'</div>`;
  } else {
    matches.slice(0, 6).forEach(u => {
      const item = document.createElement("div");
      item.className = "p-2.5 hover:bg-teal-50 cursor-pointer flex justify-between items-center transition border-b border-gray-100 last:border-0 font-semibold";
      item.title = `${u.nombre} [${u.sigla}]`;
      item.innerHTML = `
        <span class="text-gray-800 truncate pr-2">${u.nombre}</span>
        <strong class="text-[#0f2a4a] bg-slate-100 px-1.5 py-0.5 rounded border text-[10px] flex-shrink-0">[${u.sigla}]</strong>
      `;
      item.onclick = () => {
        document.getElementById("edit-uo-input-busq").value = `${u.sigla} - ${u.nombre}`;
        document.getElementById("edit-uo-input-valor").value = u.sigla;
        divSug.classList.add("hidden");
      };
      divSug.appendChild(item);
    });
  }
  divSug.classList.remove("hidden");
}

export function cerrarModalEditarUoProyecto() {
  document.getElementById("modal-editar-uo-proyecto")?.remove();
  proyectoEditandoUoId = null;
}

export async function confirmarCambioUoProyecto() {
  const uoBusq = document.getElementById("edit-uo-input-busq")?.value.trim() || "";
  const uoVal = document.getElementById("edit-uo-input-valor")?.value.trim() || "";

  const unidadValida = (state.catalogoUnidadesGlobal || []).find(u => 
    u.sigla.toUpperCase() === uoVal.toUpperCase() ||
    u.sigla.toUpperCase() === uoBusq.toUpperCase() ||
    `${u.sigla} - ${u.nombre}`.toUpperCase() === uoBusq.toUpperCase() ||
    u.nombre.toUpperCase() === uoBusq.toUpperCase()
  );

  if (!unidadValida) {
    alert("⚠️ La Unidad de Organización no existe:\nDebe buscar y seleccionar una unidad que exista oficialmente.");
    document.getElementById("edit-uo-input-busq").focus();
    return;
  }

  const siglaFinal = unidadValida.sigla;
  const idProy = proyectoEditandoUoId;

  cerrarModalEditarUoProyecto();

  try {
    const res = await apiFetch(`/proyectos/${idProy}/unidad-organica`, {
      method: "PUT",
      body: JSON.stringify({ unidad_organica: siglaFinal })
    });

    if (res.ok) {
      notificarToast(`Unidad del proyecto actualizada a [${siglaFinal}] con éxito.`, "success");
      await cargarHubProyectos();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "No se pudo actualizar la unidad de organización en el servidor.");
    }
  } catch (e) {
    alert("Error de conexión al intentar actualizar la unidad de organización.");
  }
}

let proyectoEditandoProcesoId = null;

export function editarProcesoProyectoModal(idProy) {
  const proyectoObj = (state.proyectosUsuarioGlobal || []).find(p => p.id === idProy);
  const esGestor = proyectoObj ? (proyectoObj.es_gestor === 1 || proyectoObj.es_gestor === true || state.currentUser.rol === "ADMIN_TI") : false;

  if (!esGestor) {
    alert("Solo el gestor del proyecto puede modificar el proceso relacionado.");
    return;
  }

  proyectoEditandoProcesoId = idProy;

  if (!state.catalogoProcesosGlobal || state.catalogoProcesosGlobal.length === 0) {
    cargarCatalogoProcesos();
  }

  const procActual = (proyectoObj.proceso_relacionado || proyectoObj.proceso_nombre || proyectoObj.proceso_codigo || "Ninguno").trim();

  const modalEl = document.getElementById("modal-editar-proceso-proyecto");
  if (modalEl) modalEl.remove();

  const modalHtml = `
    <div id="modal-editar-proceso-proyecto" class="fixed inset-0 bg-black/60 z-[130] flex items-center justify-center p-4 backdrop-blur-[1px]">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 flex flex-col">
        <div class="bg-[#0f2a4a] text-white p-4 flex justify-between items-center">
          <div class="flex items-center space-x-2">
            <span class="text-xl">⚙️</span>
            <h3 class="font-black text-sm tracking-wide">Modificar proceso o subproceso relacionado</h3>
          </div>
          <button onclick="cerrarModalEditarProcesoProyecto()" class="text-white text-2xl font-bold hover:text-gray-300 leading-none">&times;</button>
        </div>
        
        <div class="p-5 space-y-3.5 text-xs">
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800">
            Proceso actual: <strong class="text-[#0f2a4a]">${procActual}</strong>
          </div>

          <div class="relative">
            <label class="block font-bold text-gray-700 uppercase mb-1">Buscar proceso o subproceso vigente:</label>
            <input type="text" id="edit-proc-input-busq" oninput="autocompletarModalEditarProceso(this.value)" placeholder="Escriba código (ej.: E2.1.2) o nombre..." class="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg font-semibold text-gray-800 outline-none focus:bg-white focus:border-[#0f2a4a] transition" autocomplete="off">
            <input type="hidden" id="edit-proc-codigo">
            <input type="hidden" id="edit-proc-nombre">
            <input type="hidden" id="edit-proc-personalizado" value="0">
            <div id="edit-proc-sugerencias" class="hidden absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-lg shadow-2xl mt-1 max-h-48 overflow-y-auto z-[140] text-xs divide-y divide-gray-100"></div>
          </div>

          <div id="edit-proc-contenedor-otro" class="hidden p-2.5 bg-amber-50 rounded-lg border border-amber-200">
            <label class="block text-[10px] font-bold text-amber-800 uppercase mb-1">Especifique el subproceso personalizado:</label>
            <input type="text" id="edit-proc-otro-texto" placeholder="Nombre descriptivo..." class="w-full p-2 bg-white border border-amber-300 rounded text-xs font-semibold text-gray-800 outline-none focus:border-amber-600">
          </div>
        </div>

        <div class="p-3 bg-gray-100 border-t border-gray-200 flex justify-end space-x-2">
          <button type="button" onclick="cerrarModalEditarProcesoProyecto()" class="px-3.5 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold rounded-lg transition cursor-pointer">Cancelar</button>
          <button type="button" onclick="confirmarCambioProcesoProyecto()" class="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition shadow cursor-pointer">Actualizar proceso</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  setTimeout(() => document.getElementById("edit-proc-input-busq")?.focus(), 100);
}

export function autocompletarModalEditarProceso(term) {
  const q = (term || "").toLowerCase().trim();
  const div = document.getElementById("edit-proc-sugerencias");
  const contOtro = document.getElementById("edit-proc-contenedor-otro");
  if (!div) return;

  if (!q) {
    div.classList.add("hidden");
    return;
  }
  div.innerHTML = "";

  const matches = (state.catalogoProcesosGlobal || []).filter(p => 
    (p.codigo && p.codigo.toLowerCase().includes(q)) || (p.nombre && p.nombre.toLowerCase().includes(q))
  );

  matches.slice(0, 6).forEach(p => {
    const row = document.createElement("div");
    row.className = "p-2 hover:bg-teal-50 cursor-pointer flex justify-between items-center font-medium";
    row.innerHTML = `<span>${p.nombre}</span> <strong class="text-[#0f2a4a] text-[10px]">[${p.codigo}]</strong>`;
    row.onclick = () => {
      document.getElementById("edit-proc-input-busq").value = `${p.codigo} - ${p.nombre}`;
      document.getElementById("edit-proc-codigo").value = p.codigo;
      document.getElementById("edit-proc-nombre").value = p.nombre;
      document.getElementById("edit-proc-personalizado").value = "0";
      div.classList.add("hidden");
      if (contOtro) contOtro.classList.add("hidden");
    };
    div.appendChild(row);
  });

  const itemOtro = document.createElement("div");
  itemOtro.className = "p-2 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold cursor-pointer border-t border-amber-200 flex items-center justify-between";
  itemOtro.innerHTML = `<span>⚙️ Otro subproceso (personalizado)</span> <span class="text-[10px] text-amber-700">Especificar</span>`;
  itemOtro.onclick = () => {
    document.getElementById("edit-proc-input-busq").value = "Otro subproceso";
    document.getElementById("edit-proc-codigo").value = "OTRO";
    document.getElementById("edit-proc-nombre").value = "";
    document.getElementById("edit-proc-personalizado").value = "1";
    div.classList.add("hidden");
    if (contOtro) {
      contOtro.classList.remove("hidden");
      document.getElementById("edit-proc-otro-texto")?.focus();
    }
  };
  div.appendChild(itemOtro);
  div.classList.remove("hidden");
}

export function cerrarModalEditarProcesoProyecto() {
  document.getElementById("modal-editar-proceso-proyecto")?.remove();
  proyectoEditandoProcesoId = null;
}

export async function confirmarCambioProcesoProyecto() {
  const idProy = proyectoEditandoProcesoId;
  if (!idProy) return;

  const esPers = document.getElementById("edit-proc-personalizado")?.value === "1";
  const procCod = esPers ? "OTRO" : (document.getElementById("edit-proc-codigo")?.value || "");
  const procNom = esPers 
    ? (document.getElementById("edit-proc-otro-texto")?.value.trim() || "Otro subproceso")
    : (document.getElementById("edit-proc-nombre")?.value || "");

  const procRelacionado = procCod && procNom ? `${procCod} - ${procNom}` : (procNom || procCod || "");

  if (!procNom && !procCod) {
    alert("Debe seleccionar o especificar un proceso.");
    return;
  }

  cerrarModalEditarProcesoProyecto();

  try {
    const res = await apiFetch(`/proyectos/${idProy}/proceso`, {
      method: "PUT",
      body: JSON.stringify({
        proceso_codigo: procCod,
        proceso_nombre: procNom,
        proceso_relacionado: procRelacionado,
        es_proceso_personalizado: esPers ? 1 : 0
      })
    });

    if (res.ok) {
      notificarToast(`Proceso asignado: ${procRelacionado}`, "success");
      await cargarHubProyectos();
    } else {
      alert("Error al actualizar el proceso del proyecto.");
    }
  } catch (e) {
    alert("Error de conexión al actualizar proceso.");
  }
}

export function inicializarFiltrosHub() {
  const selUo = document.getElementById("hub-filtro-uo");
  if (!selUo) return;
  selUo.innerHTML = '<option value="">🏢 Todas las Unidades</option>';
  (state.catalogoUnidadesGlobal || []).forEach(u => {
    selUo.innerHTML += `<option value="${u.sigla}">${u.sigla} - ${u.nombre}</option>`;
  });
}

export function autocompletarUOHub(termino) {
  const term = (termino || "").toLowerCase().trim();
  const divSug = document.getElementById("hub-sugerencias-uo");
  const btnLimpiar = document.getElementById("btn-limpiar-filtro-uo");
  if (!divSug) return;

  if (btnLimpiar) btnLimpiar.classList.toggle("hidden", term.length === 0);

  if (!term) {
    divSug.innerHTML = "";
    divSug.classList.add("hidden");
    document.getElementById("hub-filtro-uo-valor").value = "";
    filtrarProyectosHub();
    return;
  }

  const matches = (state.catalogoUnidadesGlobal || []).filter(u => 
    (u.estado === 'ACTIVO' || !u.estado) && (
      u.sigla.toLowerCase().includes(term) || 
      u.nombre.toLowerCase().includes(term)
    )
  );

  divSug.innerHTML = "";
  if (matches.length === 0) {
    divSug.innerHTML = `<div class="p-2.5 text-gray-400 italic">Sin coincidencias</div>`;
  } else {
    matches.slice(0, 6).forEach(u => {
      const item = document.createElement("div");
      item.className = "p-2.5 hover:bg-teal-50 cursor-pointer flex justify-between items-center transition border-b border-gray-100 last:border-0 font-semibold";
      item.innerHTML = `
        <span class="text-gray-800 truncate pr-2">${u.nombre}</span>
        <strong class="text-[#0f2a4a] bg-slate-100 px-1.5 py-0.5 rounded border text-[10px] flex-shrink-0">[${u.sigla}]</strong>
      `;
      item.onclick = () => {
        document.getElementById("hub-filtro-uo-busq").value = `${u.sigla} - ${u.nombre}`;
        document.getElementById("hub-filtro-uo-valor").value = u.sigla;
        divSug.classList.add("hidden");
        filtrarProyectosHub();
      };
      divSug.appendChild(item);
    });
  }
  divSug.classList.remove("hidden");
}

export function limpiarFiltroUnidadHub() {
  const inpBusq = document.getElementById("hub-filtro-uo-busq");
  const inpVal = document.getElementById("hub-filtro-uo-valor");
  const divSug = document.getElementById("hub-sugerencias-uo");
  const btnLimpiar = document.getElementById("btn-limpiar-filtro-uo");

  if (inpBusq) inpBusq.value = "";
  if (inpVal) inpVal.value = "";
  if (divSug) divSug.classList.add("hidden");
  if (btnLimpiar) btnLimpiar.classList.add("hidden");

  filtrarProyectosHub();
}

export function obtenerProyectosFiltradosHub() {
  const query = (document.getElementById("hub-filtro-busqueda")?.value || "").toLowerCase().trim();
  const filtroUoVal = document.getElementById("hub-filtro-uo-valor")?.value || document.getElementById("hub-filtro-uo-busq")?.value || "";
  const filtroUo = filtroUoVal.includes(" - ") ? filtroUoVal.split(" - ")[0].trim() : filtroUoVal.trim();
  const filtroEstado = document.getElementById("hub-filtro-estado")?.value || "";

  return (state.proyectosUsuarioGlobal || []).filter(p => {
    const matchTexto = !query ||
      (p.nombre && p.nombre.toLowerCase().includes(query)) ||
      (p.descripcion && p.descripcion.toLowerCase().includes(query)) ||
      (p.proceso_nombre && p.proceso_nombre.toLowerCase().includes(query)) ||
      (p.proceso_codigo && p.proceso_codigo.toLowerCase().includes(query));

    let matchUo = true;
    if (filtroUo !== "") {
      const pUo = (p.unidad_organica || "").trim().toUpperCase();
      const fUo = filtroUo.toUpperCase();
      matchUo = (pUo === fUo || pUo.startsWith(fUo + " ") || pUo.includes(`[${fUo}]`));
    }

    let matchEstado = true;
    if (filtroEstado === "Ejecutado") matchEstado = (p.avance_global === 100);
    else if (filtroEstado === "En proceso") matchEstado = (p.avance_global > 0 && p.avance_global < 100);
    else if (filtroEstado === "No iniciado") matchEstado = (p.avance_global === 0);

    let matchSalud = true;
    if (filtroSaludActivoHub === "EN_PLAZO") {
      matchSalud = (p.salud_proyecto === "EN_PLAZO" || p.salud_proyecto === "COMPLETADO");
    } else if (filtroSaludActivoHub) {
      matchSalud = (p.salud_proyecto === filtroSaludActivoHub);
    }

    return matchTexto && matchUo && matchEstado && matchSalud;
  });
}

export function filtrarProyectosHub() {
  const filtrados = obtenerProyectosFiltradosHub();
  actualizarBadgeFiltrosHub();
  if (state.vistaHubActual === "table") renderizarTablaHub(filtrados);
  else renderizarTarjetasHub(filtrados);
}

export function actualizarBadgeFiltrosHub() {
  const query = (document.getElementById("hub-filtro-busqueda")?.value || "").trim();
  const uoVal = (document.getElementById("hub-filtro-uo-busq")?.value || "").trim();
  const estadoVal = document.getElementById("hub-filtro-estado")?.value || "";

  const hayFiltro = (query !== "" || uoVal !== "" || estadoVal !== "" || filtroSaludActivoHub !== "");
  const badgeDiv = document.getElementById("hub-badge-filtro-activo");
  const badgeTxt = document.getElementById("hub-badge-filtro-texto");

  if (!badgeDiv || !badgeTxt) return;
  if (hayFiltro) {
    const descripciones = [];
    if (query) descripciones.push(`Texto: "${query}"`);
    if (uoVal) descripciones.push(`Unidad: "${uoVal}"`);
    if (estadoVal) descripciones.push(`Estado: "${estadoVal}"`);
    if (filtroSaludActivoHub) {
      const etq = filtroSaludActivoHub === "CRITICO" ? "Con retraso" : (filtroSaludActivoHub === "ATENCION" ? "Por vencer" : "En plazo");
      descripciones.push(`Salud: ${etq}`);
    }
    badgeTxt.innerText = descripciones.join(" · ");
    badgeDiv.classList.remove("hidden");
    badgeDiv.classList.add("flex");
  } else {
    badgeDiv.classList.add("hidden");
    badgeDiv.classList.remove("flex");
  }
}

export function hubLimpiarTodosFiltros() {
  filtroSaludActivoHub = "";
  ["hub-card-kpi-plazo", "hub-card-kpi-atencion", "hub-card-kpi-critico"].forEach(idEl => {
    document.getElementById(idEl)?.classList.remove("kpi-pill-active-emerald", "kpi-pill-active-amber", "kpi-pill-active-rose");
  });

  const inpBusq = document.getElementById("hub-filtro-busqueda");
  const inpUo = document.getElementById("hub-filtro-uo-busq");
  const inpUoVal = document.getElementById("hub-filtro-uo-valor");
  const selEstado = document.getElementById("hub-filtro-estado");
  const btnLimpiarUo = document.getElementById("btn-limpiar-filtro-uo");

  if (inpBusq) inpBusq.value = "";
  if (inpUo) inpUo.value = "";
  if (inpUoVal) inpUoVal.value = "";
  if (selEstado) selEstado.value = "";
  if (btnLimpiarUo) btnLimpiarUo.classList.add("hidden");

  filtrarProyectosHub();
  notificarToast("Filtros del panel restablecidos correctamente.", "info");
}

// =========================================================================
// GOBERNANZA DE PLANTILLAS MAESTRAS (OFICIALES Y PERSONALES)
// =========================================================================

export async function cambiarTabNuevoProyecto(tab) {
  const btnBlanco = document.getElementById("np-tab-btn-blanco");
  const btnPlantilla = document.getElementById("np-tab-btn-plantilla");
  const contentBlanco = document.getElementById("np-tab-content-blanco");
  const contentPlantilla = document.getElementById("np-tab-content-plantilla");

  if (tab === "plantilla") {
    if (btnPlantilla) btnPlantilla.className = "px-4 py-2 rounded-t-lg bg-white text-[#0f2a4a] border-t border-l border-r border-gray-200 shadow-xs flex items-center space-x-1.5 font-bold";
    if (btnBlanco) btnBlanco.className = "px-4 py-2 rounded-t-lg text-gray-500 hover:text-[#0f2a4a] transition flex items-center space-x-1.5 font-bold";
    if (contentBlanco) contentBlanco.classList.add("hidden");
    if (contentPlantilla) contentPlantilla.classList.remove("hidden");
    await cargarPlantillasModalNuevoProyecto();
  } else {
    if (btnBlanco) btnBlanco.className = "px-4 py-2 rounded-t-lg bg-white text-[#0f2a4a] border-t border-l border-r border-gray-200 shadow-xs flex items-center space-x-1.5 font-bold";
    if (btnPlantilla) btnPlantilla.className = "px-4 py-2 rounded-t-lg text-gray-500 hover:text-[#0f2a4a] transition flex items-center space-x-1.5 font-bold";
    if (contentPlantilla) contentPlantilla.classList.add("hidden");
    if (contentBlanco) contentBlanco.classList.remove("hidden");
  }
}

export async function cargarPlantillasModalNuevoProyecto() {
  const sel = document.getElementById("np-select-plantilla");
  if (!sel) return;

  try {
    const res = await apiFetch("/plantillas");
    if (!res.ok) throw new Error("Error al consultar plantillas");
    const plantillas = await res.json();
    state.catalogoPlantillasGlobal = plantillas;
    window.catalogoPlantillasCache = plantillas;

    const oficiales = plantillas.filter(p => p.es_oficial === 1);
    const personales = plantillas.filter(p => p.es_oficial === 0);

    let html = `<option value="">-- Seleccione una plantilla --</option>`;

    if (personales.length > 0) {
      html += `<optgroup label="👤 MIS PLANTILLAS PERSONALES (visibles solo para mí)">`;
      personales.forEach(p => {
        const num = (p.actividades || []).length;
        html += `<option value="${p.id}">⭐ ${p.nombre} (${num} tareas)</option>`;
      });
      html += `</optgroup>`;
    }

    if (oficiales.length > 0) {
      html += `<optgroup label="🏛️ PLANTILLAS OFICIALES IMARPE (${oficiales.length} disponibles)">`;
      oficiales.forEach(p => {
        const num = (p.actividades || []).length;
        const codCorto = (p.categoria && p.categoria.includes(" - ")) ? `[${p.categoria.split(" - ")[0]}] ` : "";
        html += `<option value="${p.id}">${codCorto}${p.nombre} (${num} tareas)</option>`;
      });
      html += `</optgroup>`;
    }

    sel.innerHTML = html;

    if (plantillas.length > 0) {
      sel.value = String(plantillas[0].id);
      vincularProcesoDesdePlantillaSeleccionada();
    }
  } catch (e) {
    console.error("Error cargando plantillas:", e);
  }
}

export function vincularProcesoDesdePlantillaSeleccionada() {
  const selPlant = document.getElementById("np-select-plantilla");
  if (!selPlant) return;
  const pId = parseInt(selPlant.value, 10);
  if (!pId) return;

  const listaPlantillas = window.catalogoPlantillasCache || state.catalogoPlantillasGlobal || [];
  const plant = listaPlantillas.find(x => x.id === pId);
  if (!plant) return;

  const procVal = (plant.categoria && plant.categoria !== "General") ? plant.categoria : "";
  const inpProcOculto = document.getElementById("input-nuevo-proy-proceso");
  const inpBusqProc = document.getElementById("np-busqueda-proceso");

  if (inpProcOculto) inpProcOculto.value = procVal;
  if (inpBusqProc) inpBusqProc.value = procVal;

  const inpDescClon = document.getElementById("np-input-clon-desc");
  if (inpDescClon && plant.descripcion) inpDescClon.value = plant.descripcion;

  const inpNomClon = document.getElementById("np-input-clon-nombre");
  if (inpNomClon) inpNomClon.value = (plant.nombre || "").substring(0, 80);

  const inpFechaIni = document.getElementById("np-input-clon-fechaini");
  if (inpFechaIni && !inpFechaIni.value) {
    inpFechaIni.value = new Date().toISOString().split("T")[0];
  }
}

export async function ejecutarCreacionDesdePlantilla() {
  const selPlant = document.getElementById("np-select-plantilla");
  const plantillaId = selPlant ? parseInt(selPlant.value, 10) : null;

  if (!plantillaId) {
    alert("Por favor seleccione una plantilla de la lista.");
    return;
  }

  const nombre = document.getElementById("np-input-clon-nombre").value.trim();
  const uo = document.getElementById("np-input-clon-uo-valor").value || document.getElementById("np-input-clon-uo-busq").value.trim();
  const fIniISO = document.getElementById("np-input-clon-fechaini").value;
  const desc = document.getElementById("np-input-clon-desc")?.value.trim() || "";
  const durMode = document.getElementById("np-input-clon-duration-mode")?.value || "business_days";
  const visib = document.getElementById("np-input-clon-visibilidad")?.value || "PRIVADO";
  const procRelacionado = document.getElementById("input-nuevo-proy-proceso")?.value.trim() || document.getElementById("np-busqueda-proceso")?.value.trim() || "";

  if (!nombre) {
    alert("Por favor ingrese un nombre para el proyecto.");
    return;
  }

  let procCod = "";
  let procNom = "";
  if (procRelacionado.includes(" - ")) {
    const partes = procRelacionado.split(" - ");
    procCod = partes[0].trim();
    procNom = partes.slice(1).join(" - ").trim();
  } else {
    procNom = procRelacionado;
  }

  const fIniLatina = formatearFechaLatina(fIniISO);

  try {
    const res = await apiFetch("/proyectos/desde-plantilla", {
      method: "POST",
      body: JSON.stringify({
        plantilla_id: plantillaId,
        nombre_proyecto: nombre,
        descripcion: desc,
        unidad_organica: uo,
        fecha_inicio: fIniLatina,
        proceso_codigo: procCod,
        proceso_nombre: procNom,
        proceso_relacionado: procRelacionado,
        es_proceso_personalizado: 0,
        duration_mode: durMode,
        visibilidad: visib
      })
    });

    if (res.ok) {
      const data = await res.json();
      cerrarModalNuevoProyecto();
      notificarToast("Proyecto generado desde plantilla exitosamente.", "success");
      await cargarHubProyectos();
      if (data.proyecto_id && typeof window.ingresarAlProyecto === "function") {
        window.ingresarAlProyecto(data.proyecto_id, nombre, true);
      }
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al crear proyecto desde plantilla.");
    }
  } catch (e) {
    alert("Error de conexión al crear el proyecto.");
  }
}

// =========================================================================
// MOTOR ANALÍTICO TIPO POWER BI (ESTADÍSTICAS HUB)
// =========================================================================
let tipoGraficoActual = 'bar';
let chartInstancia = null;

export async function cargarCatalogoProcesos() {
  try {
    const res = await apiFetch("/procesos-institucionales");
    if (res.ok) state.catalogoProcesosGlobal = await res.json();
  } catch (e) {
    console.error("Error al cargar procesos:", e);
  }
}

export async function abrirModalEstadisticasHub() {
  if (!state.catalogoProcesosGlobal || state.catalogoProcesosGlobal.length === 0) {
    await cargarCatalogoProcesos();
  }

  const selUo = document.getElementById("stat-filtro-uo");
  if (selUo) {
    const uosExistentes = [...new Set((state.proyectosUsuarioGlobal || []).map(p => p.unidad_organica).filter(Boolean))];
    selUo.innerHTML = '<option value="">🏢 Todas las Unidades</option>' + 
      uosExistentes.map(u => `<option value="${u}">${u}</option>`).join("");
  }

  document.getElementById("modal-estadisticas-hub")?.classList.remove("hidden");
  aplicarFiltrosEstadisticas();
}

export function cerrarModalEstadisticasHub() {
  document.getElementById("modal-estadisticas-hub")?.classList.add("hidden");
  if (chartInstancia) {
    chartInstancia.destroy();
    chartInstancia = null;
  }
}

export function conmutarTipoGrafico(tipo) {
  tipoGraficoActual = tipo;
  const btnBarras = document.getElementById("btn-chart-barras");
  const btnPastel = document.getElementById("btn-chart-pastel");

  if (tipo === 'bar') {
    if (btnBarras) btnBarras.className = "px-2.5 py-1 rounded-md bg-white shadow-2xs text-[#0f2a4a] transition";
    if (btnPastel) btnPastel.className = "px-2.5 py-1 rounded-md text-gray-500 hover:text-gray-900 transition";
  } else {
    if (btnPastel) btnPastel.className = "px-2.5 py-1 rounded-md bg-white shadow-2xs text-[#0f2a4a] transition";
    if (btnBarras) btnBarras.className = "px-2.5 py-1 rounded-md text-gray-500 hover:text-gray-900 transition";
  }
  aplicarFiltrosEstadisticas();
}

export function aplicarFiltrosEstadisticas() {
  const procCod = (document.getElementById("stat-filtro-proceso-val")?.value || "").trim().toUpperCase();
  const procTexto = (document.getElementById("stat-filtro-proceso")?.value || "").trim().toUpperCase();
  const uoFiltro = document.getElementById("stat-filtro-uo")?.value || "";
  const estFiltro = document.getElementById("stat-filtro-estado")?.value || "";

  const proyectosFiltrados = (state.proyectosUsuarioGlobal || []).filter(p => {
    if (uoFiltro && p.unidad_organica !== uoFiltro) return false;
    
    if (estFiltro) {
      const av = p.avance_global || 0;
      const estadoCalc = av === 100 ? "Ejecutado" : (av > 0 ? "En proceso" : "No iniciado");
      if (estadoCalc !== estFiltro) return false;
    }

    if (procCod || procTexto) {
      const codP = (p.proceso_codigo || "").toUpperCase();
      const nomP = (p.proceso_nombre || p.proceso_relacionado || "").toUpperCase();
      const matchCod = procCod && (codP === procCod || codP.startsWith(procCod + "."));
      const matchNom = procTexto && (nomP.includes(procTexto) || codP.includes(procTexto));
      if (!matchCod && !matchNom) return false;
    }

    return true;
  });

  actualizarKPIsEstadisticas(proyectosFiltrados);
  renderizarGraficoEstadisticas(proyectosFiltrados);
  renderizarTablaDetalleEstadisticas(proyectosFiltrados);
}

function actualizarKPIsEstadisticas(lista) {
  const total = lista.length;
  let sumaAvance = 0, enProc = 0, ejec = 0;

  lista.forEach(p => {
    const av = p.avance_global || 0;
    sumaAvance += av;
    if (av === 100) ejec++;
    else if (av > 0) enProc++;
  });

  const prom = total > 0 ? Math.round(sumaAvance / total) : 0;

  const kTotal = document.getElementById("stat-kpi-total");
  const kProm = document.getElementById("stat-kpi-promedio");
  const kProc = document.getElementById("stat-kpi-en-proceso");
  const kEjec = document.getElementById("stat-kpi-ejecutados");

  if (kTotal) kTotal.innerText = total;
  if (kProm) kProm.innerText = `${prom}%`;
  if (kProc) kProc.innerText = enProc;
  if (kEjec) kEjec.innerText = ejec;
}

function renderizarGraficoEstadisticas(lista) {
  const canvas = document.getElementById("canvasEstadisticasHub");
  if (!canvas || typeof Chart === 'undefined') return;
  const ctx = canvas.getContext("2d");

  if (chartInstancia) chartInstancia.destroy();
  if (lista.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  if (tipoGraficoActual === 'bar') {
    const labels = lista.map(p => p.nombre.length > 25 ? p.nombre.substring(0, 22) + "..." : p.nombre);
    const data = lista.map(p => p.avance_global || 0);

    chartInstancia = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '% Avance',
          data: data,
          backgroundColor: data.map(v => v === 100 ? '#10b981' : (v > 0 ? '#0d9488' : '#cbd5e1')),
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } },
        plugins: { legend: { display: false } }
      }
    });
  } else {
    let noInic = 0, enProc = 0, ejec = 0;
    lista.forEach(p => {
      const av = p.avance_global || 0;
      if (av === 100) ejec++;
      else if (av > 0) enProc++;
      else noInic++;
    });

    chartInstancia = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['No iniciado', 'En proceso', 'Ejecutado'],
        datasets: [{
          data: [noInic, enProc, ejec],
          backgroundColor: ['#cbd5e1', '#f59e0b', '#10b981']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }
}

function renderizarTablaDetalleEstadisticas(lista) {
  const cont = document.getElementById("stat-tabla-proyectos");
  const lblConteo = document.getElementById("stat-conteo-tabla");
  if (!cont) return;

  if (lblConteo) lblConteo.innerText = `${lista.length} proyecto(s)`;
  if (lista.length === 0) {
    cont.innerHTML = '<div class="p-4 text-center text-gray-400 italic">No hay proyectos coincidentes con los filtros seleccionados.</div>';
    return;
  }

  cont.innerHTML = lista.map(p => `
    <div class="p-3 flex items-center justify-between hover:bg-slate-50 transition">
      <div class="flex-1 pr-4">
        <h5 class="font-bold text-gray-800 text-xs">${p.nombre}</h5>
        <p class="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
          <span>🏢 ${p.unidad_organica || 'Sin UO'}</span>
          <span>•</span>
          <span class="text-teal-700 font-semibold">⚙️ ${p.proceso_relacionado ? p.proceso_relacionado : (p.proceso_nombre ? `${p.proceso_nombre} [${p.proceso_codigo}]` : 'Sin proceso')}</span>
        </p>
      </div>
      <div class="flex items-center space-x-3">
        <span class="text-xs font-black px-2 py-0.5 rounded ${p.avance_global === 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-teal-100 text-teal-800'}">
          ${p.avance_global || 0}%
        </span>
        <button onclick="cerrarModalEstadisticasHub(); ingresarAlProyecto(${p.id}, '${p.nombre.replace(/'/g, "\\'")}', ${(p.es_gestor === 1 || p.es_gestor === true)});" class="text-xs font-bold text-[#0f2a4a] hover:underline cursor-pointer">
          Ver →
        </button>
      </div>
    </div>
  `).join("");
}

export function autocompletarSlicerProceso(term) {
  const q = (term || "").toLowerCase().trim();
  const div = document.getElementById("stat-sugerencias-proceso");
  const btnLimpiar = document.getElementById("btn-limpiar-stat-proceso");
  if (!div) return;

  if (!q) {
    div.classList.add("hidden");
    if (btnLimpiar) btnLimpiar.classList.add("hidden");
    const valInp = document.getElementById("stat-filtro-proceso-val");
    if (valInp) valInp.value = "";
    aplicarFiltrosEstadisticas();
    return;
  }

  if (btnLimpiar) btnLimpiar.classList.remove("hidden");
  div.innerHTML = "";

  const matches = (state.catalogoProcesosGlobal || []).filter(p => 
    (p.codigo && p.codigo.toLowerCase().includes(q)) || (p.nombre && p.nombre.toLowerCase().includes(q))
  );

  if (matches.length === 0) {
    div.innerHTML = `<div class="p-2 text-gray-400 italic">Sin coincidencias</div>`;
  } else {
    matches.slice(0, 6).forEach(p => {
      const item = document.createElement("div");
      item.className = "p-2 hover:bg-teal-50 cursor-pointer flex justify-between items-center font-medium";
      item.innerHTML = `<span>${p.nombre}</span> <strong class="text-[#0f2a4a] text-[10px]">[${p.codigo}]</strong>`;
      item.onclick = () => {
        document.getElementById("stat-filtro-proceso").value = `${p.nombre} [${p.codigo}]`;
        document.getElementById("stat-filtro-proceso-val").value = p.codigo;
        div.classList.add("hidden");
        aplicarFiltrosEstadisticas();
      };
      div.appendChild(item);
    });
  }
  div.classList.remove("hidden");
}

export function limpiarSlicerProceso() {
  const fTxt = document.getElementById("stat-filtro-proceso");
  const fVal = document.getElementById("stat-filtro-proceso-val");
  const bLim = document.getElementById("btn-limpiar-stat-proceso");
  if (fTxt) fTxt.value = "";
  if (fVal) fVal.value = "";
  if (bLim) bLim.classList.add("hidden");
  aplicarFiltrosEstadisticas();
}

export function resetearSlicersEstadisticas() {
  limpiarSlicerProceso();
  const sUo = document.getElementById("stat-filtro-uo");
  const sEst = document.getElementById("stat-filtro-estado");
  if (sUo) sUo.value = "";
  if (sEst) sEst.value = "";
  aplicarFiltrosEstadisticas();
}

let scrollListenerHubInicializado = false;

export function inicializarScrollTopHub() {
  if (scrollListenerHubInicializado) return;
  const viewHub = document.getElementById("view-hub");
  if (!viewHub) return;

  scrollListenerHubInicializado = true;
  viewHub.addEventListener("scroll", () => {
    const btnTop = document.getElementById("btn-scroll-top-hub");
    if (!btnTop) return;
    if (viewHub.scrollTop > 240) {
      btnTop.classList.remove("opacity-0", "translate-y-4", "pointer-events-none");
      btnTop.classList.add("opacity-100", "translate-y-0", "pointer-events-auto");
    } else {
      btnTop.classList.remove("opacity-100", "translate-y-0", "pointer-events-auto");
      btnTop.classList.add("opacity-0", "translate-y-4", "pointer-events-none");
    }
  }, { passive: true });
}

export function volverArribaHubSuave() {
  const viewHub = document.getElementById("view-hub");
  if (viewHub) {
    viewHub.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// Exposición pública completa al objeto window
window.cargarHubProyectos = cargarHubProyectos;
window.cambiarVistaHub = cambiarVistaHub;
window.hubFiltrarPorSalud = hubFiltrarPorSalud;
window.cambiarModoRadarHub = cambiarModoRadarHub;
window.renderizarRadarPreventivoHub = renderizarRadarPreventivoHub;
window.alternarColapsoRadar = alternarColapsoRadar;
window.alternarVerProyectosOcultos = alternarVerProyectosOcultos;
window.alternarOcultarProyecto = alternarOcultarProyecto;
window.solicitarEliminarProyecto = solicitarEliminarProyecto;
window.exportarResumenProyectosExcel = exportarResumenProyectosExcel;
window.abrirModalNuevoProyecto = abrirModalNuevoProyecto;
window.cerrarModalNuevoProyecto = cerrarModalNuevoProyecto;
window.autocompletarUOProyecto = autocompletarUOProyecto;
window.autocompletarUOClonacion = autocompletarUOClonacion;
window.guardarNuevoProyecto = guardarNuevoProyecto;
window.editarDescripcionProyecto = editarDescripcionProyecto;
window.editarUnidadOrganicaProyecto = editarUnidadOrganicaProyecto;
window.autocompletarModalUOProyecto = autocompletarModalUOProyecto;
window.cerrarModalEditarUoProyecto = cerrarModalEditarUoProyecto;
window.confirmarCambioUoProyecto = confirmarCambioUoProyecto;
window.editarProcesoProyectoModal = editarProcesoProyectoModal;
window.autocompletarModalEditarProceso = autocompletarModalEditarProceso;
window.cerrarModalEditarProcesoProyecto = cerrarModalEditarProcesoProyecto;
window.confirmarCambioProcesoProyecto = confirmarCambioProcesoProyecto;
window.autocompletarUOHub = autocompletarUOHub;
window.limpiarFiltroUnidadHub = limpiarFiltroUnidadHub;
window.filtrarProyectosHub = filtrarProyectosHub;
window.hubLimpiarTodosFiltros = hubLimpiarTodosFiltros;
window.cambiarTabNuevoProyecto = cambiarTabNuevoProyecto;
window.cargarPlantillasModalNuevoProyecto = cargarPlantillasModalNuevoProyecto;
window.vincularProcesoDesdePlantillaSeleccionada = vincularProcesoDesdePlantillaSeleccionada;
window.ejecutarCreacionDesdePlantilla = ejecutarCreacionDesdePlantilla;
window.abrirModalEstadisticasHub = abrirModalEstadisticasHub;
window.cerrarModalEstadisticasHub = cerrarModalEstadisticasHub;
window.conmutarTipoGrafico = conmutarTipoGrafico;
window.aplicarFiltrosEstadisticas = aplicarFiltrosEstadisticas;
window.autocompletarSlicerProceso = autocompletarSlicerProceso;
window.limpiarSlicerProceso = limpiarSlicerProceso;
window.resetearSlicersEstadisticas = resetearSlicersEstadisticas;
window.autocompletarProcesoNuevoProy = autocompletarProcesoNuevoProy;
window.abrirModalMisPendientesHub = abrirModalMisPendientesHub;
window.cerrarModalMisPendientesHub = cerrarModalMisPendientesHub;
window.sincronizarContadorHeaderPendientes = sincronizarContadorHeaderPendientes;
window.mostrarTooltipMiniCardRadar = mostrarTooltipMiniCardRadar;
window.ocultarTooltipMiniCardRadar = ocultarTooltipMiniCardRadar;
window.iniciarRedimensionVerticalRadar = iniciarRedimensionVerticalRadar;
window.alternarColapsoPortafolioHub = alternarColapsoPortafolioHub;
window.alternarMenuConfigVistasHub = alternarMenuConfigVistasHub;
window.conmutarVisibilidadBloqueHub = conmutarVisibilidadBloqueHub;
window.restablecerBloquesHub = restablecerBloquesHub;
window.mostrarTooltipProyectoAlertasHub = mostrarTooltipProyectoAlertasHub;
window.mostrarTooltipDescripcionHub = mostrarTooltipDescripcionHub;
window.volverArribaHubSuave = volverArribaHubSuave;