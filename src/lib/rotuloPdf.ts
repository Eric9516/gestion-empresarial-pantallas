import type { jsPDF } from 'jspdf';
import type { RotuloCampos, RotuloDesign } from './rotuloDesign';

interface ProveedorParaPdf {
  nombre: string;
  rubro?: string | null;
  direccion?: string | null;
  localidad?: string | null;
  provincia?: string | null;
  codigo_postal?: string | null;
  horario?: string | null;
}

interface ContactoParaPdf {
  nombre: string;
  cargo?: string | null;
  telefono?: string | null;
  celular?: string | null;
}

export interface DocInfo {
  tipoDoc?: string;
  numDoc?: string;
  valorDeclarado?: string;
  bultoN?: string;
  bultoTotal?: string;
}

function hexRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// Dibuja el rótulo dentro de un documento jsPDF ya creado. Sin dependencias del DOM.
export function buildPDF(
  doc: jsPDF, p: ProveedorParaPdf, rd: RotuloDesign, pContacts: ContactoParaPdf[], campos: RotuloCampos,
  detalle: string, extra: string, pie: string, empresa: string, logo: string, fecha: string,
  w: number, h: number, docInfo: DocInfo = {}
) {
  const isSmall = w <= 110 && h <= 80;
  const margin = isSmall ? 4 : 14;
  const contentW = w - margin * 2;
  let y = 0;

  const headerH = isSmall ? 12 : 18;
  const [hr, hg, hb] = hexRgb(rd.headerBg);
  doc.setFillColor(hr, hg, hb);
  doc.rect(0, 0, w, headerH, 'F');

  if (logo) {
    try {
      const imgH = isSmall ? 8 : rd.logoSize / 4;
      const imgW = imgH * 2;
      let lx = margin;
      if (rd.logoPos === 'center') lx = (w - imgW) / 2;
      if (rd.logoPos === 'right') lx = w - margin - imgW;
      doc.addImage(logo, 'PNG', lx, isSmall ? 2 : (headerH - imgH) / 2, imgW, imgH);
    } catch {
      // Un logo corrupto o en un formato no soportado no debería tirar abajo el PDF entero.
    }
  }

  if (rd.empresaPos !== 'hidden') {
    const [ecr, ecg, ecb] = hexRgb(rd.empresaColor || '#ffffff');
    doc.setTextColor(ecr, ecg, ecb);
    doc.setFontSize(isSmall ? 7 : rd.empresaSize * 0.75);
    doc.setFont('helvetica', 'bold');
    const nx = rd.empresaPos === 'center' ? w / 2 : (rd.empresaPos === 'right' ? w - margin : (logo ? margin + (isSmall ? 16 : rd.logoSize / 2 + 4) : margin));
    const align = rd.empresaPos === 'center' ? 'center' : (rd.empresaPos === 'right' ? 'right' : 'left');
    doc.text(empresa, nx, headerH / 2 + 2, { align });
  }

  if (rd.barHeight > 0) {
    const [br, bg, bb] = hexRgb(rd.barColor);
    doc.setFillColor(br, bg, bb);
    doc.rect(0, headerH, w, isSmall ? 1.5 : rd.barHeight * 0.4, 'F');
    y = headerH + (isSmall ? 1.5 : rd.barHeight * 0.4);
  } else {
    y = headerH;
  }
  y += isSmall ? 4 : 8;

  const [tr, tg, tb] = hexRgb(rd.titleColor);
  doc.setTextColor(tr, tg, tb);
  doc.setFontSize(isSmall ? 9 : rd.provSize * 0.7);
  doc.setFont('helvetica', 'bold');
  const provX = rd.provAlign === 'center' ? w / 2 : (rd.provAlign === 'right' ? w - margin : margin);
  doc.text(p.nombre, provX, y, { align: rd.provAlign });
  y += isSmall ? 5 : 8;

  const lineH = isSmall ? 4 : 6;
  const [txr, txg, txb] = hexRgb(rd.textColor);
  doc.setFontSize(isSmall ? 7 : 10);

  const addLine = (label: string, value: string) => {
    if (!value) return;
    doc.setTextColor(100, 100, 100); doc.setFont('helvetica', 'bold');
    const labelText = label + ':';
    doc.text(labelText, margin, y);
    const valueX = margin + Math.max(22, doc.getTextWidth(labelText) + 3);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(txr, txg, txb);
    const lines = doc.splitTextToSize(value, w - margin - valueX);
    doc.text(lines, valueX, y);
    y += lineH * lines.length;
  };

  if (campos.direccion && p.direccion) addLine('Dirección', [p.direccion, p.localidad, p.provincia, p.codigo_postal ? 'CP ' + p.codigo_postal : ''].filter(Boolean).join(', '));
  if (campos.horario && p.horario) addLine('Horario', p.horario);

  const contact = pContacts[0];
  if (contact && campos.telefono && (contact.telefono || contact.celular)) {
    addLine('Contacto', `${contact.nombre}${contact.cargo ? ' (' + contact.cargo + ')' : ''}${contact.telefono ? ' — ' + contact.telefono : ''}${contact.celular ? ' / ' + contact.celular : ''}`);
  }

  const { tipoDoc = '', numDoc = '', valorDeclarado = '', bultoN = '', bultoTotal = '' } = docInfo;
  const hasEnvioInfo = (tipoDoc && numDoc) || valorDeclarado;
  if (hasEnvioInfo) {
    y += 2;
    doc.setDrawColor(200, 200, 200); doc.line(margin, y, w - margin, y); y += isSmall ? 4 : 6;
    doc.setFontSize(isSmall ? 7 : 10);
  }
  if (tipoDoc && numDoc) addLine(tipoDoc === 'remito' ? 'Remito N°' : 'Nota de despacho N°', numDoc);
  if (valorDeclarado) addLine('Valor declarado', valorDeclarado);

  if (extra) {
    const [br, bg, bb] = hexRgb(rd.barColor);
    doc.setTextColor(br, bg, bb); doc.setFont('helvetica', 'bold');
    doc.text('! ' + extra, margin, y); y += lineH;
  }

  if (detalle) {
    // Sin el "y += 2" extra de acá: así el espacio entre el texto de arriba y
    // esta línea queda igual al espacio entre la línea de arriba y su texto
    // (el mismo lineH), y el bloque de en medio queda centrado.
    doc.setDrawColor(200, 200, 200); doc.line(margin, y, w - margin, y); y += isSmall ? 4 : 6;
    doc.setTextColor(120, 120, 120); doc.setFontSize(isSmall ? 6 : 8); doc.setFont('helvetica', 'bold');
    doc.text('DETALLE:', margin, y); y += lineH - 1;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(txr, txg, txb); doc.setFontSize(isSmall ? 7 : 10);
    const lines = doc.splitTextToSize(detalle, contentW);
    doc.text(lines, margin, y);
  }

  const footerH = isSmall ? 7 : 10;

  // "Bulto: N/Total" va discreto en la esquina inferior derecha del cuerpo,
  // separado del resto de los datos del envío (no es información del
  // remito, es la numeración física de ESTE bulto entre todos los del envío).
  if (bultoN && bultoTotal) {
    doc.setTextColor(150, 150, 150); doc.setFont('helvetica', 'normal'); doc.setFontSize(isSmall ? 6 : 9);
    doc.text(`Bulto ${bultoN}/${bultoTotal}`, w - margin, h - footerH - 3, { align: 'right' });
  }

  doc.setFillColor(247, 249, 252); doc.rect(0, h - footerH, w, footerH, 'F');
  doc.setDrawColor(221, 227, 236); doc.line(0, h - footerH, w, h - footerH);
  doc.setTextColor(150, 150, 150); doc.setFontSize(isSmall ? 5 : 8); doc.setFont('helvetica', 'normal');
  doc.text(pie || empresa, margin, h - footerH + (isSmall ? 4.5 : 7));
  doc.text(fecha, w - margin, h - footerH + (isSmall ? 4.5 : 7), { align: 'right' });

  if (rd.marcoWidth > 0) {
    const [mr, mg, mb] = hexRgb(rd.marcoColor);
    doc.setDrawColor(mr, mg, mb); doc.setLineWidth(rd.marcoWidth * 0.3);
    doc.rect(rd.marcoWidth * 0.15, rd.marcoWidth * 0.15, w - rd.marcoWidth * 0.3, h - rd.marcoWidth * 0.3);
  }
}
