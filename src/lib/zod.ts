import { z } from 'zod';

// Zod para lo que corre en el navegador (los formularios). Sin compilar con eval: con eso Zod valida un poco más rápido, pero al cargar
// prueba si el navegador lo permite y la política de seguridad (CSP) lo anota como un intento de eval. Para formularios no hace falta.
// (Se configura antes de que se defina cualquier esquema: por eso los formularios importan z desde acá.)
z.config({ jitless: true });

export { z };
