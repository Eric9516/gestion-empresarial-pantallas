import { useMemo } from 'react';
import Modal from '../../components/Modal';
import { formatoCantidad } from '../../lib/ajustes';
import { useFichaDeStock, type MovimientoFila } from './useFichaDeStock';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';

const cuando = (ts: string) => new Date(ts).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

// Lo que acompaña al concepto: sector, motivo, referencia y quién lo hizo.
function aclaracion(m: MovimientoFila): string {
  return [
    m.sector ? `Sector: ${m.sector}` : '',
    m.motivo ? (m.tipo === 'retiro' ? m.motivo : `Motivo: ${m.motivo}`) : '',
    m.referencia ? `Referencia: ${m.referencia}` : '',
    m.usuarioNombre !== '—' ? m.usuarioNombre : '',
  ].filter(Boolean).join(' · ');
}

// La ficha del repuesto: fecha, documento, concepto, entrada, salida y lo que quedó en stock después de cada movimiento (las más nuevas arriba).
export default function HistorialStockModal({ item, onClose }: { item: { id: string; codigo: string } | null; onClose: () => void }) {
  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage } = useFichaDeStock(item?.id ?? null);
  const filas = useMemo(() => data?.pages.flat() ?? [], [data]);

  // Si ya se vio todo y el movimiento más viejo con saldo no parte de cero, lo anterior no quedó anotado: se muestra como "Saldo anterior".
  const saldoAnterior = useMemo(() => {
    if (hasNextPage || !filas.length) return null;
    const masViejo = filas[filas.length - 1];
    if (masViejo.existencia === null) return null;
    const antes = masViejo.existencia - masViejo.entrada + masViejo.salida;
    return antes > 0 ? antes : null;
  }, [filas, hasNextPage]);

  return (
    <Modal open={!!item} onClose={onClose} large title={<><Icono n="lista" /> Historial de movimientos — {item?.codigo ?? ''}</>}>
      {isLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {isError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>No se pudo cargar el historial.</p>}
      {!isLoading && !isError && !filas.length && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Todavía no hay movimientos de este repuesto (ni retiros, ni cargas, ni ajustes).</p>
      )}
      {!!filas.length && (
        <>
          <div className="table-wrap" style={{ display: 'block', maxHeight: 460, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr><th>Fecha</th><th>Documento</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Entrada</th><th style={{ textAlign: 'right' }}>Salida</th><th style={{ textAlign: 'right' }}>Existencia</th></tr>
              </thead>
              <tbody>
                {filas.map(m => (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{cuando(m.created_at)}</td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{m.comprobante ?? '—'}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{m.detalle}</div>
                      {aclaracion(m) && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{aclaracion(m)}</div>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>{m.entrada > 0 ? formatoCantidad(m.entrada) : ''}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>{m.salida > 0 ? formatoCantidad(m.salida) : ''}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{m.existencia === null ? '—' : formatoCantidad(m.existencia)}</td>
                  </tr>
                ))}
                {saldoAnterior !== null && (
                  <tr style={{ color: 'var(--text-muted)' }}>
                    <td colSpan={2}>Antes de empezar a llevar la ficha</td>
                    <td>Saldo anterior</td>
                    <td /><td />
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatoCantidad(saldoAnterior)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {hasNextPage && (
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <Button variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>{isFetchingNextPage ? 'Cargando...' : 'Ver movimientos anteriores'}</Button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
