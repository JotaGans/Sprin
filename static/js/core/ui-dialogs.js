// =========================================================================
// MOTOR DE MODALES Y NOTIFICACIONES NATIVAS ESTILIZADAS IMARPE (UX/UI)
// =========================================================================

let resolverDialogoActual = null;

export function notificarToast(mensaje, tipo = "success", duracionMs = 4000) {
  let container = document.getElementById("toast-container-global");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container-global";
    container.className = "fixed bottom-5 right-5 z-[99999] flex flex-col space-y-2 pointer-events-none";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  const estilos = {
    success: "bg-emerald-600 text-white shadow-2xl shadow-emerald-950/50 border border-emerald-500/40",
    error: "bg-[#991b1b] text-white shadow-2xl shadow-red-950/50 border border-red-500/40",
    warning: "bg-[#b45309] text-white shadow-2xl shadow-amber-950/50 border border-amber-500/40",
    info: "bg-[#0f2a4a] text-white shadow-2xl shadow-slate-950/50 border border-blue-500/40"
  };
  const iconos = { success: "✓", error: "✕", warning: "⚠️", info: "ℹ️" };

  toast.className = `pointer-events-auto flex items-center space-x-3 px-5 py-3.5 rounded-2xl text-xs font-extrabold tracking-wide transition-all transform duration-300 translate-y-4 opacity-0 ${estilos[tipo] || estilos.info}`;
  toast.innerHTML = `
    <span class="w-6 h-6 rounded-full ${tipo === 'success' ? 'bg-lime-400 text-emerald-950' : 'bg-white/25 text-white'} flex items-center justify-center text-xs font-black shadow-sm flex-shrink-0">${iconos[tipo] || 'ℹ️'}</span>
    <span class="flex-1 leading-snug drop-shadow-sm">${mensaje}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove("translate-y-4", "opacity-0");
    toast.classList.add("translate-y-0", "opacity-100");
  }, 30);

  setTimeout(() => {
    toast.classList.remove("translate-y-0", "opacity-100");
    toast.classList.add("translate-y-4", "opacity-0");
    setTimeout(() => toast.remove(), 300);
  }, duracionMs);
}

export function mostrarMensajeInstitucional({ titulo = "Sistema IMARPE", mensaje, tipo = "info", esConfirmacion = false, textoAceptar = "Aceptar", textoCancelar = "Cancelar" }) {
  return new Promise((resolve) => {
    resolverDialogoActual = resolve;

    const modal = document.getElementById("modal-dialog-imarpe");
    const headerBg = document.getElementById("dialog-header-bg");
    const txtTitulo = document.getElementById("dialog-titulo");
    const txtIcono = document.getElementById("dialog-icono");
    const txtMensaje = document.getElementById("dialog-mensaje");
    const btnAceptar = document.getElementById("dialog-btn-aceptar");
    const btnCancelar = document.getElementById("dialog-btn-cancelar");
    const btnX = document.getElementById("dialog-btn-x");

    if (txtTitulo) txtTitulo.innerText = titulo;
    if (txtMensaje) txtMensaje.innerText = mensaje;
    if (btnAceptar) btnAceptar.innerText = textoAceptar;
    if (btnCancelar) btnCancelar.innerText = textoCancelar;

    if (headerBg && btnAceptar && txtIcono) {
      if (tipo === "error" || tipo === "warning" || tipo === "danger") {
        headerBg.className = "bg-[#c0392b] text-white px-5 py-3.5 flex items-center justify-between";
        btnAceptar.className = "px-5 py-2 bg-[#c0392b] hover:bg-[#a93226] text-white text-xs font-bold rounded-lg transition shadow cursor-pointer";
        txtIcono.innerText = "⚠️";
      } else if (tipo === "question" || esConfirmacion) {
        headerBg.className = "bg-[#0f2a4a] text-white px-5 py-3.5 flex items-center justify-between";
        btnAceptar.className = "px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition shadow cursor-pointer";
        txtIcono.innerText = "ℹ️";
      } else {
        headerBg.className = "bg-[#0f2a4a] text-white px-5 py-3.5 flex items-center justify-between";
        btnAceptar.className = "px-5 py-2 bg-[#0f2a4a] hover:bg-[#1b4f8a] text-white text-xs font-bold rounded-lg transition shadow cursor-pointer";
        txtIcono.innerText = "ℹ️";
      }
    }

    if (btnAceptar) btnAceptar.onclick = () => cerrarDialogoImarpe(true);
    if (btnCancelar) btnCancelar.onclick = () => cerrarDialogoImarpe(false);
    if (btnX) btnX.onclick = () => cerrarDialogoImarpe(false);

    if (btnCancelar && btnX) {
      if (esConfirmacion) {
        btnCancelar.classList.remove("hidden");
        btnX.classList.remove("hidden");
      } else {
        btnCancelar.classList.add("hidden");
        btnX.classList.add("hidden");
      }
    }

    if (modal) modal.classList.remove("hidden");
  });
}

export function cerrarDialogoImarpe(resultado) {
  const modal = document.getElementById("modal-dialog-imarpe");
  if (modal) modal.classList.add("hidden");
  if (typeof resolverDialogoActual === "function") {
    const fn = resolverDialogoActual;
    resolverDialogoActual = null;
    fn(Boolean(resultado));
  }
}

export function abrirInputCustom({ titulo, mensaje, tipo = 'text', valorActual = '', opciones = [], onAceptar }) {
  document.getElementById("mic-titulo").innerText = titulo;
  document.getElementById("mic-mensaje").innerText = mensaje;

  const txt = document.getElementById("mic-input-text");
  const sel = document.getElementById("mic-input-select");
  const num = document.getElementById("mic-input-num");

  txt.classList.add("hidden");
  sel.classList.add("hidden");
  num.classList.add("hidden");

  if (tipo === 'select') {
    sel.innerHTML = "";
    opciones.forEach(op => { sel.innerHTML += `<option value="${op}">${op}</option>`; });
    sel.value = valorActual;
    sel.classList.remove("hidden");
  } else if (tipo === 'number') {
    num.value = valorActual;
    num.classList.remove("hidden");
  } else {
    txt.value = valorActual;
    txt.classList.remove("hidden");
  }

  const btnGuardar = document.getElementById("mic-btn-guardar");
  btnGuardar.onclick = () => {
    let resultado = (tipo === 'select') ? sel.value : ((tipo === 'number') ? num.value : txt.value);
    cerrarInputCustom();
    if (onAceptar) onAceptar(resultado);
  };
  document.getElementById("modal-input-custom").classList.remove("hidden");
}

export function cerrarInputCustom() {
  const m = document.getElementById("modal-input-custom");
  if (m) m.classList.add("hidden");
}

// Utilidades de Fechas
export function parsearFechaUniversal(fechaStr) {
  if (!fechaStr || typeof fechaStr !== 'string') return null;
  const s = fechaStr.trim();
  if (s === "Definir" || s === "None" || s === "" || s === "null" || s.includes("NaN")) return null;

  if (s.includes("/")) {
    const p = s.split("/");
    if (p.length === 3) {
      const d = parseInt(p[0]), m = parseInt(p[1]), y = parseInt(p[2]);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return new Date(y, m - 1, d);
    }
  } else if (s.includes("-")) {
    const p = s.split("-");
    if (p.length === 3) {
      if (p[0].length === 4) {
        const y = parseInt(p[0]), m = parseInt(p[1]), d = parseInt(p[2]);
        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return new Date(y, m - 1, d);
      } else {
        const d = parseInt(p[0]), m = parseInt(p[1]), y = parseInt(p[2]);
        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return new Date(y, m - 1, d);
      }
    }
  }
  return null;
}

export function formatearFechaLatina(fechaStr) {
  const dt = parsearFechaUniversal(fechaStr);
  if (!dt || isNaN(dt.getTime())) return "01/01/2026";
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const y = dt.getFullYear();
  return `${d}/${m}/${y}`;
}

export function formatearFechaISO(fechaStr) {
  const dt = parsearFechaUniversal(fechaStr);
  if (!dt || isNaN(dt.getTime())) return "2026-01-01";
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const y = dt.getFullYear();
  return `${y}-${m}-${d}`;
}

// Vinculación a window para compatibilidad total con HTML nativo
export function alert(msg) {
  return mostrarMensajeInstitucional({
    titulo: "Notificación del Sistema",
    mensaje: msg,
    tipo: (String(msg).includes("⚠️") || String(msg).includes("Error") || String(msg).includes("inválido")) ? "warning" : "info",
    esConfirmacion: false
  });
}

export function confirmModal(msg, titulo = "Confirmación Requerida", tipo = "question") {
  return mostrarMensajeInstitucional({
    titulo: titulo,
    mensaje: msg,
    tipo: tipo,
    esConfirmacion: true
  });
}

// Vinculación a window para compatibilidad global
window.alert = alert;
window.confirmModal = confirmModal;
window.notificarToast = notificarToast;
window.cerrarDialogoImarpe = cerrarDialogoImarpe;
window.cerrarInputCustom = cerrarInputCustom;

window.notificarToast = notificarToast;
window.cerrarDialogoImarpe = cerrarDialogoImarpe;
window.cerrarInputCustom = cerrarInputCustom;