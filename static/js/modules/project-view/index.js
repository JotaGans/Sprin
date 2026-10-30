// =========================================================================
// ORQUESTADOR DEL DOMINIO PROYECTO (PROJECT MODULE INDEX)
// =========================================================================

import * as ProjectCore from "./project-core.js";
import * as ProjectWBS from "./project-wbs.js";
import * as ProjectGantt from "./project-gantt.js";
import * as ProjectCPM from "./project-cpm.js";
import * as ProjectAux from "./project-aux.js";

// Re-exportación limpia para importadores ES6
export { ProjectCore, ProjectWBS, ProjectGantt, ProjectCPM, ProjectAux };

// Exposición pública al ámbito global (window) requerida por templates/index.html
const modulosProyecto = [ProjectCore, ProjectWBS, ProjectGantt, ProjectCPM, ProjectAux];

modulosProyecto.forEach(mod => {
  Object.keys(mod).forEach(fnNombre => {
    if (typeof mod[fnNombre] === "function") {
      try {
        window[fnNombre] = mod[fnNombre];
      } catch (e) {}
    }
  });
});

// Asignaciones directas de alta prioridad (Garantía de ejecución en HTML nativo)
window.cambiarVistaProyecto = ProjectWBS.cambiarVistaProyecto;
window.alternarFiltroMisActividades = ProjectWBS.alternarFiltroMisActividades;
window.abrirModalCargaTrabajo = ProjectAux.abrirModalCargaTrabajo;
window.cerrarModalCargaTrabajo = ProjectAux.cerrarModalCargaTrabajo;