import type { Modulos } from '../../lib/modulos';

// CAMBIO TEMPORAL (modo de ejemplo): la base de pruebas todavía no tiene el módulo "Mantenimiento" en su plan,
// así que, mientras las pantallas usen datos de ejemplo, la sección se muestra también con solo tener el Depósito.
// PARA ERIC: al conectar la base y activar el módulo, poner MODO_DEMO en false (o borrar este archivo y usar
// directamente modulos.mantenimiento).
export const MODO_DEMO = true;

export function mantenimientoVisible(modulos: Modulos): boolean {
  return modulos.mantenimiento || (MODO_DEMO && modulos.deposito);
}
