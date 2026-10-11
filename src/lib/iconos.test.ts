import { describe, expect, it } from 'vitest';

// Los íconos de la app salen todos de `components/Icono.tsx`. Un emoji o un símbolo suelto como ícono (✓, ⋮, ●, 🔧…) se
// ve distinto en cada celular y computadora, no toma el color del texto y rompe la prolijidad: esta prueba lo impide.
// Las flechas → y los separadores tipográficos (· × —) están permitidos porque son texto, no íconos.
const fuentes = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/components/Icono.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const SIMBOLOS = /[←↑↓↔↖-⇿∀-⋿⌀-⏿■-◿☀-➿⤀-⧿⬀-⯿＋]/u;
const PICTOGRAMAS = /(?![©®™])\p{Extended_Pictographic}/u;

/** Quita los comentarios (donde sí se pueden usar flechas y símbolos para explicar). */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\w])\/\/.*$/gm, '$1');
}

describe('íconos', () => {
  it('encuentra los archivos de la app', () => {
    expect(Object.keys(fuentes).length).toBeGreaterThan(100);
  });

  it('ninguna pantalla usa emojis ni símbolos sueltos como ícono (se usa <Icono n="…" />)', () => {
    const sueltos: string[] = [];
    for (const [archivo, texto] of Object.entries(fuentes)) {
      sinComentarios(texto).split('\n').forEach((linea, i) => {
        const m = linea.match(PICTOGRAMAS) ?? linea.match(SIMBOLOS);
        if (m) sueltos.push(`${archivo.replace('/src/', '')}:${i + 1}  "${m[0]}"  →  ${linea.trim().slice(0, 90)}`);
      });
    }
    expect(sueltos, `Usá <Icono n="…" /> (components/Icono.tsx) en lugar de estos símbolos:\n${sueltos.join('\n')}`).toEqual([]);
  });

  it('detecta lo que debe detectar (la prueba no es ciega)', () => {
    for (const malo of ['🔧', '✅', '✓', '⋮', '●', '★', '←', '＋', '▶']) {
      expect(PICTOGRAMAS.test(malo) || SIMBOLOS.test(malo), malo).toBe(true);
    }
    for (const bueno of ['→', '·', '×', '—', '…', '©', '’']) {
      expect(PICTOGRAMAS.test(bueno) || SIMBOLOS.test(bueno), bueno).toBe(false);
    }
  });
});
