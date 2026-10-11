import type { DocInfo } from '../../lib/rotuloPdf';
import type { RotuloCampos, RotuloDesign } from '../../lib/rotuloDesign';
import { Icono } from '@/components/Icono';

interface ProveedorParaPreview {
  nombre: string;
  rubro?: string | null;
  direccion?: string | null;
  localidad?: string | null;
  provincia?: string | null;
  codigo_postal?: string | null;
  horario?: string | null;
}

interface ContactoParaPreview {
  nombre: string;
  cargo?: string | null;
  telefono?: string | null;
  celular?: string | null;
}

interface Props {
  design: RotuloDesign;
  campos: RotuloCampos;
  pie: string;
  empresa: string;
  logo: string;
  proveedor: ProveedorParaPreview;
  contactos: ContactoParaPreview[];
  detalle?: string;
  extra?: string;
  docInfo?: DocInfo;
}

export default function RotuloPreview({ design: rd, campos, pie, empresa, logo, proveedor: p, contactos, detalle = '', extra = '', docInfo = {} }: Props) {
  const { tipoDoc = '', numDoc = '', valorDeclarado = '', bultoN = '', bultoTotal = '' } = docInfo;
  const docLabel = tipoDoc && numDoc ? `${tipoDoc === 'remito' ? 'Remito' : 'Nota de despacho'} N°: ${numDoc}` : '';
  const valorLabel = valorDeclarado ? `Valor declarado: ${valorDeclarado}` : '';
  const bultoLabel = bultoN && bultoTotal ? `Bulto ${bultoN}/${bultoTotal}` : '';
  const hasEnvioInfo = docLabel || valorLabel;
  const fecha = new Date().toLocaleDateString('es-AR');
  const contact = contactos[0];

  const logoNode = logo ? <img src={logo} style={{ height: rd.logoSize, objectFit: 'contain', flexShrink: 0 }} alt={empresa} /> : null;
  const nameNode = rd.empresaPos !== 'hidden' ? (
    <div style={{ fontFamily: rd.empresaFont, fontSize: rd.empresaSize, fontWeight: 'bold', color: rd.empresaColor || '#ffffff', marginLeft: rd.empresaPos === 'right' ? 'auto' : undefined }}>
      {empresa}
    </div>
  ) : null;

  let headerContent;
  if (rd.logoPos === 'center') {
    headerContent = <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' }}>{logoNode}{nameNode}</div>;
  } else if (rd.logoPos === 'right') {
    headerContent = <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>{nameNode}{logoNode}</div>;
  } else {
    headerContent = <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>{logoNode}{nameNode}</div>;
  }

  return (
    <div style={{ border: rd.marcoWidth > 0 ? `${rd.marcoWidth}px solid ${rd.marcoColor}` : 'none', borderRadius: 8, overflow: 'hidden', background: rd.bodyBg, fontFamily: 'Arial,sans-serif' }}>
      <div style={{ background: rd.headerBg, padding: '10px 14px', display: 'flex', alignItems: 'center' }}>{headerContent}</div>
      {rd.barHeight > 0 && <div style={{ height: rd.barHeight, background: rd.barColor }} />}
      <div style={{ padding: 14 }}>
        <div style={{ fontFamily: rd.provFont, fontSize: rd.provSize, fontWeight: 'bold', color: rd.titleColor, textAlign: rd.provAlign, marginBottom: 10 }}>
          {p.nombre || ''}
        </div>
        {campos.direccion && p.direccion && (
          <div style={{ fontSize: 12, color: rd.textColor, marginBottom: 4 }}>
            <strong>Dirección:</strong> {[p.direccion, p.localidad, p.provincia, p.codigo_postal ? 'CP ' + p.codigo_postal : ''].filter(Boolean).join(', ')}
          </div>
        )}
        {campos.horario && p.horario && <div style={{ fontSize: 12, color: rd.textColor, marginBottom: 4 }}><strong>Horario:</strong> {p.horario}</div>}
        {contact && campos.telefono && (contact.telefono || contact.celular) && (
          <div style={{ fontSize: 12, color: rd.textColor, marginBottom: 4 }}>
            <strong>Contacto:</strong> {contact.nombre}{contact.cargo ? ` (${contact.cargo})` : ''}{contact.telefono ? ` — ${contact.telefono}` : ''}{contact.celular ? ` / ${contact.celular}` : ''}
          </div>
        )}
        {hasEnvioInfo && (
          // paddingBottom (no marginBottom en los hijos) para que el espacio hasta
          // la línea de abajo no se pierda por colapso de márgenes entre hermanos —
          // así queda igual al paddingTop de arriba y el texto queda centrado.
          <div style={{ marginTop: 8, paddingTop: 12, paddingBottom: 12, borderTop: '1px solid #ddd', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {docLabel && <div style={{ fontSize: 12, color: rd.textColor }}><strong>{docLabel}</strong></div>}
            {valorLabel && <div style={{ fontSize: 12, color: rd.textColor }}><strong>{valorLabel}</strong></div>}
          </div>
        )}
        {extra && (
          <div style={{ fontSize: 12, fontWeight: 'bold', color: rd.barColor, marginBottom: 4, marginTop: 0 }}><Icono n="alerta" /> {extra}</div>
        )}
        {detalle && (
          <div style={{ marginTop: hasEnvioInfo ? 0 : 8, paddingTop: 12, borderTop: '1px solid #ddd' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', fontWeight: 'bold', marginBottom: 3 }}>Detalle</div>
            <div style={{ fontSize: 12, color: rd.textColor, whiteSpace: 'pre-wrap' }}>{detalle}</div>
          </div>
        )}
        {bultoLabel && (
          <div style={{ fontSize: 11, color: '#999', textAlign: 'right', marginTop: 10 }}>{bultoLabel}</div>
        )}
      </div>
      <div style={{ background: '#f7f9fc', borderTop: '1px solid #ddd', padding: '6px 14px', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#999' }}>
        <span>{pie || empresa}</span>
        <span><Icono n="fecha" /> {fecha}</span>
      </div>
    </div>
  );
}
