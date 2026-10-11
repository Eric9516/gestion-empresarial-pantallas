import qrcode from 'qrcode-generator';

export type FormatoEtiqueta = 'qr' | 'qr_codigo' | 'qr_nombre' | 'qr_codigo_nombre';

interface ItemParaQr {
  codigo: string;
  descripcion?: string;
}

const COLS = 3;
const ROWS = 6;
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const LINEAS_POR_FORMATO: Record<FormatoEtiqueta, number> = { qr: 0, qr_codigo: 1, qr_nombre: 2, qr_codigo_nombre: 3 };

// Hoja A4 con varias etiquetas QR por página, para imprimir y pegar en el
// depósito. Todo client-side: qrcode-generator arma el QR, jsPDF arma la hoja
// (y se descarga recién la primera vez que se usa).
export async function generarQRPDF(items: ItemParaQr[], nombreArchivo: string, formato: FormatoEtiqueta = 'qr_codigo') {
  if (!items.length) return;

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const cellW = (PAGE_W - MARGIN * 2) / COLS;
  const cellH = (PAGE_H - MARGIN * 2) / ROWS;
  const lineas = LINEAS_POR_FORMATO[formato] ?? 1;
  const qrSize = Math.min(cellW, cellH - lineas * 3.6 - 4) * 0.75;
  const perPage = COLS * ROWS;

  items.forEach((it, idx) => {
    const posInPage = idx % perPage;
    if (idx > 0 && posInPage === 0) doc.addPage();

    const col = posInPage % COLS;
    const row = Math.floor(posInPage / COLS);
    const cellX = MARGIN + col * cellW;
    const cellY = MARGIN + row * cellH;

    const qr = qrcode(0, 'M');
    qr.addData(it.codigo);
    qr.make();
    const dataUrl = qr.createDataURL(6, 4); // margen de 4 módulos: sin esto, muchos lectores no lo reconocen
    const formatoImg = (dataUrl.match(/^data:image\/(\w+);/)?.[1]?.toUpperCase() || 'PNG') as 'PNG' | 'JPEG';

    const qrX = cellX + (cellW - qrSize) / 2;
    const qrY = cellY + 2;
    doc.addImage(dataUrl, formatoImg, qrX, qrY, qrSize, qrSize);

    let textY = qrY + qrSize + 4;
    doc.setTextColor(30, 30, 30);

    if (formato === 'qr_codigo' || formato === 'qr_codigo_nombre') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(it.codigo, cellX + cellW / 2, textY, { align: 'center' });
      textY += 3.6;
    }
    if (formato === 'qr_nombre' || formato === 'qr_codigo_nombre') {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      const lines = doc.splitTextToSize(it.descripcion || '', cellW - 4).slice(0, 2);
      doc.text(lines, cellX + cellW / 2, textY, { align: 'center' });
    }
  });

  doc.save(nombreArchivo);
}
