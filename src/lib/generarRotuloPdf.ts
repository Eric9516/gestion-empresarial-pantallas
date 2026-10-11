import { DEFAULT_CAMPOS, DEFAULT_DESIGN, type RotuloCampos, type RotuloDesign } from './rotuloDesign';
import { buildPDF } from './rotuloPdf';
import { NOMBRE_EMPRESA_POR_DEFECTO } from './empresa';

// Lo que se guarda en items generados "de acá en adelante" en vez de subir
// un PDF a Storage: el diseño tal cual estaba en el momento de crearlo, para
// poder rearmar el PDF idéntico más tarde sin depender de la configuración
// actual (que puede haber cambiado).
export interface RotuloSnapshot {
  design: RotuloDesign;
  campos: RotuloCampos;
  pie: string;
  empresa: string;
  logo: string;
}

interface ProveedorParaPdf {
  nombre: string;
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

interface RotuloParaRegenerar {
  design_snapshot: unknown;
  created_at: string;
  tipo_documento: string | null;
  numero_documento: string | null;
  valor_declarado: string | null;
  bulto_total: number | null;
  extra: string | null;
  ancho_mm: number | null;
  alto_mm: number | null;
}

interface BultoParaRegenerar {
  numero: number;
  detalle: string | null;
}

// Arma el PDF en el momento (jsPDF, en el navegador) a partir del snapshot
// guardado — nunca hace falta haberlo tenido guardado en Storage. jsPDF es
// pesada: se descarga recién la primera vez que se genera un PDF.
export async function generarRotuloBlob(
  rotulo: RotuloParaRegenerar,
  bulto: BultoParaRegenerar,
  proveedor: ProveedorParaPdf,
  contactos: ContactoParaPdf[],
): Promise<Blob> {
  return generarRotuloGrupoBlob(rotulo, [bulto], proveedor, contactos);
}

// Mismo PDF de arriba, pero con todos los bultos juntos en un solo archivo
// (una página por bulto) — para imprimir un envío de varios bultos de una
// sola vez en vez de abrir el PDF de a uno.
export async function generarRotuloGrupoBlob(
  rotulo: RotuloParaRegenerar,
  bultos: BultoParaRegenerar[],
  proveedor: ProveedorParaPdf,
  contactos: ContactoParaPdf[],
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const snap = rotulo.design_snapshot as RotuloSnapshot | null;
  const rd = snap?.design ?? DEFAULT_DESIGN;
  const campos = snap?.campos ?? DEFAULT_CAMPOS;
  const pie = snap?.pie ?? '';
  const empresa = snap?.empresa ?? NOMBRE_EMPRESA_POR_DEFECTO;
  const logo = snap?.logo ?? '';
  const w = rotulo.ancho_mm || 100;
  const h = rotulo.alto_mm || 150;
  const bultoTotal = rotulo.bulto_total ?? 1;
  const fecha = new Date(rotulo.created_at).toLocaleDateString('es-AR');
  const orientacion = w > h ? 'landscape' : 'portrait';

  const doc = new jsPDF({ orientation: orientacion, unit: 'mm', format: [w, h] });
  bultos.forEach((bulto, i) => {
    if (i > 0) doc.addPage([w, h], orientacion);
    buildPDF(doc, proveedor, rd, contactos, campos, bulto.detalle || '', rotulo.extra || '', pie, empresa, logo, fecha, w, h, {
      tipoDoc: rotulo.tipo_documento || '',
      numDoc: rotulo.numero_documento || '',
      valorDeclarado: rotulo.valor_declarado || '',
      bultoN: bultoTotal > 1 ? String(bulto.numero) : '',
      bultoTotal: bultoTotal > 1 ? String(bultoTotal) : '',
    });
  });
  return doc.output('blob');
}
