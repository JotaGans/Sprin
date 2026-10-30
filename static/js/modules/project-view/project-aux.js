import { state } from "../../core/state.js";
import { apiFetch } from "../../core/api.js";
import { notificarToast, confirmModal, formatearFechaLatina } from "../../core/ui-dialogs.js";
import { renderizarTabla } from "./project-wbs.js";

// --- HISTORIAL DE AUDITORÍA ---
export async function abrirHistorial() {
  if (!state.proyectoActualId) return;
  const modal = document.getElementById("modal-historial");
  const tbody = document.getElementById("historial-tabla-body");
  if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-gray-400 font-semibold animate-pulse">Cargando registros de auditoría...</td></tr>`;
  modal.classList.remove("hidden");

  try {
    const res = await apiFetch(`/proyectos/${state.proyectoActualId}/historial`);
    if (!res.ok) throw new Error("No se pudo cargar el historial");
    const data = await res.json();
    tbody.innerHTML = "";

    if (data && data.length > 0) {
      data.forEach(h => {
        tbody.innerHTML += `
          <tr class="hover:bg-gray-50 transition">
            <td class="p-2.5 text-gray-500 font-mono text-[11px] whitespace-nowrap border-b border-gray-100">${h.timestamp || '-'}</td>
            <td class="p-2.5 font-bold text-teal-700 font-mono text-xs whitespace-nowrap border-b border-gray-100">@${h.usuario || 'admin'}</td>
            <td class="p-2.5 font-bold text-[#0f2a4a] whitespace-nowrap border-b border-gray-100">${h.accion || '-'}</td>
            <td class="p-2.5 text-gray-800 border-b border-gray-100">${h.detalle || '-'}</td>
          </tr>
        `;
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-gray-400 font-semibold">Sin registros de auditoría en este proyecto.</td></tr>`;
    }
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-red-500 font-semibold">Error al consultar el historial de auditoría.</td></tr>`;
  }
}

export function cerrarHistorial() {
  document.getElementById("modal-historial")?.classList.add("hidden");
}

// --- PERSONAL Y ROLES DEL PROYECTO ---
export async function abrirResponsables() {
  if (!state.proyectoEsGestor && state.currentUser.rol !== "ADMIN_TI") {
    alert("Solo un Gestor del Proyecto puede administrar los roles y el personal.");
    return;
  }

  state.usuarioSeleccionadoParaRol = null;
  const inp = document.getElementById("inp-buscar-usuario-rol");
  if (inp) inp.value = "";
  const divSug = document.getElementById("sugerencias-usuarios-rol");
  if (divSug) divSug.classList.add("hidden");

  const modal = document.getElementById("modal-responsables");
  const tbody = document.getElementById("personal-permisos-tabla-body");
  if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-gray-400 font-semibold animate-pulse">Sincronizando miembros y permisos...</td></tr>`;
  modal.classList.remove("hidden");

  await recargarDatosPersonalProyecto();
}

export function cerrarResponsables() {
  document.getElementById("modal-responsables")?.classList.add("hidden");
}

export async function recargarDatosPersonalProyecto() {
  try {
    const res = await apiFetch(`/proyectos/${state.proyectoActualId}/personal_permisos`);
    if (!res.ok) throw new Error("Error cargando permisos");
    state.dataPersonalProyecto = await res.json();
    renderizarTablaMiembrosProyecto();
  } catch (e) {
    alert("No se pudo cargar la lista de personal del proyecto.");
  }
}

export function renderizarTablaMiembrosProyecto() {
  const tbody = document.getElementById("personal-permisos-tabla-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!state.dataPersonalProyecto.miembros || state.dataPersonalProyecto.miembros.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-gray-400 font-semibold">No hay roles especiales asignados. Utilice el buscador superior para agregar gestores o visualizadores.</td></tr>`;
    return;
  }

  state.dataPersonalProyecto.miembros.forEach(m => {
    const esGestor = (m.nivel_permiso === "GESTOR" || m.es_gestor === 1);
    tbody.innerHTML += `
      <tr class="hover:bg-gray-50 transition border-b border-gray-100">
        <td class="p-2.5 font-bold text-gray-800">${m.nombre_completo || '-'}</td>
        <td class="p-2.5 font-mono text-gray-500 text-xs">@${m.username}</td>
        <td class="p-2.5 text-center">
          <span class="px-2.5 py-1 rounded-md text-[11px] font-bold ${esGestor ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-blue-100 text-blue-900 border border-blue-300'}">
            ${esGestor ? '👑 Gestor de Proyecto' : '👁️ Visualizador del Proyecto'}
          </span>
        </td>
        <td class="p-2.5 text-center">
          <button onclick="removerRolProyecto(${m.id}, '${m.nombre_completo || m.username}')" class="text-red-500 hover:text-red-700 font-bold px-2 py-1 cursor-pointer" title="Quitar rol">🗑️</button>
        </td>
      </tr>
    `;
  });
}

export function autocompletarBusquedaUsuarios(termino) {
  const term = termino.toLowerCase().trim();
  const divSugerencias = document.getElementById("sugerencias-usuarios-rol");
  if (!divSugerencias) return;
  if (!term) {
    divSugerencias.innerHTML = "";
    divSugerencias.classList.add("hidden");
    state.usuarioSeleccionadoParaRol = null;
    return;
  }

  const fuente = (state.dataPersonalProyecto.todos_usuarios && state.dataPersonalProyecto.todos_usuarios.length > 0)
    ? state.dataPersonalProyecto.todos_usuarios
    : (state.usuariosTIGlobal || []);

  const coincidencias = fuente.filter(u =>
    (u.estado === 'ACTIVO' || !u.estado) && (
      (u.nombre_completo && u.nombre_completo.toLowerCase().includes(term)) ||
      (u.username && u.username.toLowerCase().includes(term))
    )
  );

  divSugerencias.innerHTML = "";
  if (coincidencias.length === 0) {
    divSugerencias.innerHTML = `<div class="p-2.5 text-gray-400 italic">No se encontraron usuarios con '${termino}'</div>`;
  } else {
    coincidencias.slice(0, 6).forEach(u => {
      const item = document.createElement("div");
      item.className = "p-2.5 hover:bg-teal-50 cursor-pointer flex justify-between items-center transition border-b border-gray-100 last:border-0";
      item.innerHTML = `<span class="font-bold text-[#0f2a4a]">${u.nombre_completo || u.username}</span><span class="font-mono text-gray-400 text-[11px]">@${u.username}</span>`;
      item.onclick = () => {
        state.usuarioSeleccionadoParaRol = u;
        const inp = document.getElementById("inp-buscar-usuario-rol");
        if (inp) inp.value = `${u.nombre_completo || u.username} (@${u.username})`;
        divSugerencias.classList.add("hidden");
      };
      divSug.appendChild(item);
    });
  }
  divSugerencias.classList.remove("hidden");
}

export async function confirmarAsignacionRolUsuario() {
  if (!state.usuarioSeleccionadoParaRol) {
    alert("Por favor busque y seleccione un trabajador de la lista de sugerencias.");
    return;
  }

  const u = state.usuarioSeleccionadoParaRol;
  const rolElegido = document.getElementById("sel-rol-asignar").value;

  try {
    const res = await apiFetch(`/proyectos/${state.proyectoActualId}/personal_permisos`, {
      method: "POST",
      body: JSON.stringify({ usuario_id: u.id, nivel: rolElegido })
    });
    if (res.ok) {
      notificarToast(`Rol asignado con éxito.`, "success");
      document.getElementById("inp-buscar-usuario-rol").value = "";
      state.usuarioSeleccionadoParaRol = null;
      await recargarDatosPersonalProyecto();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "No se pudo asignar el rol.");
    }
  } catch (e) {
    alert("Error de comunicación con el servidor.");
  }
}

export async function removerRolProyecto(usuarioId, nombre) {
  const seguro = await confirmModal(`¿Desea remover los privilegios especiales de ${nombre} en este proyecto?`, "Confirmar Retiro", "warning");
  if (!seguro) return;

  try {
    const res = await apiFetch(`/proyectos/${state.proyectoActualId}/personal_permisos`, {
      method: "POST",
      body: JSON.stringify({ usuario_id: usuarioId, nivel: 'NINGUNO' })
    });
    if (res.ok) {
      notificarToast(`Privilegios removidos para ${nombre}.`, "info");
      await recargarDatosPersonalProyecto();
    }
  } catch (e) {
    alert("Error al remover permisos.");
  }
}

// --- COMENTARIOS COLABORATIVOS TIPO WORD 365 ---
export async function cargarComentariosProyecto() {
  if (!state.proyectoActualId) return;
  try {
    const res = await apiFetch(`/proyectos/${state.proyectoActualId}/comentarios`);
    if (res.ok) {
      state.comentariosGlobal = await res.json();
      renderizarTabla();
    }
  } catch (e) {
    console.error("Error al cargar comentarios:", e);
  }
}

export function obtenerComentariosDeActividad(codigo) {
  const codLimpio = String(codigo).replace(/\.+$/, "");
  return (state.comentariosGlobal || []).filter(c => String(c.codigo_actividad).replace(/\.+$/, "") === codLimpio);
}

export function abrirModalComentarios(cod) {
  const codLimpio = String(cod).replace(/\.+$/, "");
  state.actividadComentarioActual = state.actividadesGlobal.find(a => String(a.codigo).replace(/\.+$/, "") === codLimpio);
  if (!state.actividadComentarioActual) return;

  cancelarEdicionComentario();
  document.getElementById("com-modal-titulo").innerText = `Comentarios (${obtenerComentariosDeActividad(codLimpio).length})`;
  document.getElementById("com-modal-subtitulo").innerText = `[${state.actividadComentarioActual.codigo}] ${state.actividadComentarioActual.descripcion}`;

  renderizarTarjetasComentarios();
  document.getElementById("modal-comentarios")?.classList.remove("hidden");
  setTimeout(() => document.getElementById("com-input-texto")?.focus(), 100);
}

export function cerrarModalComentarios() {
  document.getElementById("modal-comentarios")?.classList.add("hidden");
  state.actividadComentarioActual = null;
  cancelarEdicionComentario();
}

function renderizarTarjetasComentarios() {
  const contenedor = document.getElementById("com-lista-tarjetas");
  if (!contenedor || !state.actividadComentarioActual) return;
  contenedor.innerHTML = "";

  const lista = obtenerComentariosDeActividad(state.actividadComentarioActual.codigo);
  if (lista.length === 0) {
    contenedor.innerHTML = `
      <div class="p-8 text-center text-gray-400 space-y-2">
        <span class="text-3xl block">💬</span>
        <p class="text-xs font-semibold">No hay comentarios en esta actividad.</p>
        <p class="text-[11px] text-gray-400">Sea el primero en dejar una nota técnica o de seguimiento.</p>
      </div>
    `;
    return;
  }

  lista.forEach(c => {
    const esMio = (c.usuario_id === state.currentUser.id);
    const puedeEliminar = esMio || state.proyectoEsGestor || (state.currentUser.rol === "ADMIN_TI");
    const puedeEditar = esMio;

    const partes = (c.autor_nombre || "U").split(" ");
    const iniciales = (partes[0][0] + (partes[1] ? partes[1][0] : "")).toUpperCase();

    let hash = 0;
    for (let i = 0; i < c.autor_nombre.length; i++) hash = c.autor_nombre.charCodeAt(i) + ((hash << 5) - hash);
    const colorBg = state.coloresAvatar[Math.abs(hash) % state.coloresAvatar.length];

    const editadoTag = c.fecha_edicion ? `<span class="text-[10px] text-gray-400 italic ml-1.5">(editado)</span>` : '';

    const tarjeta = document.createElement("div");
    tarjeta.className = "bg-white p-3.5 rounded-xl border border-gray-200/90 shadow-xs space-y-2";
    tarjeta.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <div class="avatar-circle font-black" style="background-color: ${colorBg}; width: 22px; height: 22px; font-size: 8px;">${iniciales}</div>
          <div>
            <span class="text-xs font-bold text-[#0f2a4a]">${c.autor_nombre}</span>
            ${c.autor_unidad ? `<span class="text-[10px] font-semibold text-teal-800 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200 ml-1">${c.autor_unidad}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center space-x-1.5 text-gray-400">
          <span class="text-[10px] font-medium text-gray-400">${c.fecha_creacion}</span>
          ${editadoTag}
          ${puedeEditar ? `<button onclick="iniciarEdicionComentario(${c.id}, '${c.texto.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')" class="text-blue-600 hover:text-blue-800 p-1 text-xs font-bold ml-1 cursor-pointer" title="Editar">✏️</button>` : ''}
          ${puedeEliminar ? `<button onclick="eliminarComentario(${c.id})" class="text-rose-500 hover:text-rose-700 p-1 text-xs font-bold cursor-pointer" title="Eliminar">🗑️</button>` : ''}
        </div>
      </div>
      <p class="text-xs text-gray-700 leading-relaxed whitespace-pre-line pl-7">${c.texto}</p>
    `;
    contenedor.appendChild(tarjeta);
  });
  contenedor.scrollTop = contenedor.scrollHeight;
}

export function actualizarContadorComentario() {
  const txt = document.getElementById("com-input-texto")?.value || "";
  document.getElementById("com-contador-chars").innerText = `${txt.length} / 500 caracteres`;
}

export function iniciarEdicionComentario(id, texto) {
  state.comentarioEnEdicionId = id;
  document.getElementById("com-input-texto").value = texto;
  document.getElementById("com-label-accion").innerText = "✏️ Editando comentario:";
  document.getElementById("com-txt-btn-publicar").innerText = "Guardar Cambios";
  document.getElementById("com-btn-cancelar-edicion")?.classList.remove("hidden");
  actualizarContadorComentario();
  document.getElementById("com-input-texto")?.focus();
}

export function cancelarEdicionComentario() {
  state.comentarioEnEdicionId = null;
  const inp = document.getElementById("com-input-texto");
  if (inp) inp.value = "";
  document.getElementById("com-label-accion").innerText = "✍️ Agregar un comentario:";
  document.getElementById("com-txt-btn-publicar").innerText = "Publicar Comentario";
  document.getElementById("com-btn-cancelar-edicion")?.classList.add("hidden");
  actualizarContadorComentario();
}

export async function publicarComentario() {
  const texto = document.getElementById("com-input-texto").value.trim();
  if (!texto) {
    alert("Por favor escriba un texto antes de publicar.");
    return;
  }

  if (state.comentarioEnEdicionId) {
    try {
      const res = await apiFetch(`/comentarios/${state.comentarioEnEdicionId}`, {
        method: "PUT",
        body: JSON.stringify({ texto: texto })
      });
      if (res.ok) {
        notificarToast("Comentario editado con éxito.", "success");
        await cargarComentariosProyecto();
        renderizarTarjetasComentarios();
        cancelarEdicionComentario();
      }
    } catch (e) {
      alert("Error al editar comentario.");
    }
  } else {
    try {
      const res = await apiFetch(`/comentarios`, {
        method: "POST",
        body: JSON.stringify({
          proyecto_id: state.proyectoActualId,
          codigo_actividad: state.actividadComentarioActual.codigo,
          texto: texto
        })
      });
      if (res.ok) {
        notificarToast("Comentario publicado.", "success");
        await cargarComentariosProyecto();
        renderizarTarjetasComentarios();
        document.getElementById("com-input-texto").value = "";
        actualizarContadorComentario();
      }
    } catch (e) {
      alert("Error al publicar comentario.");
    }
  }
}

export async function eliminarComentario(id) {
  const seguro = await confirmModal("¿Está seguro de eliminar este comentario?", "Eliminar Comentario", "danger");
  if (!seguro) return;

  try {
    const res = await apiFetch(`/comentarios/${id}`, { method: "DELETE" });
    if (res.ok) {
      notificarToast("Comentario eliminado.", "info");
      await cargarComentariosProyecto();
      renderizarTarjetasComentarios();
    }
  } catch (e) {
    alert("Error al eliminar comentario.");
  }
}

// --- EXPORTACIÓN DE CRONOGRAMA ---
export function exportarExcelCSV() {
  if (!state.actividadesGlobal || state.actividadesGlobal.length === 0) {
    alert("No hay actividades para exportar.");
    return;
  }

  let csv = "Codigo;Descripcion;Responsable;Estado;Fecha Inicio;Fecha Fin;Dias;% Avance;Predecesores;Nro Comentarios;Historial de Comentarios\n";
  state.actividadesGlobal.forEach(a => {
    const codLimpio = String(a.codigo).replace(/\.+$/, "");
    const coms = obtenerComentariosDeActividad(codLimpio);
    const cantComs = coms.length;
    let historialTexto = "";
    if (cantComs > 0) {
      historialTexto = coms.map(c => `[${c.fecha_creacion} - ${c.autor_nombre}]: ${c.texto.replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, " ")}`).join(" | ");
    }
    csv += `"${a.codigo}";"${a.descripcion.replace(/"/g, '""')}";"${a.responsable || ''}";"${a.estado}";"${formatearFechaLatina(a.fecha_inicio)}";"${formatearFechaLatina(a.fecha_fin)}";${a.dias};${a.avance}%;"${a.predecesores || ''}";${cantComs};"${historialTexto}"\n`;
  });

  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `IMARPE_Proyecto_${state.proyectoActualId}_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
  notificarToast("Archivo Excel descargado con bitácora de comentarios.", "success");
}

// =========================================================================
// PLANTILLAS MAESTRAS EN PROYECTO ACTIVO (GUARDAR / IMPORTAR)
// =========================================================================
export function abrirModalGuardarPlantilla() {
  if (!state.proyectoActualId) return;
  const inpNom = document.getElementById("input-plantilla-nombre");
  if (inpNom) inpNom.value = document.getElementById("txt-nombre-proyecto")?.value || "";
  const inpCat = document.getElementById("input-plantilla-categoria");
  if (inpCat) inpCat.value = "";
  const inpDesc = document.getElementById("input-plantilla-desc");
  if (inpDesc) inpDesc.value = "";
  document.getElementById("modal-guardar-plantilla")?.classList.remove("hidden");
}

export function cerrarModalGuardarPlantilla() {
  document.getElementById("modal-guardar-plantilla")?.classList.add("hidden");
}

export async function guardarProyectoComoPlantilla(e) {
  e.preventDefault();
  const nombre = document.getElementById("input-plantilla-nombre")?.value.trim();
  const cat = document.getElementById("input-plantilla-categoria")?.value.trim() || "General";
  const desc = document.getElementById("input-plantilla-desc")?.value.trim();

  if (!nombre) {
    alert("Consigne un nombre para la plantilla.");
    return;
  }

  try {
    const res = await apiFetch("/plantillas/desde-proyecto", {
      method: "POST",
      body: JSON.stringify({
        proyecto_id: state.proyectoActualId,
        nombre: nombre,
        categoria: cat,
        descripcion: desc
      })
    });

    if (res.ok) {
      cerrarModalGuardarPlantilla();
      notificarToast("Plantilla registrada en la biblioteca institucional.", "success");
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al guardar plantilla.");
    }
  } catch (e) {
    alert("Error de conexión con el servidor.");
  }
}

export async function abrirModalImportarPlantillaProyecto() {
  state.plantillaParaImportarId = null;
  document.getElementById("bloque-fechaini-importar")?.classList.add("hidden");
  document.getElementById("btn-confirmar-importar-plantilla")?.classList.add("hidden");
  document.getElementById("modal-importar-plantilla-proyecto")?.classList.remove("hidden");

  const cont = document.getElementById("lista-plantillas-importar-contenedor");
  if (!cont) return;
  cont.innerHTML = `<div class="col-span-2 p-4 text-center text-gray-400 font-bold animate-pulse">Cargando plantillas...</div>`;

  try {
    const res = await apiFetch("/plantillas");
    const plantillas = await res.json();
    cont.innerHTML = "";

    if (!plantillas || plantillas.length === 0) {
      cont.innerHTML = `<div class="col-span-2 p-4 text-center text-gray-400 font-semibold italic">No hay plantillas registradas en la biblioteca.</div>`;
      return;
    }

    plantillas.forEach(p => {
      const item = document.createElement("div");
      item.className = "bg-white p-3 rounded-xl border border-gray-200 hover:border-teal-600 hover:shadow cursor-pointer transition flex flex-col justify-between";
      item.onclick = () => {
        state.plantillaParaImportarId = p.id;
        document.querySelectorAll("#lista-plantillas-importar-contenedor > div").forEach(d => d.classList.remove("border-teal-600", "bg-teal-50/50"));
        item.classList.add("border-teal-600", "bg-teal-50/50");

        const hoyISO = new Date().toISOString().split("T")[0];
        const inpFecha = document.getElementById("input-importar-fechaini");
        if (inpFecha) inpFecha.value = hoyISO;
        document.getElementById("bloque-fechaini-importar")?.classList.remove("hidden");
        document.getElementById("btn-confirmar-importar-plantilla")?.classList.remove("hidden");
      };
      item.innerHTML = `
        <div>
          <span class="text-[9px] font-black uppercase text-teal-800 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200">${p.categoria || 'General'}</span>
          <h5 class="font-bold text-xs text-[#0f2a4a] mt-1">${p.nombre}</h5>
          <p class="text-[10px] text-gray-500 line-clamp-2 mt-0.5">${p.descripcion || ''}</p>
        </div>
        <span class="text-[10px] font-bold text-teal-700 mt-2 block">Seleccionar →</span>
      `;
      cont.appendChild(item);
    });
  } catch (e) {
    cont.innerHTML = `<div class="col-span-2 p-4 text-center text-red-500 font-semibold">Error al cargar plantillas.</div>`;
  }
}

export function cerrarModalImportarPlantillaProyecto() {
  document.getElementById("modal-importar-plantilla-proyecto")?.classList.add("hidden");
  state.plantillaParaImportarId = null;
}

export async function ejecutarImportacionEnProyectoActivo() {
  if (!state.plantillaParaImportarId || !state.proyectoActualId) return;

  const fIniISO = document.getElementById("input-importar-fechaini")?.value || new Date().toISOString().split("T")[0];
  const fIniLatina = formatearFechaLatina(fIniISO);

  try {
    const res = await apiFetch(`/proyectos/${state.proyectoActualId}/aplicar-plantilla`, {
      method: "POST",
      body: JSON.stringify({
        plantilla_id: state.plantillaParaImportarId,
        nombre_proyecto: "",
        fecha_inicio: fIniLatina
      })
    });

    if (res.ok) {
      cerrarModalImportarPlantillaProyecto();
      notificarToast("Estructura importada exitosamente en el proyecto.", "success");
      const { sincronizarDatosProyecto } = await import("./project-core.js");
      await sincronizarDatosProyecto(state.proyectoActualId);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al importar plantilla.");
    }
  } catch (e) {
    alert("Error de conexión al importar plantilla.");
  }
}

// =========================================================================
// PANEL DIRECTIVO: CARGA DE TRABAJO DEL EQUIPO (TEAM WORKLOAD)
// =========================================================================

export function abrirModalCargaTrabajo() {
  const modal = document.getElementById("modal-carga-trabajo");
  const contenedor = document.getElementById("workload-lista-colaboradores");
  const resumenTxt = document.getElementById("workload-resumen-total");
  if (!modal || !contenedor) return;

  contenedor.innerHTML = "";

  // Filtrar únicamente actividades operativas (sin subtareas) para no duplicar conteos
  const actsOperativas = (state.actividadesGlobal || []).filter(a => {
    const cod = String(a.codigo).replace(/\.+$/, "");
    return !state.actividadesGlobal.some(sub => {
      const subCod = String(sub.codigo).replace(/\.+$/, "");
      return subCod.startsWith(cod + ".") && subCod !== cod;
    });
  });

  const totalOperativas = actsOperativas.length;
  if (totalOperativas === 0) {
    contenedor.innerHTML = `<div class="p-8 text-center text-gray-400 font-semibold italic">Este proyecto aún no contiene actividades operativas para analizar.</div>`;
    modal.classList.remove("hidden");
    return;
  }

  // Mapear actividades por persona
  const mapaCarga = {};

  actsOperativas.forEach(act => {
    const respCampo = (act.responsable || "No asignado").trim();
    const personas = respCampo.includes(";") 
      ? respCampo.split(";").map(s => s.trim()).filter(Boolean) 
      : [respCampo];

    personas.forEach(nom => {
      if (!mapaCarga[nom]) {
        mapaCarga[nom] = { total: 0, ejecutadas: 0, enProceso: 0, noIniciadas: 0 };
      }
      mapaCarga[nom].total += 1;
      if (act.estado === "Ejecutado") mapaCarga[nom].ejecutadas += 1;
      else if (act.estado === "En proceso") mapaCarga[nom].enProceso += 1;
      else mapaCarga[nom].noIniciadas += 1;
    });
  });

  const listaColaboradores = Object.keys(mapaCarga).sort((a, b) => mapaCarga[b].total - mapaCarga[a].total);

  if (resumenTxt) {
    resumenTxt.innerText = `${listaColaboradores.length} colaborador(es) asignado(s) · ${totalOperativas} actividades operativas totales`;
  }

  // Renderizar cada tarjeta de colaborador con su barra de progreso segmentada
  contenedor.innerHTML = listaColaboradores.map(nombre => {
    const datos = mapaCarga[nombre];
    const pctTotal = Math.round((datos.total / totalOperativas) * 100);
    const iniciales = nombre.includes(",") 
      ? (nombre.split(",")[0].trim()[0] + (nombre.split(",")[1] ? nombre.split(",")[1].trim()[0] : "")).toUpperCase()
      : (nombre.split(" ")[0][0] + (nombre.split(" ")[1] ? nombre.split(" ")[1][0] : "")).toUpperCase();

    // Generar color consistente
    let hash = 0;
    for (let i = 0; i < nombre.length; i++) hash = nombre.charCodeAt(i) + ((hash << 5) - hash);
    const colorBg = state.coloresAvatar[Math.abs(hash) % state.coloresAvatar.length];

    const pctEjec = Math.round((datos.ejecutadas / datos.total) * 100);
    const pctProc = Math.round((datos.enProceso / datos.total) * 100);
    const pctNoInic = Math.round((datos.noIniciadas / datos.total) * 100);

    return `
      <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2.5 min-w-0">
            <div class="avatar-circle font-black flex-shrink-0" style="background-color: ${colorBg}; width: 28px; height: 28px; font-size: 10px;">
              ${iniciales || '?'}
            </div>
            <div class="min-w-0">
              <h4 class="text-xs font-black text-[#0f2a4a] truncate">${nombre}</h4>
              <p class="text-[10px] text-gray-500 font-semibold">${datos.total} actividad(es) (${pctTotal}% del proyecto)</p>
            </div>
          </div>
          <div class="flex items-center space-x-2 text-[10px] font-bold flex-shrink-0">
            <span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">${datos.ejecutadas} Ejec.</span>
            <span class="bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-200">${datos.enProceso} En proc.</span>
            <span class="bg-slate-200 text-slate-700 px-2 py-0.5 rounded border border-slate-300">${datos.noIniciadas} No inic.</span>
          </div>
        </div>

        <!-- Barra segmentada multicromática -->
        <div class="w-full bg-gray-200 rounded-full h-2 flex overflow-hidden shadow-inner">
          <div class="bg-emerald-500 h-2 transition-all duration-300" style="width: ${pctEjec}%" title="Ejecutadas: ${datos.ejecutadas}"></div>
          <div class="bg-amber-400 h-2 transition-all duration-300" style="width: ${pctProc}%" title="En proceso: ${datos.enProceso}"></div>
          <div class="bg-slate-400 h-2 transition-all duration-300" style="width: ${pctNoInic}%" title="No iniciadas: ${datos.noIniciadas}"></div>
        </div>
      </div>
    `;
  }).join("");

  modal.classList.remove("hidden");
}

export function cerrarModalCargaTrabajo() {
  document.getElementById("modal-carga-trabajo")?.classList.add("hidden");
}

// =========================================================================
// VINCULACIÓN DE FUNCIONES AL OBJETO GLOBAL WINDOW
// =========================================================================
window.abrirHistorial = abrirHistorial;
window.cerrarHistorial = cerrarHistorial;
window.abrirResponsables = abrirResponsables;
window.cerrarResponsables = cerrarResponsables;
window.autocompletarBusquedaUsuarios = autocompletarBusquedaUsuarios;
window.confirmarAsignacionRolUsuario = confirmarAsignacionRolUsuario;
window.removerRolProyecto = removerRolProyecto;
window.abrirModalComentarios = abrirModalComentarios;
window.cerrarModalComentarios = cerrarModalComentarios;
window.publicarComentario = publicarComentario;
window.iniciarEdicionComentario = iniciarEdicionComentario;
window.cancelarEdicionComentario = cancelarEdicionComentario;
window.eliminarComentario = eliminarComentario;
window.exportarExcelCSV = exportarExcelCSV;
window.abrirModalGuardarPlantilla = abrirModalGuardarPlantilla;
window.cerrarModalGuardarPlantilla = cerrarModalGuardarPlantilla;
window.guardarProyectoComoPlantilla = guardarProyectoComoPlantilla;
window.abrirModalImportarPlantillaProyecto = abrirModalImportarPlantillaProyecto;
window.cerrarModalImportarPlantillaProyecto = cerrarModalImportarPlantillaProyecto;
window.ejecutarImportacionEnProyectoActivo = ejecutarImportacionEnProyectoActivo;
window.abrirModalCargaTrabajo = abrirModalCargaTrabajo;
window.cerrarModalCargaTrabajo = cerrarModalCargaTrabajo;