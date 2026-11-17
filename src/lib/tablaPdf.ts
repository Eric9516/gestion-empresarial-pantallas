import type { LetraPdf } from './preferencias';
import { textoParaPdf } from './textoPdf';

export interface ColumnaPdf {
  header: string;
  // En mm. Una sola columna (la de descripción) va sin ancho y ocupa lo que sobra.
  ancho?: number;
  align?: 'left' | 'right';
}

export interface TituloPdf { texto: string; nivel: 1 | 2 }

// Un bloque de filas con su propio encabezado de columnas y, opcionalmente,
// uno o dos títulos arriba (ej. familia y subfamilia).
export interface SeccionPdf {
  titulos?: TituloPdf[];
  filas: string[][];
}

export interface DatoPdf { etiqueta: string; texto: string }

export interface TablaPdfInput {
  empresa: string;
  logo: string;
  titulo: string;
  fecha: string; // yyyy-mm-dd
  datos?: DatoPdf[];
  nota?: string;
  columnas: ColumnaPdf[];
  secciones: SeccionPdf[];
  /** Tamaño de la letra de la tabla y los datos (lo elige cada persona). Sin dato, normal. */
  letra?: LetraPdf;
  /** El encabezado de columnas va una vez por página (arriba de todo), no debajo de cada título. Para listas con muchos grupos chicos. */
  encabezadoUnaVez?: boolean;
}

const MARGEN = 15;
const ALTO_LINEA = 4.6;
const PAD_FILA = 2.2;
const ALTO_ENCABEZADO_TABLA = 7;
const ESPACIO_PIE = 20;
// Cuánto se achica o agranda la tabla (texto, renglones y encabezado) según la letra elegida. El encabezado de la hoja y el pie no cambian.
const ESCALA_LETRA: Record<LetraPdf, number> = { chica: 0.8, normal: 1, grande: 1.2 };

// Documento A4 con encabezado de empresa, datos, y una o más tablas con salto
// de página automático. Lo usan el pedido a proveedores y el informe de
// reposición. jsPDF es pesada: se descarga recién la primera vez que se genera un PDF.
export async function generarTablaPdf(entrada: TablaPdfInput): Promise<Blob> {
  // todo el texto, solo con caracteres que la letra del PDF puede escribir
  const input = limpiarTextos(entrada);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const anchoUtil = w - MARGEN * 2;
  const e = ESCALA_LETRA[input.letra ?? 'normal'];
  const altoLinea = ALTO_LINEA * e, padFila = PAD_FILA * e, altoEncabezadoTabla = ALTO_ENCABEZADO_TABLA * e;
  const letraTexto = 10 * e, letraEncabezado = 9 * e;

  const fijo = input.columnas.reduce((acc, c) => acc + (c.ancho ?? 0), 0);
  const anchos = input.columnas.map(c => c.ancho ?? anchoUtil - fijo);
  const xs: number[] = [];
  anchos.reduce((x, a) => { xs.push(x); return x + a; }, MARGEN);
  // Posición del texto dentro de cada celda (izquierda o derecha, con 2 mm de aire).
  const xTexto = (i: number) => (input.columnas[i].align === 'right' ? xs[i] + anchos[i] - 2 : xs[i] + 2);
  const opciones = (i: number) => (input.columnas[i].align === 'right' ? { align: 'right' as const } : undefined);

  let xEncabezado = MARGEN;
  if (input.logo) {
    try {
      const props = doc.getImageProperties(input.logo);
      const alto = 14;
      const ancho = Math.min(40, (props.width / props.height) * alto);
      doc.addImage(input.logo, 'PNG', MARGEN, 12, ancho, alto);
      xEncabezado = MARGEN + ancho + 4;
    } catch {
      // Un logo corrupto o en un formato no soportado no debería tirar abajo el PDF.
    }
  }
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(input.empresa, xEncabezado, 20);
  doc.setFontSize(16);
  doc.text(input.titulo, w - MARGEN, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100, 100, 100);
  doc.text(new Date(`${input.fecha}T00:00:00`).toLocaleDateString('es-AR'), w - MARGEN, 24, { align: 'right' });

  let y = 32;
  doc.setDrawColor(200, 200, 200); doc.line(MARGEN, y, w - MARGEN, y);
  y += 7;

  doc.setFontSize(letraTexto); doc.setTextColor(30, 30, 30);
  for (const d of input.datos ?? []) {
    if (!d.texto.trim()) continue;
    doc.setFont('helvetica', 'bold');
    const etiqueta = `${d.etiqueta}:`;
    doc.text(etiqueta, MARGEN, y);
    const xValor = MARGEN + doc.getTextWidth(etiqueta) + 2;
    doc.setFont('helvetica', 'normal');
    const lineas: string[] = doc.splitTextToSize(d.texto.trim(), w - MARGEN - xValor);
    doc.text(lineas, xValor, y);
    y += lineas.length * altoLinea + 1.5;
  }
  if (input.nota?.trim()) {
    doc.setTextColor(80, 80, 80);
    const lineasNota: string[] = doc.splitTextToSize(input.nota.trim(), anchoUtil);
    doc.text(lineasNota, MARGEN, y);
    y += lineasNota.length * altoLinea + 2;
  }
  y += 2;

  // Si el encabezado de columnas va una sola vez por página (encabezadoUnaVez), se recuerda si ya se dibujó en esta.
  let encabezadoEnLaPagina = false;
  function nuevaPagina() { doc.addPage(); y = MARGEN; encabezadoEnLaPagina = false; }

  function encabezadoTabla() {
    encabezadoEnLaPagina = true;
    doc.setFillColor(238, 242, 248);
    doc.rect(MARGEN, y, anchoUtil, altoEncabezadoTabla, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(letraEncabezado); doc.setTextColor(60, 60, 60);
    input.columnas.forEach((c, i) => doc.text(c.header, xTexto(i), y + 4.8 * e, opciones(i)));
    y += altoEncabezadoTabla;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(letraTexto); doc.setTextColor(30, 30, 30);
  }

  // Los títulos (familia, subfamilia, el repuesto en el historial…): sobrios, del tamaño del texto y en negrita; si son largos siguen en otra línea.
  const interlineaTitulo = (t: TituloPdf) => (t.nivel === 1 ? 4.4 : 4) * e;
  const espacioSobreTitulo = (t: TituloPdf) => (t.nivel === 1 ? 3 : 2);
  function lineasTitulo(t: TituloPdf): string[] {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize((t.nivel === 1 ? 10 : 9) * e);
    return doc.splitTextToSize(t.texto, anchoUtil) as string[];
  }
  const altoTitulo = (t: TituloPdf) => espacioSobreTitulo(t) + 3 * e + (lineasTitulo(t).length - 1) * interlineaTitulo(t) + 2.6;

  function dibujarTitulo(t: TituloPdf) {
    const lineas = lineasTitulo(t);
    y += espacioSobreTitulo(t);
    doc.setTextColor(t.nivel === 1 ? 35 : 90, t.nivel === 1 ? 35 : 90, t.nivel === 1 ? 35 : 90);
    lineas.forEach((linea, k) => doc.text(linea, MARGEN, y + 3 * e + k * interlineaTitulo(t)));
    const yLinea = y + 3 * e + (lineas.length - 1) * interlineaTitulo(t) + 1.6;
    doc.setDrawColor(215, 215, 215);
    doc.line(MARGEN, yLinea, w - MARGEN, yLinea);
    y = yLinea + 1;
  }

  const altoFila = (celdas: string[][]) => Math.max(...celdas.map(l => l.length), 1) * altoLinea + padFila * 2;
  const partirFila = (fila: string[]) => fila.map((texto, i) => doc.splitTextToSize(texto || '', anchos[i] - 4) as string[]);

  for (const seccion of input.secciones) {
    if (!seccion.filas.length) continue;
    const titulos = seccion.titulos ?? [];
    const altoTitulos = titulos.reduce((acc, t) => acc + altoTitulo(t), 0);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(letraTexto);
    const primera = altoFila(partirFila(seccion.filas[0]));
    const conEncabezado = !input.encabezadoUnaVez || !encabezadoEnLaPagina;
    // Título + encabezado + primera fila tienen que entrar juntos: nunca queda un título solo al pie de una página.
    if (y + altoTitulos + (conEncabezado ? altoEncabezadoTabla : 0) + primera > h - ESPACIO_PIE) nuevaPagina();
    if (input.encabezadoUnaVez && !encabezadoEnLaPagina) encabezadoTabla();
    titulos.forEach(dibujarTitulo);
    if (!input.encabezadoUnaVez) encabezadoTabla();

    for (const fila of seccion.filas) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(letraTexto); doc.setTextColor(30, 30, 30);
      const celdas = partirFila(fila);
      const alto = altoFila(celdas);
      if (y + alto > h - ESPACIO_PIE) { nuevaPagina(); encabezadoTabla(); }
      const yTexto = y + padFila + 3.4 * e;
      celdas.forEach((lineas, i) => doc.text(lineas, xTexto(i), yTexto, opciones(i)));
      y += alto;
      doc.setDrawColor(225, 225, 225); doc.line(MARGEN, y, w - MARGEN, y);
    }
  }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    doc.text(input.empresa, MARGEN, h - 10);
    doc.text(`Página ${i} de ${paginas}`, w - MARGEN, h - 10, { align: 'right' });
  }

  return doc.output('blob');
}

function limpiarTextos(e: TablaPdfInput): TablaPdfInput {
  const t = textoParaPdf;
  return {
    ...e,
    empresa: t(e.empresa),
    titulo: t(e.titulo),
    datos: e.datos?.map(d => ({ etiqueta: t(d.etiqueta), texto: t(d.texto) })),
    nota: e.nota === undefined ? undefined : t(e.nota),
    columnas: e.columnas.map(c => ({ ...c, header: t(c.header) })),
    secciones: e.secciones.map(s => ({ ...s, titulos: s.titulos?.map(x => ({ ...x, texto: t(x.texto) })), filas: s.filas.map(f => f.map(t)) })),
  };
}
