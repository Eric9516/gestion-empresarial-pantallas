// Preferencias de pantalla de cada persona: se guardan en su perfil (usuarios_perfil.preferencias) y la base valida los valores.

export type PosicionMenu = 'lateral' | 'arriba' | 'abajo';

/** Las clases de la pantalla según dónde está el menú (para que el contenido le deje lugar). */
export function clasesDelMenu(posicion: PosicionMenu, fijo: boolean): string {
  return `con-menu menu-en-${posicion}${posicion === 'lateral' && fijo ? ' menu-fijo' : ''}`;
}

export const POSICIONES_MENU: { id: PosicionMenu; nombre: string }[] = [
  { id: 'lateral', nombre: 'Menú a la izquierda' },
  { id: 'arriba', nombre: 'Menú arriba' },
  { id: 'abajo', nombre: 'Menú abajo' },
];

/** Tamaño de la letra de los PDF con tablas (informe de reposición, solicitud de presupuesto…). */
export type LetraPdf = 'chica' | 'normal' | 'grande';

export const LETRAS_PDF: { id: LetraPdf; nombre: string }[] = [
  { id: 'chica', nombre: 'Chica' },
  { id: 'normal', nombre: 'Normal' },
  { id: 'grande', nombre: 'Grande' },
];

/** Si la persona no eligió: chica (entran más filas por hoja). */
export const LETRA_PDF_POR_DEFECTO: LetraPdf = 'chica';

export interface PreferenciasPantalla {
  menu_posicion?: PosicionMenu;
  menu_fijo?: boolean;
  pdf_letra?: LetraPdf;
}

// Lee lo que venga (de la base o del navegador) y se queda solo con lo válido: un dato raro no rompe la pantalla.
export function leerPreferencias(valor: unknown): PreferenciasPantalla {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
  const v = valor as Record<string, unknown>;
  const p: PreferenciasPantalla = {};
  if (POSICIONES_MENU.some(x => x.id === v.menu_posicion)) p.menu_posicion = v.menu_posicion as PosicionMenu;
  if (typeof v.menu_fijo === 'boolean') p.menu_fijo = v.menu_fijo;
  if (LETRAS_PDF.some(x => x.id === v.pdf_letra)) p.pdf_letra = v.pdf_letra as LetraPdf;
  return p;
}
