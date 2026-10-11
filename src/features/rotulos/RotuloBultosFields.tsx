

import { Textarea } from '@/components/ui/textarea';

interface Props {
  detalles: string[];
  onChange: (detalles: string[]) => void;
}

// Un textarea de descripción por bulto — la cantidad la controla el padre (ver
// "¿Cuántos bultos tiene este envío?" en RotuloForm).
export default function RotuloBultosFields({ detalles, onChange }: Props) {
  function setLinea(i: number, value: string) {
    onChange(detalles.map((d, idx) => (idx === i ? value : d)));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {detalles.map((d, i) => (
        <div className="form-group" style={{ marginBottom: 0 }} key={i}>
          <label htmlFor={`bulto-detalle-${i}`}>{detalles.length > 1 ? `Descripción — Bulto ${i + 1} de ${detalles.length}` : 'Detalle / Descripción'}</label>
          <Textarea
            id={`bulto-detalle-${i}`}
            placeholder="Ej: Motor eléctrico para reparación — N° interno 0452"
            rows={3}
            value={d}
            onChange={e => setLinea(i, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
