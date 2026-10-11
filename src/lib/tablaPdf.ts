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
}

const MARGEN = 15;
const ALTO_LINEA = 4.6;
const PAD_FILA = 2.2;
const ALTO_ENCABEZADO_TABLA = 7;
const ESPACIO_PIE = 20;

// Documento A4 con encabezado de empresa, datos, y una o más tablas con salto
// de página automático. Lo usan el pedido a proveedores y el informe de
// reposición. jsPDF es pesada: se descarga recién la primera vez que se genera un PDF.
export async function generarTablaPdf(input: TablaPdfInput): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const anchoUtil = w - MARGEN * 2;

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

  doc.setFontSize(10); doc.setTextColor(30, 30, 30);
  for (const d of input.datos ?? []) {
    if (!d.texto.trim()) continue;
    doc.setFont('helvetica', 'bold');
    const etiqueta = `${d.etiqueta}:`;
    doc.text(etiqueta, MARGEN, y);
    const xValor = MARGEN + doc.getTextWidth(etiqueta) + 2;
    doc.setFont('helvetica', 'normal');
    const lineas: string[] = doc.splitTextToSize(d.texto.trim(), w - MARGEN - xValor);
    doc.text(lineas, xValor, y);
    y += lineas.length * ALTO_LINEA + 1.5;
  }
  if (input.nota?.trim()) {
    doc.setTextColor(80, 80, 80);
    const lineasNota: string[] = doc.splitTextToSize(input.nota.trim(), anchoUtil);
    doc.text(lineasNota, MARGEN, y);
    y += lineasNota.length * ALTO_LINEA + 2;
  }
  y += 2;

  function encabezadoTabla() {
    doc.setFillColor(238, 242, 248);
    doc.rect(MARGEN, y, anchoUtil, ALTO_ENCABEZADO_TABLA, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
    input.columnas.forEach((c, i) => doc.text(c.header, xTexto(i), y + 4.8, opciones(i)));
    y += ALTO_ENCABEZADO_TABLA;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 30, 30);
  }

  function altoTitulo(t: TituloPdf) { return t.nivel === 1 ? 11 : 9; }

  function dibujarTitulo(t: TituloPdf) {
    y += t.nivel === 1 ? 4 : 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(t.nivel === 1 ? 11 : 10);
    if (t.nivel === 1) doc.setTextColor(30, 64, 130); else doc.setTextColor(90, 90, 90);
    doc.text(t.texto, MARGEN, y + 3);
    doc.setDrawColor(t.nivel === 1 ? 170 : 210, t.nivel === 1 ? 180 : 210, t.nivel === 1 ? 200 : 210);
    doc.line(MARGEN, y + 4.6, w - MARGEN, y + 4.6);
    y += altoTitulo(t) - (t.nivel === 1 ? 4 : 2);
  }

  const altoFila = (celdas: string[][]) => Math.max(...celdas.map(l => l.length), 1) * ALTO_LINEA + PAD_FILA * 2;
  const partirFila = (fila: string[]) => fila.map((texto, i) => doc.splitTextToSize(texto || '', anchos[i] - 4) as string[]);

  for (const seccion of input.secciones) {
    if (!seccion.filas.length) continue;
    const titulos = seccion.titulos ?? [];
    const altoTitulos = titulos.reduce((acc, t) => acc + altoTitulo(t), 0);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const primera = altoFila(partirFila(seccion.filas[0]));
    // Título + encabezado + primera fila tienen que entrar juntos: nunca queda un título solo al pie de una página.
    if (y + altoTitulos + ALTO_ENCABEZADO_TABLA + primera > h - ESPACIO_PIE) { doc.addPage(); y = MARGEN; }
    titulos.forEach(dibujarTitulo);
    encabezadoTabla();

    for (const fila of seccion.filas) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 30, 30);
      const celdas = partirFila(fila);
      const alto = altoFila(celdas);
      if (y + alto > h - ESPACIO_PIE) { doc.addPage(); y = MARGEN; encabezadoTabla(); }
      const yTexto = y + PAD_FILA + 3.4;
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
