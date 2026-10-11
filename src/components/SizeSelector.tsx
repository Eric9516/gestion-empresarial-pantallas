import { SIZE_PRESETS } from '../lib/rotuloSizes';
import { Input } from '@/components/ui/input';

interface Props {
  w: number;
  h: number;
  onChange: (w: number, h: number) => void;
}

// Botonera de tamaños predefinidos + ancho/alto personalizados (cm). La usan
// tanto el editor de diseño del rótulo (Admin) como el modal "Generar rótulo".
export default function SizeSelector({ w, h, onChange }: Props) {
  const activo = SIZE_PRESETS.find(s => s.w === w && s.h === h)?.name;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
        {SIZE_PRESETS.map(s => (
          <button
            key={s.name}
            type="button"
            className={`size-btn${activo === s.name ? ' active' : ''}`}
            onClick={() => onChange(s.w, s.h)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="size-selector-1" style={{ fontSize: 11, marginBottom: 3, display: 'block' }}>Ancho (cm)</label>
          <Input id="size-selector-1"
            type="number" min={5} max={60} step={0.5} value={w}
            onChange={e => onChange(parseFloat(e.target.value) || w, h)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--surface2)', color: 'var(--text)' }}
          />
        </div>
        <div style={{ paddingTop: 18, color: 'var(--text-muted)', fontWeight: 700 }}>×</div>
        <div style={{ flex: 1 }}>
          <label htmlFor="size-selector-2" style={{ fontSize: 11, marginBottom: 3, display: 'block' }}>Alto (cm)</label>
          <Input id="size-selector-2"
            type="number" min={5} max={60} step={0.5} value={h}
            onChange={e => onChange(w, parseFloat(e.target.value) || h)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--surface2)', color: 'var(--text)' }}
          />
        </div>
      </div>
    </div>
  );
}
