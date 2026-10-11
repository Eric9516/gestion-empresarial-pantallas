import { clicConTeclado } from '@/lib/clicConTeclado';
import type { RotuloCampos } from '../../lib/rotuloDesign';

const LABELS: Record<keyof RotuloCampos, string> = {
  horario: 'Horario de atención',
  direccion: 'Dirección',
  telefono: 'Teléfono del contacto',
  email: 'Email',
};

interface Props {
  campos: RotuloCampos;
  onChange: (campos: RotuloCampos) => void;
}

export default function RotuloCamposToggles({ campos, onChange }: Props) {
  return (
    <div>
      {(Object.keys(LABELS) as (keyof RotuloCampos)[]).map(k => (
        <div
          key={k}
          className="toggle-wrap"
          style={{ marginBottom: 12 }}
          aria-checked={campos[k]}
          {...clicConTeclado(() => onChange({ ...campos, [k]: !campos[k] }), 'switch')}
        >
          <div className={`toggle${campos[k] ? ' on' : ''}`} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-mid)' }}>{LABELS[k]}</span>
        </div>
      ))}
    </div>
  );
}
