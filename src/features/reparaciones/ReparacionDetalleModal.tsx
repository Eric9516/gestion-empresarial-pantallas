import Modal from '../../components/Modal';
import { formatearFechaSola } from '../../lib/fechaHoy';
import EstadoChip from './EstadoChip';
import {
  cantidadDevuelta, estadoLinea, estadoReparacion,
  type ReparacionConDetalle, type ReparacionEntrega, type ReparacionItemConDetalle,
} from './useReparaciones';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';

interface Props {
  reparacion: ReparacionConDetalle | null;
  onClose: () => void;
  onEntrega: (linea: ReparacionItemConDetalle) => void;
  onEditar: (reparacion: ReparacionConDetalle) => void;
  onVerEnvio: (envioId: string) => void;
}

function textoEntrega(e: ReparacionEntrega): string {
  const resultado = e.resultado === 'baja' ? 'Sin arreglo, dada de baja' : 'Reparado';
  const remito = [e.remito_punto_venta, e.remito_numero].filter(Boolean).join('-');
  return `${formatearFechaSola(e.fecha_entrega)} · ${Number(e.cantidad_devuelta)} u. · ${resultado}${remito ? ` · Remito ${remito}` : ''}`;
}

export default function ReparacionDetalleModal({ reparacion, onClose, onEntrega, onEditar, onVerEnvio }: Props) {
  const numeroEnvio = reparacion?.rotulos_generados?.numero_documento;

  const datos: { etiqueta: string; valor: React.ReactNode }[] = reparacion ? [
    { etiqueta: 'Proveedor', valor: reparacion.proveedores?.nombre ?? '—' },
    { etiqueta: 'Motivo', valor: reparacion.motivo },
    { etiqueta: 'Salida', valor: formatearFechaSola(reparacion.fecha_salida) },
    {
      etiqueta: 'Envío',
      valor: reparacion.envio_id && numeroEnvio
        ? (
          <button
            type="button"
            title="Ver los datos del envío"
            onClick={() => onVerEnvio(reparacion.envio_id!)}
            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: 'var(--blue)', textDecoration: 'underline', cursor: 'pointer' }}
          >{numeroEnvio}</button>
        )
        : '—',
    },
    {
      etiqueta: 'Orden de compra',
      valor: reparacion.orden_compra_numero
        ? `${reparacion.orden_compra_numero}${reparacion.orden_compra_fecha ? ` (${formatearFechaSola(reparacion.orden_compra_fecha)})` : ''}`
        : '—',
    },
  ] : [];

  return (
    <Modal
      open={!!reparacion}
      onClose={onClose}
      large
      title={<><span className="accent"><Icono n="herramienta" /></span> Reparación</>}
      footer={
        <>
          {reparacion && <Button variant="ghost" onClick={() => onEditar(reparacion)}><Icono n="editar" /> Editar datos</Button>}
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </>
      }
    >
      {reparacion && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Estado de la reparación</span>
            <EstadoChip estado={estadoReparacion(reparacion)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 14, rowGap: 6, fontSize: 13, marginBottom: 16 }}>
            {datos.map(d => (
              <div key={d.etiqueta} style={{ display: 'contents' }}>
                <span style={{ color: 'var(--text-muted)' }}>{d.etiqueta}</span>
                <strong style={{ fontWeight: 600 }}>{d.valor}</strong>
              </div>
            ))}
          </div>

          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Artículos ({reparacion.reparacion_items.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reparacion.reparacion_items.map(linea => {
              const estado = estadoLinea(linea);
              const entregas = [...linea.reparacion_entregas].sort((a, b) => a.fecha_entrega.localeCompare(b.fecha_entrega));
              return (
                <div key={linea.id} style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0, fontSize: 13 }}>
                      <strong>{linea.items?.codigo}</strong> — {linea.items?.descripcion}
                      <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2 }}>
                        Enviado: {Number(linea.cantidad)} · Devuelto: {cantidadDevuelta(linea)}
                      </div>
                    </div>
                    <EstadoChip estado={estado} />
                  </div>
                  {entregas.length > 0 && (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-mid)' }}>
                      {entregas.map(e => <li key={e.id}>{textoEntrega(e)}</li>)}
                    </ul>
                  )}
                  {estado !== 'cerrada' && (
                    <Button variant="primary" size="sm" style={{ marginTop: 10 }} onClick={() => onEntrega(linea)}>Registrar entrega</Button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}
