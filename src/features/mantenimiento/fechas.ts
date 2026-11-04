import type { FechaISO } from './tipos';

// Cuentas con fechas yyyy-mm-dd en hora local (sin corrimientos por zona horaria).

export function aFecha(iso: FechaISO): Date {
  return new Date(`${iso}T00:00:00`);
}

export function aISO(d: Date): FechaISO {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function sumarDias(iso: FechaISO, dias: number): FechaISO {
  const d = aFecha(iso);
  d.setDate(d.getDate() + dias);
  return aISO(d);
}

/** Días que van de `desde` a `hasta` (negativo si `hasta` ya pasó). */
export function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86_400_000);
}

export function esFechaValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  return aISO(aFecha(texto)) === texto;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function nombreMes(anio: number, mes: number): string {
  return `${MESES[mes]} ${anio}`;
}

/** "cada 7 días", "cada 2 semanas", "cada 3 meses"... para mostrar una frecuencia en palabras. */
export function frecuenciaEnPalabras(dias: number): string {
  if (dias === 1) return 'todos los días';
  if (dias % 365 === 0) return dias === 365 ? 'cada año' : `cada ${dias / 365} años`;
  if (dias % 30 === 0) return dias === 30 ? 'cada mes' : `cada ${dias / 30} meses`;
  if (dias % 7 === 0) return dias === 7 ? 'cada semana' : `cada ${dias / 7} semanas`;
  return `cada ${dias} días`;
}
