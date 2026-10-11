import Modal from '../../components/Modal';
import { formatoCantidad } from '../../lib/ajustes';
import { useHistorialPorItem, type HistorialItemFila } from '../retiros/useHistorialPorItem';
import { Icono } from '@/components/Icono';

const cuando = (ts: string) => new Date(ts).toLocaleString('es-AR');

function Etiqueta({ h }: { h: HistorialItemFila }) {
  if (h.tipo === 'retiro') return null;
  const suma = h.tipo === 'ajuste_suma';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap', background: suma ? 'var(--success-bg)' : 'var(--danger-bg)', color: suma ? 'var(--success)' : 'var(--danger)' }}>
      Ajuste ({suma ? 'suma' : 'resta'})
    </span>
  );
}

export default function HistorialStockModal({ item, onClose }: { item: { id: string; codigo: string } | null; onClose: () => void }) {
  const { data: historial, isLoading } = useHistorialPorItem(item?.id ?? null);

  return (
    <Modal open={!!item} onClose={onClose} title={<><Icono n="lista" /> Historial de movimientos — {item?.codigo ?? ''}</>}>
      {isLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {!isLoading && !historial?.length && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Todavía no hay movimientos de este repuesto (ni retiros ni ajustes).</p>
      )}
      {!!historial?.length && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
          {historial.map(h => (
            <div key={`${h.tipo}-${h.id}`} style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', fontSize: 13, opacity: h.anulado ? 0.65 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: 700 }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{h.usuarioNombre} <Etiqueta h={h} /></span>
                <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{cuando(h.created_at)}</span>
              </div>
              {h.tipo === 'retiro' ? (
                <div style={{ color: 'var(--text-mid)', marginTop: 3 }}>
                  Cantidad: {h.cantidad}{h.sector ? ` · Sector: ${h.sector}` : ''}
                </div>
              ) : (
                <div style={{ color: 'var(--text-mid)', marginTop: 3 }}>
                  {h.tipo === 'ajuste_suma' ? 'Suma' : 'Resta'} {formatoCantidad(h.cantidad)} · stock {formatoCantidad(h.stockAntes)} → {formatoCantidad(h.stockDespues)}
                </div>
              )}
              {h.observacion && <div style={{ color: 'var(--text-muted)', marginTop: 3 }}>{h.tipo === 'retiro' ? h.observacion : `Motivo: ${h.observacion}`}</div>}
              {h.anulado && (
                <div style={{ color: 'var(--danger)', marginTop: 3, fontWeight: 600 }}>
                  Anulado{h.anuladoAt ? ` el ${cuando(h.anuladoAt)}` : ''}: {h.motivoAnulacion}. El stock volvió a como estaba.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
