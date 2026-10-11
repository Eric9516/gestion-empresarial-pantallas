// Módulos que cada empresa puede tener. Los define quien vende (no el cliente) con el comando
// "pnpm cliente modulos", y quedan guardados en la tabla "licencia", que ningún usuario puede escribir.
// Un módulo apagado queda bloqueado en la base de datos para todos; acá solo se oculta lo que ya no
// se puede usar. La lista y sus dependencias están en modulos.json, que también lee el comando.

import datos from './modulos.json';

export type ModuloId = 'proveedores' | 'comisionistas' | 'envios' | 'deposito' | 'mantenimiento' | 'tareas';
export type Modulos = Record<ModuloId, boolean>;

export interface ModuloInfo {
  id: ModuloId;
  nombre: string;
  // Componente del producto al que pertenece
  componente: 'base' | 'abastecimiento' | 'mantenimiento';
  descripcion: string;
  // Módulos sin los cuales este no puede funcionar
  requiere: ModuloId[];
  // Qué queda bloqueado al apagarlo (lo muestra el comando que cambia la licencia)
  bloquea: string;
}

export const MODULOS = datos.modulos as ModuloInfo[];

// Un módulo está activo SOLO si la licencia lo dice de forma expresa. Lo que no figura cuenta como apagado:
// así un módulo nuevo que se agregue al sistema no llega a ningún cliente hasta que se le active.
// (La base de datos usa la misma regla en modulo_activo().)
export function normalizarModulos(valor: unknown): Modulos {
  const guardado = valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
  return Object.fromEntries(MODULOS.map(m => [m.id, guardado[m.id] === true])) as Modulos;
}

// Cuando la licencia todavía no se pudo leer, la pantalla no oculta nada: lo que protege es la base de datos.
export const TODOS_ACTIVOS: Modulos = Object.fromEntries(MODULOS.map(m => [m.id, true])) as Modulos;

// Un módulo solo funciona si también están activos los que necesita.
export function efectivos(m: Modulos): Modulos {
  const e = { ...m };
  // Se repite hasta que no cambie nada (una cadena de dependencias se apaga entera).
  for (let cambio = true; cambio;) {
    cambio = false;
    for (const mod of MODULOS) {
      if (e[mod.id] && mod.requiere.some(r => !e[r])) { e[mod.id] = false; cambio = true; }
    }
  }
  return e;
}

// Funciones que existen solo cuando dos módulos están activos a la vez.
export function integraciones(m: Modulos) {
  const e = efectivos(m);
  return {
    // Proveedores por repuesto: salen del Depósito y necesitan un proveedor.
    depositoConProveedores: e.deposito && e.proveedores,
    // Reparaciones: son de Mantenimiento, usan repuestos del Depósito y necesitan un proveedor.
    reparaciones: e.mantenimiento && e.deposito && e.proveedores,
    // Elegir un comisionista al armar un envío.
    enviosConComisionistas: e.envios && e.comisionistas,
  };
}

// ¿Queda alguna pestaña en la pantalla del Directorio?
export function hayModulosDeDirectorio(m: Modulos): boolean {
  const e = efectivos(m);
  return e.proveedores || e.comisionistas || e.envios || e.tareas;
}

// ---- Licencia + interruptor del dueño ----
// Un módulo funciona si (1) la licencia lo incluye y su componente está instalado, y (2) el dueño no lo apagó.
// La base de datos aplica la misma regla en modulo_activo(); acá se usa para mostrar solo lo que se puede usar.
export interface EstadoDeModulos {
  // Los que el plan incluye (y cuyo componente está instalado).
  contratados: Modulos;
  // Los que el dueño apagó dentro de lo contratado.
  apagados: Partial<Record<ModuloId, boolean>>;
  // Los que de verdad se pueden usar (ya descontadas las dependencias).
  activos: Modulos;
}

export function resolverModulos(licencia: unknown, componentes: unknown, apagadosCrudo: unknown): EstadoDeModulos {
  const lic = normalizarModulos(licencia);
  // Si todavía no se conoce la lista de componentes instalados (instalaciones de antes), solo manda la licencia.
  const instalados = Array.isArray(componentes) ? (componentes as unknown[]).filter((c): c is string => typeof c === 'string') : null;
  const contratados = Object.fromEntries(MODULOS.map(m => [m.id, lic[m.id] && (instalados == null || instalados.includes(m.componente))])) as Modulos;
  const crudo = apagadosCrudo && typeof apagadosCrudo === 'object' && !Array.isArray(apagadosCrudo) ? (apagadosCrudo as Record<string, unknown>) : {};
  const apagados = Object.fromEntries(MODULOS.filter(m => contratados[m.id] && crudo[m.id] === true).map(m => [m.id, true])) as EstadoDeModulos['apagados'];
  const prendidos = Object.fromEntries(MODULOS.map(m => [m.id, contratados[m.id] && !apagados[m.id]])) as Modulos;
  return { contratados, apagados, activos: efectivos(prendidos) };
}

// Módulos que hoy están en uso y necesitan a `id` (hay que apagarlos antes de apagar este).
export function dependientesEnUso(id: ModuloId, activos: Modulos): ModuloInfo[] {
  return MODULOS.filter(m => m.requiere.includes(id) && activos[m.id]);
}

// Módulos que necesita `id` y hoy no están en uso (hay que prenderlos antes de prender este).
export function requisitosFaltantes(id: ModuloId, activos: Modulos): ModuloInfo[] {
  const m = MODULOS.find(x => x.id === id);
  return (m?.requiere ?? []).map(r => MODULOS.find(x => x.id === r)!).filter(r => !activos[r.id]);
}
