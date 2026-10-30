// =========================================================================
// PUNTO DE ENTRADA PRINCIPAL Y ORQUESTADOR ES6
// =========================================================================

import { state } from "./core/state.js";
import { apiFetch } from "./core/api.js";
import { notificarToast } from "./core/ui-dialogs.js";
import { inicializarFormularioLogin, actualizarDisplaysUsuario, mostrarLogin } from "./modules/auth.js?v=100033";
import { cargarHubProyectos } from "./modules/hub.js?v=100033";
import { ingresarAlProyecto, volverAlHub, sincronizarDatosProyecto } from "./modules/project-view/project-core.js?v=100033";
import { cambiarSemanaInicio } from "./modules/project-view/project-gantt.js?v=100033";
import { sumarDiasHabiles, calcularFechaFinPorModalidad, abrirModalPegarListaTareas, cerrarModalPegarListaTareas, confirmarPegadoLoteTareas, actualizarAparienciaBotonesFiltro } from "./modules/project-view/project-wbs.js?v=100033";
import "./modules/admin-ti.js?v=100033";
import "./modules/project-view/index.js?v=100033";
import "./modules/agenda/agenda-pendientes.js?v=100033";

// Exposición directa garantizada sin intermediarios de caché
window.ingresarAlProyecto = ingresarAlProyecto;
window.volverAlHub = volverAlHub;
window.abrirModalPegarListaTareas = abrirModalPegarListaTareas;
window.cerrarModalPegarListaTareas = cerrarModalPegarListaTareas;
window.confirmarPegadoLoteTareas = confirmarPegadoLoteTareas;
window.actualizarAparienciaBotonesFiltro = actualizarAparienciaBotonesFiltro;

// 0. Control del Splash Minimalista con seguro anti-bloqueo (Watchdog)
let timerSeguroSplash = null;

window.mostrarSplashSprin = () => {
  clearTimeout(timerSeguroSplash);
  const sp = document.getElementById("splash-screen-sprin");
  if (sp) {
    sp.classList.remove("hidden", "opacity-0", "pointer-events-none");
    sp.classList.add("opacity-100");
  }
  // Seguro automático: nunca permitir que el splash quede pegado más de 1.5 segundos
  timerSeguroSplash = setTimeout(() => {
    window.ocultarSplashSprin();
  }, 1500);
};

window.ocultarSplashSprin = () => {
  clearTimeout(timerSeguroSplash);
  const sp = document.getElementById("splash-screen-sprin");
  if (sp) {
    sp.classList.remove("opacity-100");
    sp.classList.add("opacity-0", "pointer-events-none");
    setTimeout(() => sp.classList.add("hidden"), 150);
  }
};

// Función global infalible para "+ Crear Rápido" y "+ Agregar (Enter)"
window.crearActividadRapidaInline = async () => {
  const inputs = Array.from(document.querySelectorAll("#input-quick-add-wbs"));
  const inp = inputs.find(el => el.value && el.value.trim() !== "") || inputs[0];
  if (!inp) return;

  const desc = inp.value.trim();
  if (!desc) {
    inp.focus();
    return;
  }

  inp.disabled = true;
  try {
    const raices = (state.actividadesGlobal || []).filter(a => !String(a.codigo).replace(/\.+$/, "").includes("."));
    let maxNum = 0;
    raices.forEach(r => {
      const n = parseInt(String(r.codigo).replace(/\.+$/, ""), 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    });
    const nuevoCodigo = String(maxNum + 1);

    const hoy = new Date();
    const dtIniHabil = sumarDiasHabiles ? sumarDiasHabiles(hoy, 1) : hoy;
    const duracionDef = (state.proyectoModoDuracion === "hours") ? 8 : 3;
    const dtFinHabil = calcularFechaFinPorModalidad ? calcularFechaFinPorModalidad(dtIniHabil, duracionDef, state.proyectoModoDuracion) : dtIniHabil;

    const fIniStr = `${String(dtIniHabil.getDate()).padStart(2, '0')}/${String(dtIniHabil.getMonth() + 1).padStart(2, '0')}/${dtIniHabil.getFullYear()}`;
    const fFinStr = `${String(dtFinHabil.getDate()).padStart(2, '0')}/${String(dtFinHabil.getMonth() + 1).padStart(2, '0')}/${dtFinHabil.getFullYear()}`;

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
      notificarToast(`Actividad [${nuevoCodigo}] creada con éxito.`, "success", 2500);
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
};

// Flechas Izquierda / Derecha del Gantt adaptadas a la escala
window.desplazarGanttPorEscala = (direccion) => {
  const dir = direccion > 0 ? 1 : -1;
  let salto = 1;
  if (state.modoZoom === "meses") salto = 4;
  else if (state.modoZoom === "trimestres") salto = 12;
  else if (state.modoZoom === "semestres") salto = 24;
  cambiarSemanaInicio(dir * salto);
};

// Auto-cierre inteligente del menú Opciones
let timerCierreOpcionesGlobal = null;
window.iniciarCierreMenuOpciones = () => {
  clearTimeout(timerCierreOpcionesGlobal);
  timerCierreOpcionesGlobal = setTimeout(() => {
    document.getElementById("menu-herramientas-vista")?.classList.add("hidden");
  }, 220);
};
window.cancelarCierreMenuOpciones = () => {
  if (timerCierreOpcionesGlobal) {
    clearTimeout(timerCierreOpcionesGlobal);
    timerCierreOpcionesGlobal = null;
  }
};
window.cerrarMenuOpcionesInmediato = () => {
  window.cancelarCierreMenuOpciones();
  document.getElementById("menu-herramientas-vista")?.classList.add("hidden");
};

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Reubicar modales en la raíz directa del BODY para evitar colisiones de stacking context
  const idsModales = [
    "modal-wizard-creacion", "modal-columnas", "modal-dependencias", "modal-cpm", 
    "modal-historial", "modal-responsables", "modal-admin-ti", "modal-editar-trabajador-ti", 
    "modal-trabajadores-baja", "modal-notificacion-correo", "modal-comentarios", 
    "modal-nuevo-proyecto", "modal-guardar-plantilla", "modal-importar-plantilla-proyecto",
    "modal-dialog-imarpe", "modal-input-custom", "modal-fecha-custom", "modal-fin-interactiva",
    "modal-asignar-responsables", "modal-estadisticas-hub", "modal-editar-feriado",
    "modal-agenda-pendiente", "modal-detalle-pendiente"
  ];
  idsModales.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.parentElement !== document.body) {
      document.body.appendChild(el);
    }
  });

  // 2. Control de scroll en el Hub para cerrar sugerencias flotantes
  const viewHubEl = document.getElementById("view-hub");
  if (viewHubEl) {
    viewHubEl.addEventListener("scroll", () => {
      const divSug = document.getElementById("hub-sugerencias-uo");
      if (divSug && !divSug.classList.contains("hidden")) divSug.classList.add("hidden");
    }, { passive: true });
  }

  document.addEventListener("click", (e) => {
    const divSug = document.getElementById("hub-sugerencias-uo");
    const inpBusq = document.getElementById("hub-filtro-uo-busq");
    if (divSug && !divSug.classList.contains("hidden")) {
      if (!divSug.contains(e.target) && e.target !== inpBusq) divSug.classList.add("hidden");
    }
    const menuOpc = document.getElementById("menu-herramientas-vista");
    if (menuOpc && !menuOpc.classList.contains("hidden")) {
      if (!e.target.closest("#menu-herramientas-vista") && !e.target.closest("[onclick*='menu-herramientas-vista']")) {
        menuOpc.classList.add("hidden");
      }
    }
  });

  // Deseleccionar fila si se hace clic en el área vacía del dashboard o fuera de las filas
  const viewDashboard = document.getElementById("view-dashboard");
  if (viewDashboard) {
    viewDashboard.addEventListener("click", (e) => {
      // Si el clic no fue dentro de una fila de actividad, ni en menús o modales
      if (!e.target.closest("#lista-actividades tr") && 
          !e.target.closest("#bloque-superior-gantt") && 
          !e.target.closest("#menu-contextual") &&
          !e.target.closest(".fixed")) {
        if (typeof window.deseleccionarFila === "function") {
          window.deseleccionarFila();
        }
      }
    });
  }

  const ocultarSplashInicial = () => {
    const sp = document.getElementById("splash-screen-sprin");
    if (sp) {
      sp.classList.add("opacity-0", "pointer-events-none");
      setTimeout(() => sp.remove(), 220);
    }
  };

  // 3. Inicializar autenticación y evaluar sesión activa (manteniendo el proyecto en F5)
  inicializarFormularioLogin();

  if (state.token && state.currentUser.username) {
    document.getElementById("view-login")?.classList.add("hidden");
    actualizarDisplaysUsuario();

    const proyGuardadoStr = localStorage.getItem("sprin_proyecto_activo");
    if (proyGuardadoStr) {
      try {
        const proyG = JSON.parse(proyGuardadoStr);
        if (proyG && proyG.id) {
          await ingresarAlProyecto(proyG.id, proyG.nombre, proyG.esGestor);
          window.ocultarSplashSprin();
        } else {
          await cargarHubProyectos();
          window.ocultarSplashSprin();
        }
      } catch (e) {
        await cargarHubProyectos();
        window.ocultarSplashSprin();
      }
    } else {
      await cargarHubProyectos();
      window.ocultarSplashSprin();
    }
  } else {
    mostrarLogin();
    window.ocultarSplashSprin();
  }

  // 4. Autoguardado reactivo del nombre del proyecto (máx. 80 caracteres, 1 o 2 líneas y contador en vivo)
  const inputNombreProy = document.getElementById("txt-nombre-proyecto");
  const badgeContadorTit = document.getElementById("contador-titulo-proyecto");

  window.ajustarAlturaTituloProyecto = (el) => {
    if (!el) return;
    el.style.height = "auto";
    const nuevaAlt = Math.min(44, Math.max(24, el.scrollHeight));
    el.style.height = `${nuevaAlt}px`;
    if (badgeContadorTit) {
      badgeContadorTit.innerText = `${el.value.length}/80`;
    }
  };

  if (inputNombreProy) {
    let nombreOriginalAlEnfocar = "";
    inputNombreProy.addEventListener("focus", () => {
      if (!state.proyectoEsGestor) return;
      nombreOriginalAlEnfocar = inputNombreProy.value.trim();
      if (badgeContadorTit) {
        badgeContadorTit.innerText = `${inputNombreProy.value.length}/80`;
        badgeContadorTit.classList.remove("hidden");
      }
    });

    const guardarNombreProyecto = async () => {
      if (badgeContadorTit) badgeContadorTit.classList.add("hidden");
      window.ajustarAlturaTituloProyecto(inputNombreProy);
      if (!state.proyectoActualId || !state.proyectoEsGestor) return;
      const nuevoNombre = inputNombreProy.value.trim().substring(0, 80);
      if (!nuevoNombre) {
        inputNombreProy.value = nombreOriginalAlEnfocar;
        window.ajustarAlturaTituloProyecto(inputNombreProy);
        return;
      }
      if (nuevoNombre === nombreOriginalAlEnfocar) return;

      try {
        const res = await fetch(`/proyectos/${state.proyectoActualId}/nombre`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${state.token}`
          },
          body: JSON.stringify({ nombre: nuevoNombre })
        });

        if (res.ok) {
          nombreOriginalAlEnfocar = nuevoNombre;
          sessionStorage.setItem("sprin_proyecto_activo", JSON.stringify({
            id: state.proyectoActualId,
            nombre: nuevoNombre,
            esGestor: state.proyectoEsGestor
          }));
          notificarToast("Nombre del proyecto actualizado con éxito.", "success");
        }
      } catch (e) {}
    };

    inputNombreProy.addEventListener("blur", guardarNombreProyecto);
    inputNombreProy.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        inputNombreProy.blur();
      }
    });
  }

  // 5. Motor de desplazamiento temporal con rueda (Wheel) a 60 FPS
  let acumuladorScrollGantt = 0;
  let ultimoPasoScrollGantt = 0;
  let timerInerciaScroll = null;
  const UMBRAL_SCROLL_NATURAL_PX = 40;
  const CADENCIA_SCROLL_MS = 16;

  window.addEventListener("wheel", (e) => {
    const dashboard = document.getElementById("view-dashboard");
    if (!dashboard || dashboard.classList.contains("hidden")) return;

    const sobreAreaGantt = e.target.closest("#th-gantt, #gantt-header-meses, #gantt-header-semanas, td:nth-child(9), .gantt-avatar-circle");
    if (sobreAreaGantt) {
      e.preventDefault();

      if (e.ctrlKey) {
        const dirZoom = e.deltaY > 0 ? -1 : 1;
        const mapeo = { "semestres": 1, "trimestres": 2, "meses": 3, "semanas": 4, "dias": 5 };
        const reversa = { 1: "semestres", 2: "trimestres", 3: "meses", 4: "semanas", 5: "dias" };
        let nivelActual = mapeo[state.modoZoom] || 4;
        let nuevoNivel = Math.max(1, Math.min(5, nivelActual + dirZoom));
        if (typeof window.fijarModoZoomDirecto === "function") {
          window.fijarModoZoomDirecto(reversa[nuevoNivel]);
        }
        return;
      }

      clearTimeout(timerInerciaScroll);
      timerInerciaScroll = setTimeout(() => { acumuladorScrollGantt = 0; }, 120);

      let delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (e.deltaMode === 1) delta *= 33;
      else if (e.deltaMode === 2) delta *= 100;

      if ((delta > 0 && acumuladorScrollGantt < 0) || (delta < 0 && acumuladorScrollGantt > 0)) {
        acumuladorScrollGantt = 0;
      }

      acumuladorScrollGantt += delta;
      const ahora = Date.now();

      if (Math.abs(acumuladorScrollGantt) >= UMBRAL_SCROLL_NATURAL_PX && (ahora - ultimoPasoScrollGantt >= CADENCIA_SCROLL_MS)) {
        const direccion = acumuladorScrollGantt > 0 ? 1 : -1;
        let saltoTemporal = 1;
        if (state.modoZoom === "meses") saltoTemporal = 4;
        else if (state.modoZoom === "trimestres") saltoTemporal = 13;
        else if (state.modoZoom === "semestres") saltoTemporal = 26;

        const pasos = direccion * saltoTemporal;
        acumuladorScrollGantt = acumuladorScrollGantt > 0
          ? Math.max(0, acumuladorScrollGantt - UMBRAL_SCROLL_NATURAL_PX)
          : Math.min(0, acumuladorScrollGantt + UMBRAL_SCROLL_NATURAL_PX);

        ultimoPasoScrollGantt = ahora;
        if (typeof window.cambiarSemanaInicio === "function") {
          window.cambiarSemanaInicio(pasos);
        }
      }
    }
  }, { passive: false });

  // 6. Arrastre horizontal interactivo del Gantt
  let estaArrastrandoGantt = false;
  let inicioXGantt = 0;
  let acumuladorDeltaXGantt = 0;
  const SENSIBILIDAD_ARRASTRE_PX = 30;
  const tablaGanttEl = document.getElementById("tabla-gantt-main");

  if (tablaGanttEl) {
    tablaGanttEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const sobreGantt = e.target.closest("#th-gantt, #gantt-header-meses, #gantt-header-semanas, td:nth-child(9)");
      if (sobreGantt) {
        estaArrastrandoGantt = true;
        inicioXGantt = e.clientX;
        acumuladorDeltaXGantt = 0;
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (!estaArrastrandoGantt) return;
      const diffX = e.clientX - inicioXGantt;
      acumuladorDeltaXGantt += diffX;
      inicioXGantt = e.clientX;

      if (Math.abs(acumuladorDeltaXGantt) >= SENSIBILIDAD_ARRASTRE_PX) {
        const pasos = Math.trunc(acumuladorDeltaXGantt / SENSIBILIDAD_ARRASTRE_PX);
        acumuladorDeltaXGantt = acumuladorDeltaXGantt % SENSIBILIDAD_ARRASTRE_PX;
        if (typeof window.cambiarSemanaInicio === "function") {
          window.cambiarSemanaInicio(-pasos);
        }
      }
    });

    window.addEventListener("mouseup", () => {
      if (estaArrastrandoGantt) {
        estaArrastrandoGantt = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    });
  }

  // 7. Calculadoras dinámicas de fechas en modales (Días Hábiles y Horas Netas con feriados)
  const fIniWz = document.getElementById("wz-input-ini");
  const fFinWz = document.getElementById("wz-input-fin");
  const diasWz = document.getElementById("wz-input-dias");

  if (fIniWz && fFinWz && diasWz) {
    let bloqueandoWz = false;

    const recalcularFinWizard = () => {
      if (bloqueandoWz || !fIniWz.value || !diasWz.value) return;
      const dtIni = new Date(fIniWz.value + "T00:00:00");
      const val = parseFloat(diasWz.value);
      if (val > 0 && window.calcularFechaFinPorModalidad) {
        bloqueandoWz = true;
        const dtFin = window.calcularFechaFinPorModalidad(dtIni, val, state.proyectoModoDuracion);
        fFinWz.value = dtFin.toISOString().split("T")[0];
        bloqueandoWz = false;
      }
    };

    diasWz.addEventListener("input", recalcularFinWizard);
    fIniWz.addEventListener("input", recalcularFinWizard);

    fFinWz.addEventListener("input", () => {
      if (bloqueandoWz || !fIniWz.value || !fFinWz.value) return;
      const dt1 = new Date(fIniWz.value + "T00:00:00");
      const dt2 = new Date(fFinWz.value + "T00:00:00");
      if (dt2 >= dt1 && window.contarDiasHabilesEntre) {
        bloqueandoWz = true;
        const dHabiles = window.contarDiasHabilesEntre(dt1, dt2);
        diasWz.value = (state.proyectoModoDuracion === "hours") ? (dHabiles * 8) : dHabiles;
        bloqueandoWz = false;
      }
    });
  }

  // Calculadora interactiva bidireccional para el modal "Definir Término de Actividad"
  const mfiInputFin = document.getElementById("mfi-input-fin");
  const mfiInputDias = document.getElementById("mfi-input-dias");

  if (mfiInputFin && mfiInputDias) {
    let bloqueandoMfi = false;

    // Si cambia los días manuales -> recalcula la fecha fin hábil
    mfiInputDias.addEventListener("input", () => {
      if (bloqueandoMfi || !window.modalActivoAct || !mfiInputDias.value) return;
      const valDias = parseInt(mfiInputDias.value);
      if (valDias > 0) {
        const dtIni = parsearFechaUniversal(window.modalActivoAct.fecha_inicio);
        if (dtIni && window.sumarDiasHabiles) {
          bloqueandoMfi = true;
          const nuevaFin = window.sumarDiasHabiles(dtIni, valDias);
          mfiInputFin.value = nuevaFin.toISOString().split("T")[0];
          bloqueandoMfi = false;
        }
      }
    });

    // Si cambia la fecha fin en el calendario -> recalcula los días hábiles
    mfiInputFin.addEventListener("input", () => {
      if (bloqueandoMfi || !window.modalActivoAct || !mfiInputFin.value) return;
      const dtIni = parsearFechaUniversal(window.modalActivoAct.fecha_inicio);
      const dtFin = new Date(mfiInputFin.value + "T00:00:00");

      if (dtFin < dtIni) {
        mfiInputFin.value = dtIni.toISOString().split("T")[0];
        mfiInputDias.value = 1;
        return;
      }

      if (window.contarDiasHabilesEntre) {
        bloqueandoMfi = true;
        mfiInputDias.value = window.contarDiasHabilesEntre(dtIni, dtFin);
        bloqueandoMfi = false;
      }
    });
  }

  // 8. Accesibilidad por teclado global (Enter y Escape)
  document.addEventListener("keydown", (e) => {
    if (e.target && e.target.tagName.toLowerCase() === "textarea") return;

    if (e.key === "Enter") {
      const modDialog = document.getElementById("modal-dialog-imarpe");
      if (modDialog && !modDialog.classList.contains("hidden")) { e.preventDefault(); window.cerrarDialogoImarpe?.(true); return; }
      const modInput = document.getElementById("modal-input-custom");
      if (modInput && !modInput.classList.contains("hidden")) { e.preventDefault(); document.getElementById("mic-btn-guardar")?.click(); return; }
      const modFecha = document.getElementById("modal-fecha-custom");
      if (modFecha && !modFecha.classList.contains("hidden")) { e.preventDefault(); document.getElementById("mfc-btn-guardar")?.click(); return; }
      const modFin = document.getElementById("modal-fin-interactiva");
      if (modFin && !modFin.classList.contains("hidden")) { e.preventDefault(); document.getElementById("mfi-btn-guardar")?.click(); return; }
      const modResp = document.getElementById("modal-asignar-responsables");
      if (modResp && !modResp.classList.contains("hidden")) { e.preventDefault(); document.getElementById("btn-guardar-multi-resp")?.click(); return; }
      const modNotif = document.getElementById("modal-notificacion-correo");
      if (modNotif && !modNotif.classList.contains("hidden")) { e.preventDefault(); window.confirmarEnvioNotificaciones?.(); return; }
      const modWz = document.getElementById("modal-wizard-creacion");
      if (modWz && !modWz.classList.contains("hidden")) { e.preventDefault(); window.avanzarPasoWizard?.(); return; }
      const modCol = document.getElementById("modal-columnas");
      if (modCol && !modCol.classList.contains("hidden")) { e.preventDefault(); window.cerrarModalColumnas?.(); return; }
    }

    if (e.key === "Escape") {
      const idsPrioridadCierre = [
        "modal-carga-trabajo",
        "modal-detalle-pendiente", "modal-agenda-pendiente", "modal-editar-feriado",
        "modal-notificacion-correo", "modal-dialog-imarpe", "modal-input-custom",
        "modal-fecha-custom", "modal-fin-interactiva", "modal-asignar-responsables",
        "modal-wizard-creacion", "modal-columnas", "modal-comentarios",
        "modal-dependencias", "modal-cpm", "modal-historial", "modal-responsables",
        "modal-nuevo-proyecto", "modal-guardar-plantilla", "modal-importar-plantilla-proyecto",
        "modal-estadisticas-hub"
      ];
      for (const id of idsPrioridadCierre) {
        const el = document.getElementById(id);
        if (el && !el.classList.contains("hidden")) {
          el.classList.add("hidden");
          return;
        }
      }
    }
  });
});