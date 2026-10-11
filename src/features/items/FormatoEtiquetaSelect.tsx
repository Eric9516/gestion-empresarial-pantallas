import type { FormatoEtiqueta } from '../../lib/generarQrPdf';
import { Select } from '@/components/ui/select';

interface Props {
  value: FormatoEtiqueta;
  onChange: (formato: FormatoEtiqueta) => void;
}

// Mismas 4 opciones en los dos lugares que generan etiquetas QR: el generador
// masivo de Admin y la descarga rápida desde el detalle de un repuesto.
export default function FormatoEtiquetaSelect({ value, onChange }: Props) {
  return (
    <div className="form-group full" style={{ marginBottom: 12 }}>
      <label htmlFor="formato-etiqueta-select-1">Formato de etiqueta</label>
      <Select id="formato-etiqueta-select-1" value={value} onChange={e => onChange(e.target.value as FormatoEtiqueta)}>
        <option value="qr">Solo QR</option>
        <option value="qr_codigo">QR + Código</option>
        <option value="qr_nombre">QR + Descripción</option>
        <option value="qr_codigo_nombre">QR + Código + Descripción</option>
      </Select>
    </div>
  );
}
