import { useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { formatoCantidad } from '../../lib/ajustes';
import { useVistaDeLista } from '../../lib/useVistaDeLista';
import type { MovimientoFila, TipoDeMovimiento } from './tipos';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';

const cuando = (ts: string) => new Date(ts).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
const dia = (ts: string) => new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const TIPO: Record<TipoDeMovimiento, string> = { carga: 'Carga', ajuste: 'Ajuste', retiro: 'Retiro', reparacion: 'Reparación', mantenimiento: 'Mantenimiento', otro: 'Otro' };

// Lo que acompaña al concepto: sector, motivo, referencia y quién lo hizo.
function aclaracion(m: MovimientoFila): string {
  return [
    m.sector ? `Sector: ${m.sector}` : '',
    m.motivo ? (m.tipo === 'retiro' ? m.motivo : `Motivo: ${m.motivo}`) : '',
    m.referencia ? `Referencia: ${m.referencia}` : '',
    m.usuarioNombre !== '—' ? m.usuarioNombre : '',
  ].filter(Boolean).join(' · ');
}

interface Props {
  filas: MovimientoFila[];
  cargando: boolean;
  error: boolean;
  hayMas: boolean;
  cargandoMas: boolean;
  verMas: () => void;
}

// La ficha del repuesto: fecha, documento, concepto, entrada, salida y lo que quedó en stock después de cada movimiento (las más nuevas arriba).
// Solo dibuja: los datos los trae quien la usa (la app de Vite con Supabase, la de Next desde el servidor).
export default function FichaDeStock({ filas, cargando, error, hayMas, cargandoMas, verMas }: Props) {
  // Si ya se vio todo y el movimiento más viejo con saldo no parte de cero, lo anterior no quedó anotado: se muestra como "Saldo anterior".
  const saldoAnterior = useMemo(() => {
    if (hayMas || !filas.length) return null;
    const masViejo = filas[filas.length - 1];
    if (masViejo.existencia === null) return null;
    const antes = masViejo.existencia - masViejo.entrada + masViejo.salida;
    return antes > 0 ? antes : null;
  }, [filas, hayMas]);

  const vista = useVistaDeLista();
  const [completo, setCompleto] = useState(false);
  const verAnteriores = hayMas && (
    <div style={{ textAlign: 'center', marginTop: 10 }}>
      <Button variant="ghost" size="sm" disabled={cargandoMas} onClick={verMas}>{cargandoMas ? 'Cargando...' : 'Ver movimientos anteriores'}</Button>
    </div>
  );
  // El celular: una fila corta por movimiento (fecha, qué fue, cuánto, cómo quedó), como una planilla; el detalle, en "Ver historial completo"
  if (vista === 'tarjetas') {
    return (
      <>
        {cargando && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
        {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>No se pudo cargar el historial.</p>}
        {!cargando && !error && !filas.length && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Todavía no hay movimientos de este artículo (ni retiros, ni cargas, ni ajustes).</p>
        )}
        {!!filas.length && (
          <>
            <table className="ficha-corta" aria-label="Movimientos">
              <thead><tr><th>Fecha</th><th>Movimiento</th><th>Cant.</th><th>Stock</th></tr></thead>
              <tbody>
                {filas.map(m => (
                  <tr key={m.id}>
                    <td>{dia(m.created_at)}</td>
                    <td>{TIPO[m.tipo] ?? m.detalle}</td>
                    <td style={{ color: m.entrada > 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {m.entrada > 0 ? `+${formatoCantidad(m.entrada)}` : m.salida > 0 ? `-${formatoCantidad(m.salida)}` : ''}
                    </td>
                    <td>{m.existencia === null ? '—' : formatoCantidad(m.existencia)}</td>
                  </tr>
                ))}
                {saldoAnterior !== null && (
                  <tr style={{ color: 'var(--text-muted)' }}><td colSpan={3}>Saldo anterior</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{formatoCantidad(saldoAnterior)}</td></tr>
                )}
              </tbody>
            </table>
            {verAnteriores}
            <div style={{ marginTop: 10 }}>
              <Button variant="ghost" size="full" onClick={() => setCompleto(true)}><Icono n="tabla" /> Ver historial completo</Button>
            </div>
            <Modal open={completo} onClose={() => setCompleto(false)} large title={<><Icono n="tabla" /> Historial completo</>}>
              <TablaDeMovimientos filas={filas} saldoAnterior={saldoAnterior} fijarFecha />
              {verAnteriores}
            </Modal>
          </>
        )}
      </>
    );
  }

  return (
    <>
      {cargando && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>No se pudo cargar el historial.</p>}
      {!cargando && !error && !filas.length && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Todavía no hay movimientos de este artículo (ni retiros, ni cargas, ni ajustes).</p>
      )}
      {!!filas.length && (
        <>
          <TablaDeMovimientos filas={filas} saldoAnterior={saldoAnterior} />
          {verAnteriores}
        </>
      )}
    </>
  );
}

// La planilla completa: fecha, documento, concepto (con sector, motivo, referencia y quién), entrada, salida y existencia. En el celular se
// desliza de costado con la fecha fija a la izquierda.
function TablaDeMovimientos({ filas, saldoAnterior, fijarFecha = false }: { filas: MovimientoFila[]; saldoAnterior: number | null; fijarFecha?: boolean }) {
  const fija = fijarFecha ? 'columna-fija' : undefined;
  return (
    <div className="table-wrap" style={{ display: 'block', maxHeight: fijarFecha ? '70vh' : 460, overflow: 'auto' }}>
      <table>
        <thead>
          <tr><th className={fija}>Fecha</th><th>Documento</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Entrada</th><th style={{ textAlign: 'right' }}>Salida</th><th style={{ textAlign: 'right' }}>Existencia</th></tr>
        </thead>
        <tbody>
          {filas.map(m => (
            <tr key={m.id}>
              <td className={fija} style={{ whiteSpace: 'nowrap' }}>{cuando(m.created_at)}</td>
              <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{m.comprobante ?? '—'}</td>
              <td style={fijarFecha ? { minWidth: 220 } : undefined}>
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
              <td colSpan={2} className={fija}>Antes de empezar a llevar la ficha</td>
              <td>Saldo anterior</td>
              <td /><td />
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatoCantidad(saldoAnterior)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
