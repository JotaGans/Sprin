import { state } from "./state.js";

// =========================================================================
// CLIENTE HTTP CENTRALIZADO (FETCH WRAPPER)
// =========================================================================

export async function apiFetch(endpoint, options = {}) {
  const headers = options.headers || {};
  
  if (state.token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${state.token}`;
  }

  if (!(options.body instanceof FormData) && !(options.body instanceof URLSearchParams) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(endpoint, {
    ...options,
    headers
  });

  if (response.status === 401) {
    localStorage.clear();
    state.token = null;
    state.currentUser = {};
    location.reload();
    throw new Error("Sesión expirada");
  }

  return response;
}