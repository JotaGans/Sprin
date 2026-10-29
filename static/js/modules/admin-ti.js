import { state } from "../core/state.js";
import { apiFetch } from "../core/api.js";
import { notificarToast, confirmModal } from "../core/ui-dialogs.js";

export async function abrirModalAdminTI() {
  if (!state.token) return;
  const modal = document.getElementById("modal-admin-ti");
  if (!modal) return;
  modal.classList.remove("hidden");
  cambiarTabTI("trabajadores");

  await Promise.all([
    cargarDirectorioTrabajadores(),
    cargarCatalogoUnidades(),
    cargarListaFeriados(),
    cargarListaProcesosTI(),
    cargarAdminPlantillas()
  ]);
}

export function cerrarModalAdminTI() {
  const modal = document.getElementById("modal-admin-ti");
  if (modal) modal.classList.add("hidden");
}

export function cambiarTabTI(tab) {
  state.tabTIActiva = tab;
  const tabs = ["trabajadores", "unidades", "feriados", "procesos", "plantillas"];

  tabs.forEach(t => {
    const btn = document.getElementById(`ti-tab-btn-${t}`);
    const content = document.getElementById(`ti-tab-content-${t}`);
    if (!btn || !content) return;

    if (t === tab) {
      btn.className = "px-3.5 py-2 rounded-t-lg bg-white text-[#0f2a4a] border-t border-l border-r border-gray-200 shadow-xs font-bold whitespace-nowrap cursor-pointer";
      content.classList.remove("hidden");
    } else {
      btn.className = "px-3.5 py-2 rounded-t-lg text-gray-500 hover:text-[#0f2a4a] transition font-bold whitespace-nowrap cursor-pointer";
      content.classList.add("hidden");
    }
  });

  if (tab === "trabajadores") cargarDirectorioTrabajadores();
  if (tab === "unidades") cargarCatalogoUnidades();
  if (tab === "feriados") cargarListaFeriados();
  if (tab === "procesos") cargarListaProcesosTI();
  if (tab === "plantillas") cargarAdminPlantillas();
}

// --- TRABAJADORES ---
export async function cargarDirectorioTrabajadores() {
  const tbody = document.getElementById("tra-tabla-directorio");
  if (tbody && (!state.catalogoTrabajadoresGlobal || state.catalogoTrabajadoresGlobal.length === 0)) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-400 font-semibold animate-pulse">Cargando directorio de trabajadores...</td></tr>`;
  }

  try {
    const res = await apiFetch("/trabajadores");
    if (!res.ok) throw new Error("Error al consultar trabajadores");
    state.catalogoTrabajadoresGlobal = await res.json();
    renderizarDirectorioTrabajadores(state.catalogoTrabajadoresGlobal);
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500 font-semibold">Error al cargar directorio.</td></tr>`;
  }
}

export function filtrarDirectorioTrabajadores() {
  const q = (document.getElementById("tra-filtro-directorio")?.value || "").toLowerCase().trim();
  const filtrados = (state.catalogoTrabajadoresGlobal || []).filter(t =>
    (t.nombre_completo && t.nombre_completo.toLowerCase().includes(q)) ||
    (t.unidad_organica && t.unidad_organica.toLowerCase().includes(q)) ||
    (t.correo && t.correo.toLowerCase().includes(q))
  );
  renderizarDirectorioTrabajadores(filtrados);
}

export function renderizarDirectorioTrabajadores(lista) {
  const tbody = document.getElementById("tra-tabla-directorio");
  if (!tbody) return;
  tbody.innerHTML = "";
  actualizarBotonTrabajadoresBajaUI();

  const activos = (lista || []).filter(t => t.estado === "ACTIVO" || !t.estado);
  if (activos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-400 font-semibold italic">No se encontraron trabajadores activos con ese criterio.</td></tr>`;
    return;
  }

  activos.forEach(t => {
    const usuarioLogin = (t.correo || "").split("@")[0];
    const cargoTexto = t.cargo || "Sin cargo / nivel";
    const badgeCargo = t.es_directivo === 1
      ? `<span class="bg-purple-50 text-purple-800 border border-purple-200 px-1.5 py-0.5 rounded text-[10px] font-bold">🏛️ ${cargoTexto}</span>`
      : `<span class="text-gray-600 font-semibold text-[11px]">${cargoTexto}</span>`;

    tbody.innerHTML += `
      <tr class="hover:bg-gray-50 border-b border-gray-100">
        <td class="p-2.5 font-bold text-gray-800 text-xs">${t.nombre_completo}</td>
        <td class="p-2.5 font-semibold text-teal-800"><span class="bg-teal-50 px-2 py-0.5 rounded border border-teal-200 text-xs">${t.unidad_organica}</span></td>
        <td class="p-2.5 whitespace-nowrap">${badgeCargo}</td>
        <td class="p-2.5 font-mono text-gray-600 text-xs">@${usuarioLogin}</td>
        <td class="p-2.5 text-center whitespace-nowrap"><span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800">ACTIVO</span></td>
        <td class="p-2.5 text-center whitespace-nowrap space-x-1.5">
          <button onclick="abrirModalEditarTrabajador(${t.id})" class="p-1 rounded text-blue-600 hover:text-blue-800 hover:bg-blue-50 font-bold cursor-pointer" title="Editar">✏️</button>
          <button onclick="solicitarDarDeBajaTrabajador(${t.id}, '${t.nombre_completo.replace(/'/g, "\\'")}')" class="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 cursor-pointer">DAR DE BAJA</button>
        </td>
      </tr>
    `;
  });
}

export function abrirModalEditarTrabajador(id) {
  const t = (state.catalogoTrabajadoresGlobal || []).find(item => item.id === id);
  if (!t) return;

  document.getElementById("edit-tra-id").value = t.id;
  document.getElementById("edit-tra-nombres").value = t.nombres || (t.nombre_completo ? t.nombre_completo.split(", ")[1] || t.nombre_completo : "");
  document.getElementById("edit-tra-apellidos").value = t.apellidos || (t.nombre_completo ? t.nombre_completo.split(", ")[0] || "" : "");
  
  const uoInputBusq = document.getElementById("edit-tra-uo-busq");
  const uoInputVal = document.getElementById("edit-tra-uo-valor");
  if (uoInputBusq) uoInputBusq.value = t.unidad_organica || "";
  if (uoInputVal) uoInputVal.value = t.unidad_organica || "";

  const cargoSelect = document.getElementById("edit-tra-cargo");
  if (cargoSelect) cargoSelect.value = t.cargo || "Sin cargo / nivel";

  const nivelMandoSelect = document.getElementById("edit-tra-nivel-mando");
  if (nivelMandoSelect) nivelMandoSelect.value = String(t.es_directivo || 0);

  const usuarioLogin = (t.correo || "").split("@")[0];
  document.getElementById("edit-tra-correo-user").value = usuarioLogin;

  const inpCel = document.getElementById("edit-tra-celular");
  if (inpCel) inpCel.value = t.celular || "";

  document.getElementById("modal-editar-trabajador-ti")?.classList.remove("hidden");
}

export function cerrarModalEditarTrabajador() {
  document.getElementById("modal-editar-trabajador-ti")?.classList.add("hidden");
  document.getElementById("edit-tra-sugerencias-uo")?.classList.add("hidden");
}

export function autocompletarUOEdicion(termino) {
  const term = (termino || "").toLowerCase().trim();
  const divSug = document.getElementById("edit-tra-sugerencias-uo");
  if (!divSug) return;

  if (!term) {
    divSug.innerHTML = "";
    divSug.classList.add("hidden");
    return;
  }

  const matches = (state.catalogoUnidadesGlobal || []).filter(u =>
    (u.estado === 'ACTIVO' || !u.estado) && (u.sigla.toLowerCase().includes(term) || u.nombre.toLowerCase().includes(term))
  );

  divSug.innerHTML = "";
  if (matches.length === 0) {
    divSug.innerHTML = `<div class="p-2.5 text-gray-400 italic">Sin coincidencias</div>`;
  } else {
    matches.slice(0, 6).forEach(u => {
      const item = document.createElement("div");
      item.className = "p-2.5 hover:bg-teal-50 cursor-pointer flex justify-between items-center transition border-b border-gray-100 last:border-0 font-semibold";
      item.innerHTML = `<span class="text-gray-800">${u.nombre}</span><strong class="text-[#0f2a4a] ml-2 bg-slate-100 px-1.5 py-0.5 rounded border text-[11px]">[${u.sigla}]</strong>`;
      item.onclick = () => {
        document.getElementById("edit-tra-uo-busq").value = `${u.sigla} - ${u.nombre}`;
        document.getElementById("edit-tra-uo-valor").value = u.sigla;
        divSug.classList.add("hidden");
      };
      divSug.appendChild(item);
    });
  }
  divSug.classList.remove("hidden");
}

export async function guardarEdicionTrabajador(e) {
  e.preventDefault();
  const id = document.getElementById("edit-tra-id").value;
  const nombres = document.getElementById("edit-tra-nombres").value.trim();
  const apellidos = document.getElementById("edit-tra-apellidos").value.trim();
  const uo = document.getElementById("edit-tra-uo-valor").value || document.getElementById("edit-tra-uo-busq").value.trim();
  const cargo = document.getElementById("edit-tra-cargo").value;
  const esDirectivo = parseInt(document.getElementById("edit-tra-nivel-mando").value || "0");
  const usuarioLogin = document.getElementById("edit-tra-correo-user").value.trim();
  const celular = document.getElementById("edit-tra-celular")?.value.trim() || "";

  if (!nombres || !apellidos || !uo || !usuarioLogin) {
    alert("Por favor complete todos los campos obligatorios.");
    return;
  }

  try {
    const res = await apiFetch(`/trabajadores/${id}`, {
      method: "PUT",
      body: JSON.stringify({ nombres, apellidos, unidad_organica: uo, cargo, es_directivo: esDirectivo, correo_usuario: usuarioLogin, celular })
    });

    if (res.ok) {
      cerrarModalEditarTrabajador();
      notificarToast("Datos del trabajador actualizados con éxito.", "success");
      await cargarDirectorioTrabajadores();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al actualizar los datos del trabajador.");
    }
  } catch (error) {
    alert("Error de conexión al guardar cambios.");
  }
}

export async function registrarTrabajadorTI(e) {
  e.preventDefault();
  const nombres = document.getElementById("tra-input-nombres").value.trim();
  const apellidos = document.getElementById("tra-input-apellidos").value.trim();
  const uo = document.getElementById("tra-input-uo-valor").value || document.getElementById("tra-input-uo-busq").value.trim();
  const correo_user = document.getElementById("tra-input-correo-user").value.trim();
  const celular = document.getElementById("tra-input-celular")?.value.trim() || "";
  const cargo = document.getElementById("tra-input-cargo")?.value.trim() || "Sin cargo / nivel";
  const esDirectivo = parseInt(document.getElementById("tra-input-nivel-mando")?.value || "0");
  const crearAcceso = document.getElementById("tra-chk-crear-acceso")?.checked !== false;
  const passInicial = document.getElementById("tra-input-pass-inicial")?.value.trim() || "imarpe123";

  if (!nombres || !apellidos || !uo || !correo_user) {
    alert("Por favor complete todos los campos requeridos.");
    return;
  }

  try {
    const res = await apiFetch("/trabajadores", {
      method: "POST",
      body: JSON.stringify({ nombres, apellidos, unidad_organica: uo, correo_usuario: correo_user, celular, cargo, es_directivo: esDirectivo, crear_acceso: crearAcceso, password_inicial: passInicial, rol_sistema: "OPERADOR" })
    });

    if (res.ok) {
      notificarToast("Trabajador registrado exitosamente.", "success");
      document.getElementById("tra-input-nombres").value = "";
      document.getElementById("tra-input-apellidos").value = "";
      document.getElementById("tra-input-uo-busq").value = "";
      document.getElementById("tra-input-uo-valor").value = "";
      document.getElementById("tra-input-correo-user").value = "";
      if (document.getElementById("tra-input-celular")) document.getElementById("tra-input-celular").value = "";
      await cargarDirectorioTrabajadores();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al registrar trabajador.");
    }
  } catch (err) {
    alert("Error de comunicación con el servidor.");
  }
}

export function autocompletarUnidadOrganica(termino) {
  const term = (termino || "").toLowerCase().trim();
  const divSug = document.getElementById("tra-sugerencias-uo");
  if (!divSug) return;

  if (!term) {
    divSug.innerHTML = "";
    divSug.classList.add("hidden");
    return;
  }

  const matches = (state.catalogoUnidadesGlobal || []).filter(u =>
    (u.estado === 'ACTIVO' || !u.estado) && (u.sigla.toLowerCase().includes(term) || u.nombre.toLowerCase().includes(term))
  );

  divSug.innerHTML = "";
  if (matches.length === 0) {
    divSug.innerHTML = `<div class="p-2.5 text-gray-400 italic">Sin coincidencias</div>`;
  } else {
    matches.slice(0, 6).forEach(u => {
      const item = document.createElement("div");
      item.className = "p-2.5 hover:bg-teal-50 cursor-pointer flex justify-between items-center transition border-b border-gray-100 last:border-0 font-semibold";
      item.innerHTML = `<span class="text-gray-800">${u.nombre}</span><strong class="text-[#0f2a4a] ml-2 bg-slate-100 px-1.5 py-0.5 rounded border text-[11px]">[${u.sigla}]</strong>`;
      item.onclick = () => {
        document.getElementById("tra-input-uo-busq").value = `${u.sigla} - ${u.nombre}`;
        document.getElementById("tra-input-uo-valor").value = u.sigla;
        divSug.classList.add("hidden");
      };
      divSug.appendChild(item);
    });
  }
  divSug.classList.remove("hidden");
}

export async function alternarEstadoTrabajador(id) {
  try {
    const res = await apiFetch(`/trabajadores/estado/${id}`, { method: "POST" });
    if (res.ok) {
      notificarToast("Estado de trabajador actualizado.", "info");
      await cargarDirectorioTrabajadores();
      const modalBaja = document.getElementById("modal-trabajadores-baja");
      if (modalBaja && !modalBaja.classList.contains("hidden")) renderizarTablaTrabajadoresBaja();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "No se pudo cambiar el estado.");
    }
  } catch (e) {
    alert("Error de conexión con el servidor.");
  }
}

export async function solicitarDarDeBajaTrabajador(id, nombre) {
  const confirma = await confirmModal(`¿Está seguro de dar de baja al trabajador '${nombre}'?`, "Confirmar baja", "warning");
  if (!confirma) return;
  await alternarEstadoTrabajador(id);
}

export function actualizarBotonTrabajadoresBajaUI() {
  const btnBaja = document.getElementById("btn-ver-trabajadores-baja");
  const txtCont = document.getElementById("txt-contador-tra-baja");
  if (!btnBaja) return;

  const inactivos = (state.catalogoTrabajadoresGlobal || []).filter(t => t.estado === "INACTIVO");
  const cant = inactivos.length;
  btnBaja.classList.remove("hidden");
  if (txtCont) txtCont.innerText = `Trabajadores de baja (${cant})`;

  btnBaja.className = cant > 0
    ? "px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 transition flex items-center space-x-1 cursor-pointer shadow-xs"
    : "px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-300 transition flex items-center space-x-1 cursor-pointer";
}

export function abrirModalTrabajadoresBaja() {
  const modal = document.getElementById("modal-trabajadores-baja");
  if (!modal) return;
  const inp = document.getElementById("filtro-trabajadores-baja-input");
  if (inp) inp.value = "";
  renderizarTablaTrabajadoresBaja();
  modal.classList.remove("hidden");
}

export function cerrarModalTrabajadoresBaja() {
  document.getElementById("modal-trabajadores-baja")?.classList.add("hidden");
}

export function filtrarTrabajadoresBajaModal() {
  const q = (document.getElementById("filtro-trabajadores-baja-input")?.value || "").toLowerCase().trim();
  renderizarTablaTrabajadoresBaja(q);
}

export function renderizarTablaTrabajadoresBaja(query = "") {
  const tbody = document.getElementById("tabla-trabajadores-baja-body");
  const txtCant = document.getElementById("txt-baja-resumen-cant");
  if (!tbody) return;
  tbody.innerHTML = "";

  const inactivos = (state.catalogoTrabajadoresGlobal || []).filter(t => t.estado === "INACTIVO");
  if (txtCant) txtCant.innerText = `${inactivos.length} trabajador(es) archivado(s)`;

  const filtrados = inactivos.filter(t =>
    (t.nombre_completo && t.nombre_completo.toLowerCase().includes(query)) ||
    (t.unidad_organica && t.unidad_organica.toLowerCase().includes(query)) ||
    (t.correo && t.correo.toLowerCase().includes(query))
  );

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-gray-400 font-semibold italic">No hay trabajadores dados de baja registrados.</td></tr>`;
    return;
  }

  filtrados.forEach(t => {
    tbody.innerHTML += `
      <tr class="hover:bg-gray-50 border-b border-gray-100">
        <td class="p-2.5 font-bold text-gray-700">${t.nombre_completo}</td>
        <td class="p-2.5 font-semibold text-gray-500"><span class="bg-gray-100 px-2 py-0.5 rounded border border-gray-200 text-[11px]">${t.unidad_organica}</span></td>
        <td class="p-2.5 font-mono text-gray-500 text-xs">${t.correo}</td>
        <td class="p-2.5 text-center whitespace-nowrap">
          <button onclick="solicitarReactivarTrabajador(${t.id}, '${t.nombre_completo.replace(/'/g, "\\'")}')" class="px-3 py-1 rounded text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 transition cursor-pointer shadow-xs">✓ REACTIVAR</button>
        </td>
      </tr>
    `;
  });
}

export async function solicitarReactivarTrabajador(id, nombre) {
  const confirma = await confirmModal(`¿Desea reactivar a '${nombre}' e integrarlo(a) al directorio activo?`, "Reactivar trabajador", "question");
  if (!confirma) return;

  try {
    const res = await apiFetch(`/trabajadores/estado/${id}`, { method: "PUT" });
    if (res.ok) {
      notificarToast(`Trabajador '${nombre}' reactivado exitosamente.`, "success");
      await cargarDirectorioTrabajadores();
      const inactivosRestantes = (state.catalogoTrabajadoresGlobal || []).filter(t => t.estado === "INACTIVO");
      if (inactivosRestantes.length === 0) cerrarModalTrabajadoresBaja();
      else renderizarTablaTrabajadoresBaja();
    } else {
      alert("No se pudo reactivar al trabajador.");
    }
  } catch (e) {
    alert("Error de conexión al reactivar trabajador.");
  }
}

// --- UNIDADES DE ORGANIZACIÓN ---
export async function cargarCatalogoUnidades() {
  const tbody = document.getElementById("uo-tabla-cuerpo");
  try {
    const promesas = [apiFetch("/unidades-organicas")];
    if (!state.catalogoTrabajadoresGlobal || state.catalogoTrabajadoresGlobal.length === 0) {
      promesas.push(apiFetch("/trabajadores").catch(() => null));
    }
    const [resUo, resTrab] = await Promise.all(promesas);
    if (resTrab && resTrab.ok) state.catalogoTrabajadoresGlobal = await resTrab.json();
    if (!resUo.ok) throw new Error("Error cargando UO");

    state.catalogoUnidadesGlobal = await resUo.json();
    if (!tbody) return;

    if (!state.catalogoUnidadesGlobal || state.catalogoUnidadesGlobal.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-400 italic">No hay unidades registradas.</td></tr>`;
      return;
    }

    const listaPersonas = (state.catalogoTrabajadoresGlobal && state.catalogoTrabajadoresGlobal.length > 0) ? state.catalogoTrabajadoresGlobal : (state.usuariosTIGlobal || []);

    const selPadre = document.getElementById("uo-input-padre");
    if (selPadre) {
      let opcionesFormPadre = '<option value="">(Ninguna unidad de organización)</option>';
      state.catalogoUnidadesGlobal.forEach(u => {
        opcionesFormPadre += `<option value="${u.sigla}">[${u.sigla}] ${u.nombre}</option>`;
      });
      selPadre.innerHTML = opcionesFormPadre;
    }

    let htmlFilas = "";
    state.catalogoUnidadesGlobal.forEach(u => {
      const siglaPadreActual = String(u.sigla_padre || "").trim().toUpperCase();
      let opcionesPadre = `<option value="" ${siglaPadreActual === "" ? "selected" : ""}>(Nivel máximo / Alta dirección)</option>`;
      
      state.catalogoUnidadesGlobal.forEach(padreCand => {
        const siglaCand = String(padreCand.sigla || "").trim().toUpperCase();
        if (siglaCand !== String(u.sigla).trim().toUpperCase()) {
          const estaSeleccionado = (siglaPadreActual === siglaCand) ? "selected" : "";
          opcionesPadre += `<option value="${padreCand.sigla}" ${estaSeleccionado}>[${padreCand.sigla}] ${padreCand.nombre}</option>`;
        }
      });

      let opcionesTitular = '<option value="">(Sin titular asignado)</option>';
      listaPersonas.forEach(p => {
        const pId = p.id;
        const pNombre = p.nombre_completo || p.username;
        const pCargo = p.cargo ? ` - ${p.cargo}` : '';
        const estaAsignado = (u.titular_trabajador_id === pId || u.titular_usuario_id === pId);
        opcionesTitular += `<option value="${pId}" ${estaAsignado ? 'selected' : ''}>${pNombre}${pCargo}</option>`;
      });

      htmlFilas += `
        <tr class="hover:bg-gray-50 border-b border-gray-100 transition">
          <td class="p-2.5 font-bold text-[#0f2a4a] text-xs font-mono whitespace-nowrap">${u.sigla}</td>
          <td class="p-2.5 font-semibold text-gray-800 text-xs">${u.nombre}</td>
          <td class="p-2.5 min-w-[220px]">
            <select onchange="actualizarDependenciaROF(${u.id}, this.value, '${u.sigla}')" class="w-full text-[11px] font-bold p-1.5 bg-slate-50 border border-gray-300 rounded-lg outline-none focus:border-[#0f2a4a] cursor-pointer text-slate-700">
              ${opcionesPadre}
            </select>
          </td>
          <td class="p-2.5 min-w-[210px]">
            <select onchange="asignarTitularUnidad(${u.id}, this.value, '${u.sigla}')" class="w-full text-[11px] font-semibold p-1.5 bg-slate-50 border border-gray-300 rounded-lg outline-none focus:border-[#0f2a4a] cursor-pointer">
              ${opcionesTitular}
            </select>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = htmlFilas;
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-rose-500 font-semibold">Error al cargar unidades.</td></tr>`;
  }
}

export async function registrarNuevaUnidadOrganica(e) {
  e.preventDefault();
  const nombre = document.getElementById("uo-input-nombre").value.trim();
  const sigla = document.getElementById("uo-input-sigla").value.trim().toUpperCase();
  const siglaPadre = document.getElementById("uo-input-padre")?.value || null;

  if (!nombre || !sigla) {
    alert("Por favor ingrese el nombre y la sigla de la unidad.");
    return;
  }

  try {
    const res = await apiFetch("/unidades-organicas", {
      method: "POST",
      body: JSON.stringify({ nombre, sigla, sigla_padre: siglaPadre ? siglaPadre.trim() : null })
    });

    if (res.ok) {
      notificarToast(`Unidad [${sigla}] registrada exitosamente.`, "success");
      document.getElementById("uo-input-nombre").value = "";
      document.getElementById("uo-input-sigla").value = "";
      if (document.getElementById("uo-input-padre")) document.getElementById("uo-input-padre").value = "";
      await cargarCatalogoUnidades();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al registrar la unidad orgánica.");
    }
  } catch (err) {
    alert("Error de conexión al registrar la unidad.");
  }
}

export async function actualizarDependenciaROF(unidadId, siglaPadre, siglaHijo) {
  try {
    const res = await apiFetch(`/unidades-organicas/${unidadId}/dependencia`, {
      method: "PUT",
      body: JSON.stringify({ sigla_padre: siglaPadre ? siglaPadre.trim() : null })
    });

    if (res.ok) {
      const destino = siglaPadre ? `[${siglaPadre}]` : "Alta dirección";
      notificarToast(`Dependencia de [${siglaHijo}] actualizada hacia ${destino}.`, "success");
      await cargarCatalogoUnidades();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al actualizar la dependencia ROF.");
      await cargarCatalogoUnidades();
    }
  } catch (e) {
    alert("Error de conexión al actualizar la dependencia jerárquica.");
  }
}

export async function asignarTitularUnidad(unidadId, personaId, sigla) {
  try {
    const res = await apiFetch(`/unidades-organicas/${unidadId}/titular`, {
      method: "PUT",
      body: JSON.stringify({ titular_trabajador_id: personaId ? parseInt(personaId) : null, titular_usuario_id: null })
    });

    if (res.ok) {
      notificarToast(`Titular de [${sigla}] actualizado con éxito.`, "success");
      await cargarCatalogoUnidades();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al actualizar titular.");
    }
  } catch (e) {
    alert("Error de conexión al asignar titular.");
  }
}

// --- FERIADOS ---
export async function cargarListaFeriados() {
  const tbody = document.getElementById("tabla-feriados-body");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-400 font-semibold animate-pulse">Sincronizando calendario institucional...</td></tr>';

  const anoSel = document.getElementById("sel-filtro-ano-feriados")?.value || "";
  const url = anoSel ? `/feriados?year=${anoSel}` : "/feriados";

  try {
    const res = await apiFetch(url);
    if (!res.ok) throw new Error("Error al obtener feriados");
    const feriados = await res.json();
    tbody.innerHTML = "";

    if (feriados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-gray-400 italic font-semibold">No hay feriados registrados para este periodo.</td></tr>';
      return;
    }

    feriados.forEach(f => {
      const fFecha = f.fecha || "";
      const fMotivo = (f.motivo || f.descripcion || "").replace(/'/g, "\\'");
      const fTipo = f.tipo || "Calendario";
      const badgeTipo = fTipo === "Sector público"
        ? `<span class="bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 rounded text-[10px] font-bold">Sector público</span>`
        : `<span class="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[10px] font-bold">Calendario</span>`;

      tbody.innerHTML += `
        <tr class="hover:bg-gray-50 border-b border-gray-100">
          <td class="p-2.5 font-bold font-mono text-gray-800">${fFecha}</td>
          <td class="p-2.5">${badgeTipo}</td>
          <td class="p-2.5 font-semibold text-gray-800">${f.descripcion || f.motivo}</td>
          <td class="p-2.5 text-center whitespace-nowrap space-x-1.5">
            <button onclick="iniciarEdicionFeriado(${f.id}, '${fFecha}', '${fMotivo}', '${fTipo}')" class="p-1 text-blue-600 hover:text-blue-800 font-bold cursor-pointer" title="Editar">✏️</button>
            <button onclick="eliminarFeriado(${f.id})" class="p-1 text-rose-500 hover:text-rose-700 font-bold cursor-pointer" title="Eliminar">🗑️</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-rose-500 font-semibold">Error al cargar calendario de feriados.</td></tr>';
  }
}

export async function guardarFeriado(e) {
  e.preventDefault();
  const fecha = document.getElementById("input-feriado-fecha").value;
  const motivo = document.getElementById("input-feriado-motivo").value.trim();
  const tipo = document.getElementById("input-feriado-tipo").value;

  if (!fecha || !motivo) return;

  try {
    const res = await apiFetch("/feriados", {
      method: "POST",
      body: JSON.stringify({ fecha, motivo, tipo })
    });
    if (res.ok) {
      notificarToast("Feriado registrado en el calendario.", "success");
      document.getElementById("input-feriado-fecha").value = "";
      document.getElementById("input-feriado-motivo").value = "";
      await cargarListaFeriados();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al registrar feriado.");
    }
  } catch (err) {
    alert("Error de conexión al registrar feriado.");
  }
}

export function iniciarEdicionFeriado(id, fechaActual, motivoActual, tipoActual) {
  document.getElementById("edit-feriado-id").value = id;
  document.getElementById("edit-feriado-fecha").value = fechaActual;
  document.getElementById("edit-feriado-motivo").value = motivoActual;
  document.getElementById("edit-feriado-tipo").value = tipoActual || "Calendario";
  document.getElementById("modal-editar-feriado")?.classList.remove("hidden");
}

export function cerrarModalEditarFeriado() {
  document.getElementById("modal-editar-feriado")?.classList.add("hidden");
}

export async function guardarEdicionFeriadoModal(e) {
  e.preventDefault();
  const id = document.getElementById("edit-feriado-id").value;
  const fecha = document.getElementById("edit-feriado-fecha").value;
  const motivo = document.getElementById("edit-feriado-motivo").value.trim();
  const tipo = document.getElementById("edit-feriado-tipo").value;

  if (!fecha || !motivo) {
    alert("Por favor complete todos los campos.");
    return;
  }

  try {
    const res = await apiFetch(`/feriados/${id}`, {
      method: "PUT",
      body: JSON.stringify({ fecha, motivo, tipo })
    });

    if (res.ok) {
      cerrarModalEditarFeriado();
      notificarToast("Feriado actualizado con éxito.", "success");
      await cargarListaFeriados();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al actualizar feriado.");
    }
  } catch (e) {
    alert("Error de conexión al actualizar feriado.");
  }
}

export async function eliminarFeriado(id) {
  const confirma = await confirmModal("¿Desea eliminar esta fecha del calendario institucional?", "Eliminar feriado", "danger");
  if (!confirma) return;

  try {
    const res = await apiFetch(`/feriados/${id}`, { method: "DELETE" });
    if (res.ok) {
      notificarToast("Feriado eliminado con éxito.", "info");
      await cargarListaFeriados();
    } else {
      alert("Error al eliminar feriado.");
    }
  } catch (err) {
    alert("Error al eliminar feriado.");
  }
}

export async function proyectarFeriadosSiguienteAno() {
  const confirma = await confirmModal("¿Desea proyectar los feriados institucionales para el siguiente año fiscal?", "Proyección anual de feriados", "question");
  if (!confirma) return;

  try {
    const res = await apiFetch("/feriados/proyectar-siguiente-ano", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      notificarToast(data.mensaje, "success", 5000);
      const selAno = document.getElementById("sel-filtro-ano-feriados");
      if (selAno) selAno.value = data.year_proyectado;
      await cargarListaFeriados();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al proyectar feriados.");
    }
  } catch (e) {
    alert("Error de conexión al proyectar calendario.");
  }
}

// --- PROCESOS INSTITUCIONALES ---
let cacheProcesosAdminTI = [];
let procesoEditandoId = null;

export async function cargarListaProcesosTI() {
  const tbody = document.getElementById("tabla-procesos-ti-body");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400 font-semibold animate-pulse">Cargando procesos institucionales...</td></tr>';

  try {
    const res = await apiFetch("/procesos-institucionales?incluir_inactivos=true");
    if (!res.ok) throw new Error("Error al obtener catálogo");
    const procesos = await res.json();
    cacheProcesosAdminTI = procesos;
    state.catalogoProcesosGlobal = procesos.filter(p => p.estado === "ACTIVO");

    // Llenar el selector de procesos padre del formulario con indentación de guiones limpios
    const selPadre = document.getElementById("input-proc-ti-padre");
    if (selPadre) {
      let htmlPadres = '<option value="">-- Ninguno (nivel 0) --</option>';
      procesos.forEach(p => {
        const nivel = parseInt(p.nivel || 0);
        const guiones = "— ".repeat(nivel);
        htmlPadres += `<option value="${p.codigo}">${guiones}[${p.codigo}] ${p.nombre}</option>`;
      });
      selPadre.innerHTML = htmlPadres;
    }

    tbody.innerHTML = "";
    if (procesos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-gray-400 italic font-semibold">No hay procesos registrados.</td></tr>';
      return;
    }

    // Badges cromáticos definidos para soportar de forma natural desde Nivel 0 hasta Nivel 5+
    const badgesNivel = {
      0: "bg-blue-100 text-blue-900 border-blue-300 font-black",
      1: "bg-teal-100 text-teal-900 border-teal-300 font-bold",
      2: "bg-emerald-100 text-emerald-900 border-emerald-300 font-semibold",
      3: "bg-amber-100 text-amber-900 border-amber-300 font-semibold",
      4: "bg-purple-100 text-purple-900 border-purple-300 font-semibold",
      5: "bg-slate-100 text-slate-800 border-slate-300 font-medium"
    };

    tbody.innerHTML = procesos.map(p => {
      const nivel = parseInt(p.nivel || 0);
      const paddingLeftPx = Math.min(nivel * 20, 100);

      let iconoNivel = "";
      if (nivel === 0) iconoNivel = `<span class="inline-block w-2.5 h-2.5 rounded-full bg-[#0f2a4a] mr-2 flex-shrink-0"></span>`;
      else if (nivel === 1) iconoNivel = `<span class="inline-block w-2 h-2 rounded-sm bg-teal-600 mr-2 flex-shrink-0"></span>`;
      else iconoNivel = `<span class="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 mr-2 flex-shrink-0"></span>`;

      const badgeClase = badgesNivel[nivel] || badgesNivel[5];
      const etiquetaNivel = nivel === 0 ? "Macroproceso" : (nivel === 1 ? "Nivel 1" : `Nivel ${nivel}`);
      const pNombreEscapado = (p.nombre || "").replace(/'/g, "\\'");

      return `
        <tr class="hover:bg-gray-50 border-b border-gray-100 transition">
          <td class="p-2 font-mono font-bold text-[#0f2a4a] text-xs whitespace-nowrap">${p.codigo || ''}</td>
          <td class="p-2 text-xs">
            <div style="padding-left: ${paddingLeftPx}px;" class="flex items-center">
              ${iconoNivel}
              <span class="${nivel === 0 ? 'font-black text-[#0f2a4a]' : (nivel === 1 ? 'font-bold text-teal-950' : 'text-gray-800')}">${p.nombre || ''}</span>
            </div>
          </td>
          <td class="p-2 text-center whitespace-nowrap">
            <span class="text-[10px] uppercase px-2 py-0.5 rounded-md border ${badgeClase}">
              ${etiquetaNivel}
            </span>
          </td>
          <td class="p-2 text-center font-mono text-gray-500 text-xs">${p.codigo_padre || '-'}</td>
          <td class="p-2 text-center whitespace-nowrap space-x-1.5">
            <button onclick="prepararEdicionProcesoTI(${p.id})" class="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[10px] font-bold cursor-pointer transition" title="Editar código o denominación">✏️</button>
            <button onclick="eliminarProcesoTI(${p.id}, '${p.codigo}', '${pNombreEscapado}')" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[10px] font-bold cursor-pointer transition" title="Eliminar proceso y limpiar proyectos">🗑️</button>
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-rose-500 font-semibold">Error al cargar catálogo de procesos.</td></tr>';
  }
}

export function prepararEdicionProcesoTI(id) {
  const p = cacheProcesosAdminTI.find(x => x.id === id);
  if (!p) return;
  procesoEditandoId = p.id;

  const inpCod = document.getElementById("input-proc-ti-codigo");
  const inpNom = document.getElementById("input-proc-ti-nombre");
  const selNiv = document.getElementById("input-proc-ti-nivel");
  const selPad = document.getElementById("input-proc-ti-padre");
  const btnGuardar = document.getElementById("btn-guardar-proc-ti");
  const btnCancelar = document.getElementById("btn-cancelar-edicion-proc");

  if (inpCod) inpCod.value = p.codigo || "";
  if (inpNom) inpNom.value = p.nombre || "";
  if (selNiv) selNiv.value = String(p.nivel ?? 2);
  if (selPad) selPad.value = p.codigo_padre || "";

  if (btnGuardar) {
    btnGuardar.innerText = "💾 Actualizar proceso";
    btnGuardar.className = "px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition shadow cursor-pointer";
  }
  if (btnCancelar) btnCancelar.classList.remove("hidden");
  inpCod?.focus();
}

export function cancelarEdicionProcesoTI() {
  procesoEditandoId = null;
  const inpCod = document.getElementById("input-proc-ti-codigo");
  const inpNom = document.getElementById("input-proc-ti-nombre");
  const selNiv = document.getElementById("input-proc-ti-nivel");
  const selPad = document.getElementById("input-proc-ti-padre");
  const btnGuardar = document.getElementById("btn-guardar-proc-ti");
  const btnCancelar = document.getElementById("btn-cancelar-edicion-proc");

  if (inpCod) inpCod.value = "";
  if (inpNom) inpNom.value = "";
  if (selNiv) selNiv.value = "2";
  if (selPad) selPad.value = "";

  if (btnGuardar) {
    btnGuardar.innerText = "+ Guardar proceso";
    btnGuardar.className = "px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition shadow cursor-pointer";
  }
  if (btnCancelar) btnCancelar.classList.add("hidden");
}

export async function guardarProcesoTI(e) {
  e.preventDefault();
  const codigo = document.getElementById("input-proc-ti-codigo")?.value.trim().toUpperCase();
  const nombre = document.getElementById("input-proc-ti-nombre")?.value.trim();
  const nivel = parseInt(document.getElementById("input-proc-ti-nivel")?.value || "2", 10);
  const codigo_padre = document.getElementById("input-proc-ti-padre")?.value.trim().toUpperCase() || null;

  if (!codigo || !nombre) {
    alert("Por favor ingrese el código y la denominación del proceso.");
    return;
  }

  try {
    let res;
    if (procesoEditandoId) {
      res = await apiFetch(`/procesos-institucionales/${procesoEditandoId}`, {
        method: "PUT",
        body: JSON.stringify({ codigo, nombre, nivel, codigo_padre })
      });
    } else {
      res = await apiFetch("/procesos-institucionales", {
        method: "POST",
        body: JSON.stringify({ codigo, nombre, nivel, codigo_padre })
      });
    }

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.proyectos_desvinculados > 0) {
        alert(`✅ Proceso actualizado. Se desvinculó de ${data.proyectos_desvinculados} proyecto(s) para que sus gestores vuelvan a seleccionar el subproceso vigente.`);
      } else {
        notificarToast("Proceso institucional guardado correctamente.", "success");
      }
      cancelarEdicionProcesoTI();
      await cargarListaProcesosTI();
      await cargarAdminPlantillas();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al procesar la solicitud del proceso.");
    }
  } catch (err) {
    alert("Error de conexión al guardar proceso.");
  }
}

export async function eliminarProcesoTI(id, codigo, nombre) {
  const confirma = await confirmModal(
    `¿Está seguro de eliminar el proceso [${codigo}] ${nombre}?\n\nSi existen proyectos asociados a este proceso, su proceso relacionado se borrará para que el usuario pueda volver a seleccionarlo.`,
    "Eliminar proceso institucional",
    "danger"
  );
  if (!confirma) return;

  try {
    const res = await apiFetch(`/procesos-institucionales/${id}`, { method: "DELETE" });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.proyectos_desvinculados > 0) {
        alert(`Proceso eliminado. Se limpió la referencia en ${data.proyectos_desvinculados} proyecto(s) asociado(s).`);
      } else {
        notificarToast("Proceso institucional eliminado con éxito.", "info");
      }
      cancelarEdicionProcesoTI();
      await cargarListaProcesosTI();
      await cargarAdminPlantillas();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Error al eliminar proceso.");
    }
  } catch (err) {
    alert("Error de conexión al eliminar proceso.");
  }
}

// --- GESTIÓN CENTRALIZADA DE PLANTILLAS Y CONSTRUCTOR WBS (PESTAÑA 5) ---
let listaPlantillasAdminGlobal = [];
let actividadesEditorWBS = [];

function ordenarPorCodigoWBS(lista) {
  return lista.sort((a, b) => {
    const pa = String(a.codigo || "").split(".").map(n => parseInt(n, 10) || 0);
    const pb = String(b.codigo || "").split(".").map(n => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const va = pa[i] || 0;
      const vb = pb[i] || 0;
      if (va !== vb) return va - vb;
    }
    return 0;
  });
}

function recalcularDiasFasesMadreWBS() {
  const raices = actividadesEditorWBS.filter(a => !String(a.codigo).includes("."));
  raices.forEach(r => {
    const prefijo = String(r.codigo) + ".";
    const hijasDirectas = actividadesEditorWBS.filter(a => {
      const c = String(a.codigo);
      return c.startsWith(prefijo) && c.split(".").length === 2;
    });
    if (hijasDirectas.length > 0) {
      r.dias = hijasDirectas.reduce((acc, h) => acc + (parseInt(h.dias, 10) || 1), 0);
    }
  });
}

export function renderizarEditorWBSPlantilla() {
  const tbody = document.getElementById("tbody-editor-wbs-plantilla");
  const badge = document.getElementById("badge-total-actividades-wbs") || document.getElementById("badge-conteo-tareas-editor");
  if (!tbody) return;

  ordenarPorCodigoWBS(actividadesEditorWBS);
  recalcularDiasFasesMadreWBS();

  if (badge) badge.innerText = `${actividadesEditorWBS.length} actividades`;

  if (actividadesEditorWBS.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-gray-400 font-semibold italic">Esta plantilla no tiene actividades. Haga clic en "+ Nueva fase madre (nivel 1)" arriba a la derecha.</td></tr>`;
    return;
  }

  tbody.innerHTML = actividadesEditorWBS.map((act, idx) => {
    const cod = String(act.codigo || "");
    const partes = cod.split(".");
    const nivel = partes.length;

    const bgFila = nivel === 1
      ? "bg-slate-100/90 font-black text-[#0f2a4a]"
      : (nivel === 2 ? "bg-white text-gray-800 font-semibold" : "bg-slate-50/50 text-gray-600 font-medium");

    const paddingCodPx = (nivel - 1) * 12;
    const paddingDescPx = (nivel - 1) * 16;
    const iconoJerarquia = nivel === 1 ? "📁 " : "• ";

    const btnHija = nivel < 3
      ? `<button type="button" onclick="insertarActividadHijaWBS(${idx})" class="px-2 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded text-[10px] font-bold cursor-pointer transition" title="Crear subactividad hija dentro de ${cod}">+ Hija</button>`
      : "";

    return `
      <tr class="${bgFila} hover:bg-blue-50/40 transition">
        <td class="py-1.5 px-3 font-mono text-xs font-black text-[#0f2a4a] whitespace-nowrap">
          <span style="padding-left: ${paddingCodPx}px;">${iconoJerarquia}${cod}</span>
        </td>
        <td class="py-1.5 px-2" style="padding-left: ${paddingDescPx + 8}px;">
          <input type="text" value="${(act.descripcion || "").replace(/"/g, '&quot;')}"
            oninput="actualizarCampoActividadWBS(${idx}, 'descripcion', this.value)"
            class="w-full p-1.5 bg-white border border-gray-200 rounded-md text-xs ${nivel === 1 ? 'font-black uppercase text-[#0f2a4a]' : 'font-semibold text-gray-800'} outline-none focus:border-[#0f2a4a]">
        </td>
        <td class="py-1.5 px-2 text-center">
          <input type="number" min="1" value="${act.dias || 1}"
            oninput="actualizarCampoActividadWBS(${idx}, 'dias', this.value)"
            class="w-16 p-1 bg-white border border-gray-200 rounded-md text-center text-xs font-bold text-[#0f2a4a] outline-none focus:border-[#0f2a4a]">
        </td>
        <td class="py-1.5 px-2 text-center">
          <input type="text" value="${act.predecesores || ""}" placeholder="-"
            oninput="actualizarCampoActividadWBS(${idx}, 'predecesores', this.value)"
            class="w-20 p-1 bg-white border border-gray-200 rounded-md text-center font-mono text-xs font-semibold text-gray-600 outline-none focus:border-[#0f2a4a]">
        </td>
        <td class="py-1.5 px-2 text-center whitespace-nowrap space-x-1">
          <button type="button" onclick="insertarActividadHermanaWBS(${idx})" class="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[10px] font-bold cursor-pointer transition" title="Crear actividad hermana al mismo nivel que ${cod}">+ Hermana</button>
          ${btnHija}
          <button type="button" onclick="eliminarActividadWBS(${idx})" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[10px] font-bold cursor-pointer transition" title="Eliminar ${cod}">🗑️</button>
        </td>
      </tr>
    `;
  }).join("");
}

export function actualizarCampoActividadWBS(idx, campo, valor) {
  if (!actividadesEditorWBS[idx]) return;
  if (campo === "dias") {
    actividadesEditorWBS[idx].dias = Math.max(1, parseInt(valor, 10) || 1);
  } else {
    actividadesEditorWBS[idx][campo] = valor;
  }
}

export function agregarFaseMadrePlantilla() {
  const raices = actividadesEditorWBS.filter(a => !String(a.codigo).includes("."));
  let maxRaiz = 0;
  raices.forEach(r => {
    const n = parseInt(r.codigo, 10);
    if (!isNaN(n) && n > maxRaiz) maxRaiz = n;
  });
  const nuevoCodMadre = String(maxRaiz + 1);
  const predMadre = maxRaiz > 0 ? String(maxRaiz) : "";

  actividadesEditorWBS.push({
    codigo: nuevoCodMadre,
    descripcion: `FASE ${nuevoCodMadre}: NUEVA ETAPA DEL PROCESO`,
    dias: 3,
    predecesores: predMadre
  });
  actividadesEditorWBS.push({
    codigo: `${nuevoCodMadre}.1`,
    descripcion: "Primera actividad operativa de la fase",
    dias: 3,
    predecesores: ""
  });
  renderizarEditorWBSPlantilla();
}

export function insertarActividadHermanaWBS(idx) {
  const actual = actividadesEditorWBS[idx];
  if (!actual) return;
  const codActual = String(actual.codigo);
  const partes = codActual.split(".");

  if (partes.length === 1) {
    agregarFaseMadrePlantilla();
    return;
  }

  const prefijoPadre = partes.slice(0, -1).join(".");
  const nivelObjetivo = partes.length;

  const hermanas = actividadesEditorWBS.filter(a => {
    const c = String(a.codigo);
    return c.startsWith(prefijoPadre + ".") && c.split(".").length === nivelObjetivo;
  });

  let maxNum = 0;
  hermanas.forEach(h => {
    const ult = parseInt(String(h.codigo).split(".").pop(), 10);
    if (!isNaN(ult) && ult > maxNum) maxNum = ult;
  });

  const nuevoCod = `${prefijoPadre}.${maxNum + 1}`;
  const codAnterior = `${prefijoPadre}.${maxNum}`;

  actividadesEditorWBS.push({
    codigo: nuevoCod,
    descripcion: "Nueva actividad operativa",
    dias: 2,
    predecesores: maxNum > 0 ? codAnterior : ""
  });
  renderizarEditorWBSPlantilla();
}

export function insertarActividadHijaWBS(idx) {
  const madre = actividadesEditorWBS[idx];
  if (!madre) return;
  const codMadre = String(madre.codigo);
  const nivelHija = codMadre.split(".").length + 1;
  if (nivelHija > 3) return;

  const hijasExistentes = actividadesEditorWBS.filter(a => {
    const c = String(a.codigo);
    return c.startsWith(codMadre + ".") && c.split(".").length === nivelHija;
  });

  let maxHija = 0;
  hijasExistentes.forEach(h => {
    const ult = parseInt(String(h.codigo).split(".").pop(), 10);
    if (!isNaN(ult) && ult > maxHija) maxHija = ult;
  });

  const nuevoCodHija = `${codMadre}.${maxHija + 1}`;
  const predHija = maxHija > 0 ? `${codMadre}.${maxHija}` : "";

  actividadesEditorWBS.push({
    codigo: nuevoCodHija,
    descripcion: nivelHija === 2 ? "Nueva actividad hija" : "Nueva subtarea específica",
    dias: 2,
    predecesores: predHija
  });
  renderizarEditorWBSPlantilla();
}

export function eliminarActividadWBS(idx) {
  const act = actividadesEditorWBS[idx];
  if (!act) return;
  const cod = String(act.codigo);
  const tieneHijas = actividadesEditorWBS.some(a => String(a.codigo).startsWith(cod + "."));

  if (tieneHijas) {
    if (!confirm(`La actividad [${cod}] contiene subactividades vinculadas. ¿Desea eliminar [${cod}] y todas sus hijas?`)) return;
  }

  actividadesEditorWBS = actividadesEditorWBS.filter(a => {
    const c = String(a.codigo);
    return c !== cod && !c.startsWith(cod + ".");
  });

  renderizarEditorWBSPlantilla();
}

export async function cargarAdminPlantillas() {
  try {
    const [resPlant, resProc] = await Promise.all([
      apiFetch("/plantillas?modo_admin=1"),
      apiFetch("/procesos-institucionales").catch(() => null)
    ]);

    if (resPlant && resPlant.ok) {
      listaPlantillasAdminGlobal = await resPlant.json();
      window.catalogoPlantillasCache = listaPlantillasAdminGlobal;
    }

    if (resProc && resProc.ok) {
      const procs = await resProc.json();
      state.catalogoProcesosGlobal = procs;
      const selProc = document.getElementById("edit-plantilla-proceso");
      if (selProc) {
        let htmlOpts = `<option value="General">Sin proceso específico (General)</option>`;
        procs.filter(p => p.estado === "ACTIVO").forEach(p => {
          const nivel = parseInt(p.nivel || 0);
          const guiones = "— ".repeat(nivel);
          const valorOficial = `${p.codigo} - ${p.nombre}`;
          htmlOpts += `<option value="${valorOficial.replace(/"/g, '&quot;')}">${guiones}[${p.codigo}] ${p.nombre}</option>`;
        });
        selProc.innerHTML = htmlOpts;
      }
    }

    filtrarTablaAdminPlantillas();
  } catch (e) {
    console.error("Error cargando plantillas en Admin TI:", e);
  }
}

export function filtrarTablaAdminPlantillas() {
  const tbody = document.getElementById("tbody-admin-plantillas");
  if (!tbody) return;

  const q = (document.getElementById("admin-plantillas-busqueda")?.value || "").toLowerCase().trim();
  const filtroTipo = document.getElementById("admin-plantillas-filtro-tipo")?.value || "TODOS";

  const filtradas = listaPlantillasAdminGlobal.filter(p => {
    if (filtroTipo === "OFICIALES" && p.es_oficial !== 1) return false;
    if (filtroTipo === "PERSONALES" && p.es_oficial === 1) return false;
    if (!q) return true;
    return (
      (p.nombre || "").toLowerCase().includes(q) ||
      (p.categoria || "").toLowerCase().includes(q) ||
      (p.descripcion || "").toLowerCase().includes(q) ||
      (p.creador_nombre || "").toLowerCase().includes(q)
    );
  });

  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-400 font-semibold italic">No se encontraron plantillas con ese criterio.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtradas.map((p, idx) => {
    const numTareas = (p.actividades || []).length;
    const cat = p.categoria || "General";
    const tieneProceso = cat !== "General" && cat.includes(" - ");
    const badgeCat = tieneProceso
      ? `<span class="inline-block bg-teal-50 text-teal-900 border border-teal-200 px-2 py-1 rounded-md text-[11px] font-bold leading-tight">${cat}</span>`
      : `<span class="inline-block bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-md text-[11px] font-semibold leading-tight">${cat}</span>`;

    const badgeAlcance = (p.es_oficial === 1)
      ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">🏛️ OFICIAL IMARPE</span>`
      : `<div class="flex flex-col items-center"><span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">👤 PERSONAL</span><span class="text-[10px] text-gray-500 font-medium mt-0.5 truncate max-w-[130px]" title="${p.creador_nombre || ''}">${p.creador_nombre || 'Usuario'}</span></div>`;

    return `
      <tr class="hover:bg-slate-50 transition border-b border-gray-100">
        <td class="p-2.5 text-center font-mono text-gray-400 font-bold">${idx + 1}</td>
        <td class="p-2.5">
          <div class="font-bold text-[#0f2a4a] text-xs leading-snug">${p.nombre}</div>
          <div class="text-[11px] text-gray-500 mt-0.5 leading-snug">${p.descripcion || "Sin descripción"}</div>
        </td>
        <td class="p-2.5">${badgeCat}</td>
        <td class="p-2.5 text-center">${badgeAlcance}</td>
        <td class="p-2.5 text-center">
          <span class="bg-slate-100 text-slate-700 font-black px-2 py-0.5 rounded-full text-[11px]">${numTareas}</span>
        </td>
        <td class="p-2.5 text-center whitespace-nowrap space-x-1">
          <button type="button" onclick="abrirEdicionPlantillaAdmin(${p.id})" class="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-md font-bold text-[11px] cursor-pointer transition" title="Editar plantilla y actividades WBS">
            ✏️ Editar
          </button>
          <button type="button" onclick="eliminarPlantillaDesdeAdmin(${p.id})" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md font-bold text-[11px] cursor-pointer transition" title="Eliminar plantilla">
            🗑️
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

export function abrirNuevaPlantillaAdmin() {
  document.getElementById("edit-plantilla-id").value = "";
  document.getElementById("edit-plantilla-nombre").value = "";
  document.getElementById("edit-plantilla-descripcion").value = "";
  
  const selVis = document.getElementById("edit-plantilla-visibilidad") || document.getElementById("edit-plantilla-oficial");
  if (selVis) selVis.value = "1";
  
  const selProc = document.getElementById("edit-plantilla-proceso");
  if (selProc) selProc.value = "General";

  const tit = document.getElementById("lbl-titulo-editor-plantilla") || document.getElementById("titulo-box-editor-plantilla");
  if (tit) tit.innerText = "✨ CREAR NUEVA PLANTILLA OFICIAL Y ESTRUCTURA WBS";

  actividadesEditorWBS = [
    { codigo: "1", descripcion: "FASE 1: ACTOS PREPARATORIOS", dias: 4, predecesores: "" },
    { codigo: "1.1", descripcion: "Elaboración y revisión del requerimiento o documento inicial", dias: 2, predecesores: "" },
    { codigo: "1.2", descripcion: "Validación técnica y aprobación de inicio", dias: 2, predecesores: "1.1" }
  ];

  renderizarEditorWBSPlantilla();
  const box = document.getElementById("box-editar-plantilla-admin");
  if (box) {
    box.classList.remove("hidden");
  }
}

export function abrirEdicionPlantillaAdmin(id) {
  const plant = listaPlantillasAdminGlobal.find(x => x.id === id);
  if (!plant) return;

  const tit = document.getElementById("lbl-titulo-editor-plantilla") || document.getElementById("titulo-box-editor-plantilla");
  if (tit) tit.innerText = `✏️ EDITANDO PLANTILLA: ${(plant.nombre || "").toUpperCase()}`;

  document.getElementById("edit-plantilla-id").value = plant.id;
  document.getElementById("edit-plantilla-nombre").value = plant.nombre || "";
  document.getElementById("edit-plantilla-descripcion").value = plant.descripcion || "";

  const selVis = document.getElementById("edit-plantilla-visibilidad") || document.getElementById("edit-plantilla-oficial");
  if (selVis) selVis.value = String(plant.es_oficial === 1 ? 1 : 0);

  const selProc = document.getElementById("edit-plantilla-proceso");
  if (selProc) {
    const catActual = plant.categoria || "General";
    const existeExacto = Array.from(selProc.options).some(opt => opt.value === catActual);
    if (existeExacto) {
      selProc.value = catActual;
    } else {
      const codMatch = catActual.match(/([EMS]\d+(?:\.\d+)*)/);
      const optPorCod = codMatch ? Array.from(selProc.options).find(opt => opt.value.startsWith(codMatch[1] + " -")) : null;
      selProc.value = optPorCod ? optPorCod.value : "General";
    }
  }

  actividadesEditorWBS = (plant.actividades || []).map(a => ({
    codigo: String(a.codigo || ""),
    descripcion: String(a.descripcion || ""),
    dias: parseInt(a.dias, 10) || 1,
    predecesores: String(a.predecesores || "")
  }));

  renderizarEditorWBSPlantilla();

  const box = document.getElementById("box-editar-plantilla-admin");
  if (box) {
    box.classList.remove("hidden");
  }
}

export function cerrarEdicionPlantillaAdmin() {
  const box = document.getElementById("box-editar-plantilla-admin");
  if (box) box.classList.add("hidden");
  // Asegurar permanencia visual en la pestaña de plantillas
  cambiarTabTI("plantillas");
}

export async function guardarEdicionPlantillaAdmin() {
  const idRaw = document.getElementById("edit-plantilla-id")?.value;
  const id = idRaw ? parseInt(idRaw, 10) : null;
  const nombre = document.getElementById("edit-plantilla-nombre")?.value.trim();
  const descripcion = document.getElementById("edit-plantilla-descripcion")?.value.trim();
  const categoria = document.getElementById("edit-plantilla-proceso")?.value || "General";
  
  const selVis = document.getElementById("edit-plantilla-visibilidad") || document.getElementById("edit-plantilla-oficial");
  const es_oficial = parseInt(selVis?.value ?? "1", 10);

  if (!nombre) {
    alert("El nombre de la plantilla es obligatorio.");
    return;
  }

  if (actividadesEditorWBS.length === 0) {
    alert("La plantilla debe tener al menos una actividad.");
    return;
  }

  recalcularDiasFasesMadreWBS();

  try {
    const url = id ? `/plantillas/${id}` : `/plantillas`;
    const metodo = id ? "PUT" : "POST";

    const res = await apiFetch(url, {
      method: metodo,
      body: JSON.stringify({
        nombre,
        descripcion,
        categoria,
        es_oficial,
        actividades: actividadesEditorWBS
      })
    });

    if (res.ok) {
      notificarToast("Plantilla y actividades guardadas exitosamente.", "success");
      cerrarEdicionPlantillaAdmin();
      await cargarAdminPlantillas();
      if (typeof window.cargarPlantillasModalNuevoProyecto === "function") {
        window.cargarPlantillasModalNuevoProyecto();
      }
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "No se pudo guardar la plantilla.");
    }
  } catch (e) {
    alert("Error de conexión al guardar la plantilla.");
  }
}

export async function eliminarPlantillaDesdeAdmin(id) {
  const plant = listaPlantillasAdminGlobal.find(x => x.id === id);
  if (!plant) return;
  const confirma = await confirmModal(`¿Está seguro de eliminar permanentemente la plantilla "${plant.nombre}"?`, "Eliminar plantilla", "danger");
  if (!confirma) return;

  try {
    const res = await apiFetch(`/plantillas/${id}`, { method: "DELETE" });
    if (res.ok) {
      notificarToast("Plantilla eliminada correctamente.", "info");
      await cargarAdminPlantillas();
      if (typeof window.cargarPlantillasModalNuevoProyecto === "function") {
        window.cargarPlantillasModalNuevoProyecto();
      }
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "No se pudo eliminar la plantilla.");
    }
  } catch (e) {
    alert("Error al eliminar la plantilla.");
  }
}

// Exposición pública de funciones para eventos HTML
window.abrirModalAdminTI = abrirModalAdminTI;
window.cerrarModalAdminTI = cerrarModalAdminTI;
window.cambiarTabTI = cambiarTabTI;
window.filtrarDirectorioTrabajadores = filtrarDirectorioTrabajadores;
window.abrirModalEditarTrabajador = abrirModalEditarTrabajador;
window.cerrarModalEditarTrabajador = cerrarModalEditarTrabajador;
window.guardarEdicionTrabajador = guardarEdicionTrabajador;
window.autocompletarUOEdicion = autocompletarUOEdicion;
window.registrarTrabajadorTI = registrarTrabajadorTI;
window.autocompletarUnidadOrganica = autocompletarUnidadOrganica;
window.solicitarDarDeBajaTrabajador = solicitarDarDeBajaTrabajador;
window.abrirModalTrabajadoresBaja = abrirModalTrabajadoresBaja;
window.cerrarModalTrabajadoresBaja = cerrarModalTrabajadoresBaja;
window.filtrarTrabajadoresBajaModal = filtrarTrabajadoresBajaModal;
window.solicitarReactivarTrabajador = solicitarReactivarTrabajador;
window.registrarNuevaUnidadOrganica = registrarNuevaUnidadOrganica;
window.actualizarDependenciaROF = actualizarDependenciaROF;
window.asignarTitularUnidad = asignarTitularUnidad;
window.guardarFeriado = guardarFeriado;
window.iniciarEdicionFeriado = iniciarEdicionFeriado;
window.cerrarModalEditarFeriado = cerrarModalEditarFeriado;
window.guardarEdicionFeriadoModal = guardarEdicionFeriadoModal;
window.eliminarFeriado = eliminarFeriado;
window.proyectarFeriadosSiguienteAno = proyectarFeriadosSiguienteAno;
window.cargarListaFeriados = cargarListaFeriados;
window.cargarListaProcesosTI = cargarListaProcesosTI;
window.prepararEdicionProcesoTI = prepararEdicionProcesoTI;
window.cancelarEdicionProcesoTI = cancelarEdicionProcesoTI;
window.guardarProcesoTI = guardarProcesoTI;
window.eliminarProcesoTI = eliminarProcesoTI;

// Exposición de funciones del módulo de plantillas y constructor WBS
window.cargarAdminPlantillas = cargarAdminPlantillas;
window.filtrarTablaAdminPlantillas = filtrarTablaAdminPlantillas;
window.abrirNuevaPlantillaAdmin = abrirNuevaPlantillaAdmin;
window.abrirEdicionPlantillaAdmin = abrirEdicionPlantillaAdmin;
window.cerrarEdicionPlantillaAdmin = cerrarEdicionPlantillaAdmin;
window.cerrarEditorPlantillaAdmin = cerrarEdicionPlantillaAdmin; // Alias para compatibilidad con el modal
window.guardarEdicionPlantillaAdmin = guardarEdicionPlantillaAdmin;
window.guardarCambiosPlantillaAdmin = guardarEdicionPlantillaAdmin; // Alias para compatibilidad con el modal
window.eliminarPlantillaDesdeAdmin = eliminarPlantillaDesdeAdmin;
window.actualizarCampoActividadWBS = actualizarCampoActividadWBS;
window.agregarFaseMadrePlantilla = agregarFaseMadrePlantilla;
window.insertarNuevaFaseMadreWBS = agregarFaseMadrePlantilla; // Alias para el botón superior
window.insertarActividadHermanaWBS = insertarActividadHermanaWBS;
window.insertarActividadHijaWBS = insertarActividadHijaWBS;
window.eliminarActividadWBS = eliminarActividadWBS;

// Cierre de modales auxiliares TI
export function cerrarModalCrearTrabajadorTI() {
  document.getElementById("modal-editar-trabajador-ti")?.classList.add("hidden");
}
window.cerrarModalCrearTrabajadorTI = cerrarModalCrearTrabajadorTI;

// Listener para cerrar el modal del editor WBS al presionar la tecla Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" || e.key === "Esc") {
    const boxEditor = document.getElementById("box-editar-plantilla-admin");
    if (boxEditor && !boxEditor.classList.contains("hidden")) {
      e.preventDefault();
      cerrarEdicionPlantillaAdmin();
    }
  }
});