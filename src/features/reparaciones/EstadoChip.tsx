import type { EstadoLinea } from './useReparaciones';

const COLOR_ESTADO: Record<EstadoLinea, { bg: string; fg: string; label: string }> = {
  pendiente: { bg: '#fbf1de', fg: '#7a5408', label: 'Pendiente' },
  parcial: { bg: '#eaf0fb', fg: 'var(--blue)', label: 'Parcial' },
  cerrada: { bg: 'var(--success-bg)', fg: 'var(--success)', label: 'Cerrada' },
};

export default function EstadoChip({ estado }: { estado: EstadoLinea }) {
  const c = COLOR_ESTADO[estado];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: c.bg, color: c.fg, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  );
}
