import { textoLegibleConBlanco } from '../lib/marca';
import { Button } from '@/components/ui/button';

// Selector de un color de marca. Vacío ('') significa "el color original de la app".
export default function ColorMarca({ etiqueta, valor, original, onChange }: { etiqueta: string; valor: string; original: string; onChange: (v: string) => void }) {
  const efectivo = valor || original;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
      <input
        type="color"
        aria-label={etiqueta}
        value={efectivo}
        onChange={e => onChange(e.target.value)}
        style={{ width: 44, height: 34, padding: 2, border: '1.5px solid var(--border)', borderRadius: 6, background: 'var(--white)', cursor: 'pointer' }}
      />
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{etiqueta}</span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{valor ? efectivo : 'original'}</span>
      {valor && <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>Volver al original</Button>}
      {!textoLegibleConBlanco(efectivo) && (
        <span style={{ width: '100%', fontSize: 12, color: 'var(--danger)' }}>
          Es muy claro: el texto blanco de los encabezados y botones no se leería bien. Elegí uno más oscuro.
        </span>
      )}
    </div>
  );
}
