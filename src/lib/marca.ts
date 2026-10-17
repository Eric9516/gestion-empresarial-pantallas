// Colores de marca de cada instalación. En la base se guardan solo dos (primario y del
// depósito); acá se derivan las variantes más claras y se aplican como variables CSS.
// Sin color guardado (null), la app usa los colores originales de variables.css.

const HEX = /^#[0-9a-fA-F]{6}$/;

export const COLOR_PRIMARIO_ORIGINAL = '#1a3a6b';
export const COLOR_DEPOSITO_ORIGINAL = '#9a5b12';
// Lo mínimo para que el texto blanco se lea sobre el color (WCAG AA, texto normal).
export const CONTRASTE_MINIMO = 4.5;

export function esColorValido(c: unknown): c is string {
  return typeof c === 'string' && HEX.test(c);
}

function aRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function aHsl(hex: string): [number, number, number] {
  const [r, g, b] = aRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function deHsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

// Variantes del color: la base, una más clara (hover, degradados) y otra todavía más clara
// (enlaces y acentos). Los saltos de luminosidad salen de los colores originales de la app.
export function derivarPaleta(hex: string): { base: string; medio: string; claro: string } {
  const [h, s, l] = aHsl(hex);
  return {
    base: hex.toLowerCase(),
    medio: deHsl(h, s, Math.min(l + 0.1, 0.9)),
    claro: deHsl(h, s, Math.min(l + 0.22, 0.92)),
  };
}

function luminancia(hex: string): number {
  const [r, g, b] = aRgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Contraste del color contra el blanco (de 1 a 21).
export function contrasteConBlanco(hex: string): number {
  return 1.05 / (luminancia(hex) + 0.05);
}

export function textoLegibleConBlanco(hex: string): boolean {
  return contrasteConBlanco(hex) >= CONTRASTE_MINIMO;
}

interface Estilable {
  style: { setProperty(nombre: string, valor: string): void; removeProperty(nombre: string): unknown };
}

// Aplica (o quita, si no hay color válido) las variables de marca sobre un elemento raíz.
export function aplicarMarca(raiz: Estilable, marca: { primario?: string | null; deposito?: string | null }): void {
  const poner = (variables: [string, string][] , nombres: string[]) => {
    if (variables.length) variables.forEach(([n, v]) => raiz.style.setProperty(n, v));
    else nombres.forEach(n => raiz.style.removeProperty(n));
  };

  const p = esColorValido(marca.primario) ? derivarPaleta(marca.primario) : null;
  poner(p ? [['--blue', p.base], ['--blue-mid', p.medio], ['--blue-light', p.claro]] : [], ['--blue', '--blue-mid', '--blue-light']);

  const d = esColorValido(marca.deposito) ? derivarPaleta(marca.deposito) : null;
  poner(d ? [['--deposito', d.base], ['--deposito-mid', d.medio]] : [], ['--deposito', '--deposito-mid']);
}
