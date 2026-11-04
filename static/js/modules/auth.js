import { state } from "../core/state.js";
import { apiFetch } from "../core/api.js";
import { cargarHubProyectos } from "./hub.js";

export function obtenerPrimerNombre(nombreCompleto, usernameFallback) {
  if (!nombreCompleto && !usernameFallback) return "Usuario";
  const texto = String(nombreCompleto || "").trim();
  let nombresParte = texto;

  if (texto.includes(",")) {
    nombresParte = texto.split(",")[1].trim();
  }

  const palabras = nombresParte.split(/\s+/).filter(Boolean);
  let primerNombre = palabras.length > 0 ? palabras[0] : "";

  if (!primerNombre) {
    primerNombre = String(usernameFallback || "Usuario").trim();
  }

  if (primerNombre.toLowerCase() === "admin") {
    return "Administrador";
  }

  return primerNombre.charAt(0).toUpperCase() + primerNombre.slice(1).toLowerCase();
}

export function actualizarDisplaysUsuario() {
  const primerNombre = obtenerPrimerNombre(state.currentUser.nombre_completo, state.currentUser.username);
  const userText = state.currentUser.username || "admin";

  let roleText = "PERSONAL IMARPE";
  if (state.currentUser.rol === "ADMIN_TI") {
    roleText = "ADMINISTRADOR TI";
  } else if (state.currentUser.unidad_organica && state.currentUser.unidad_organica.trim() !== "") {
    roleText = state.currentUser.unidad_organica.trim();
  }

  const saludoHub = document.getElementById("hub-saludo-bienvenida");
  if (saludoHub) saludoHub.innerText = `Bienvenido(a), ${primerNombre}`;

  const uHub = document.getElementById("user-display-hub");
  const rHub = document.getElementById("role-display-hub");
  const uGantt = document.getElementById("user-display");
  const rGantt = document.getElementById("role-display");

  if (uHub) uHub.innerText = userText;
  if (rHub) rHub.innerText = roleText;
  if (uGantt) uGantt.innerText = userText;
  if (rGantt) rGantt.innerText = roleText;

  const esAdminTI = (state.currentUser.rol === "ADMIN_TI");
  const btnTI = document.getElementById("btn-admin-ti") || document.getElementById("btn-admin-ti-hub");
  if (btnTI) btnTI.classList.toggle("hidden", !esAdminTI);
}

export function alternarVisibilidadPasswordLogin() {
  const input = document.getElementById("login-password");
  const eyeOpen = document.getElementById("ico-login-eye-open");
  const eyeClosed = document.getElementById("ico-login-eye-closed");
  if (!input) return;

  if (input.type === "password") {
    input.type = "text";
    if (eyeOpen) eyeOpen.classList.add("hidden");
    if (eyeClosed) eyeClosed.classList.remove("hidden");
  } else {
    input.type = "password";
    if (eyeOpen) eyeOpen.classList.remove("hidden");
    if (eyeClosed) eyeClosed.classList.add("hidden");
  }
}

export function mostrarLogin() {
  document.getElementById("view-login")?.classList.remove("hidden");
  document.getElementById("view-hub")?.classList.add("hidden");
}

export function cerrarSesion() {
  localStorage.clear();
  state.token = null;
  state.currentUser = {};
  location.reload();
}

export function inicializarFormularioLogin() {
  const form = document.getElementById("login-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = document.getElementById("login-username").value.trim();
    const pass = document.getElementById("login-password").value.trim();

    const formData = new URLSearchParams();
    formData.append("username", user);
    formData.append("password", pass);

    try {
      const res = await apiFetch(`/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(errData.detail || "Usuario o contraseña incorrectos.");
        return;
      }

      const data = await res.json();
      if (typeof window.mostrarSplashSprin === "function") {
        window.mostrarSplashSprin();
      }

      state.token = data.access_token;
      state.currentUser = {
        id: data.user_id || (data.user && data.user.id),
        username: data.username || (data.user && data.user.username),
        rol: data.rol || (data.user && data.user.rol),
        nombre_completo: data.nombre_completo || (data.user && data.user.nombre_completo) || "",
        unidad_organica: data.unidad_organica || (data.user && data.user.unidad_organica) || ""
      };
      localStorage.setItem("token", state.token);
      localStorage.setItem("currentUser", JSON.stringify(state.currentUser));

      document.getElementById("view-login")?.classList.add("hidden");
      actualizarDisplaysUsuario();
      await cargarHubProyectos();

      if (typeof window.ocultarSplashSprin === "function") {
        window.ocultarSplashSprin();
      }
    } catch (err) {
      console.error("Error en login:", err);
      alert("Error de conexión con el servidor. Intente nuevamente.");
    }
  });
}

// Exposición a window
window.alternarVisibilidadPasswordLogin = alternarVisibilidadPasswordLogin;
window.mostrarLogin = mostrarLogin;
window.cerrarSesion = cerrarSesion;