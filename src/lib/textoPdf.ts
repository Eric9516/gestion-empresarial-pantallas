// La letra de los PDF (Helvetica de jsPDF) solo tiene los caracteres de Windows-1252: los acentos, la ñ, "·", "—" o "…" sí; la flecha no.
// Un carácter que falta no solo sale mal ("!'"): además separa todas las letras de esa línea. Por eso, antes de escribir, se cambian los que tienen
// un equivalente (la flecha por "->") y los demás se quitan.

// (escritos como códigos: flechas a la derecha, a la izquierda y doble; mayor o igual, menor o igual, distinto; tildes y cruces; espacio duro)
const EQUIVALENTES: Record<string, string> = {
  '\u2192': '->', '\u2190': '<-', '\u2194': '<->', '\u2265': '>=', '\u2264': '<=', '\u2260': '!=',
  '\u2713': 'si', '\u2714': 'si', '\u2717': 'no', '\u2718': 'no', '\u00a0': ' ',
};
// Lo que Windows-1252 tiene además de Latin-1 (del 0x80 al 0x9F).
const EXTRAS_1252 = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

export function textoParaPdf(texto: string): string {
  let r = '';
  for (const c of texto) {
    const cod = c.codePointAt(0) ?? 0;
    if ((cod >= 0x20 && cod <= 0x7e) || (cod >= 0xa1 && cod <= 0xff) || c === '\n' || EXTRAS_1252.has(c)) r += c;
    else if (c in EQUIVALENTES) r += EQUIVALENTES[c];
  }
  return r;
}
