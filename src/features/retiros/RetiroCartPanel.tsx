import { useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useSectoresQuery } from '../sectores/useSectores';
import { useStockDeRepuestos } from '../items/useItems';
import { useRetiroCart, type RetiroCartLine } from './RetiroCartContext';
import { stockQueFalta, useConfirmarRetiro } from './useRetiros';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

export default function RetiroCartPanel() {
  const { cart, updateCantidad, updateObservacion, removeItem, clear } = useRetiroCart();
  const { data: sectores } = useSectoresQuery();
  const confirmarRetiro = useConfirmarRetiro();
  const toast = useToast();

  // El stock de cada línea se pide a la base solo para lo que hay en el carrito (no para todo el catálogo).
  const { data: stockPedido } = useStockDeRepuestos(cart.map(c => c.item_id));
  const stockPorId = useMemo(() => stockPedido ?? new Map<string, number | null>(), [stockPedido]);

  const [sectorId, setSectorId] = useState('');
  const [observacionGeneral, setObservacionGeneral] = useState('');
  const [resumenAbierto, setResumenAbierto] = useState(false);
  const [pendiente, setPendiente] = useState<{ sectorId: string; sectorNombre: string; observacionGeneral: string; items: RetiroCartLine[] } | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const sectoresActivos = (sectores ?? []).filter(s => s.activo);

  async function handleRevisar() {
    if (!cart.length) return;
    if (!sectorId) { toast('Elegí el sector antes de confirmar', 'error'); return; }
    // El stock no puede quedar negativo: si alguna línea pide más de lo que hay, se avisa de todas juntas y no se sigue.
    try {
      const faltan = await stockQueFalta(cart);
      if (faltan.length) {
        toast(`No hay stock suficiente: ${faltan.map(f => `${f.codigo} (hay ${f.hay}, pedís ${f.pide})`).join(' · ')}. Si en el depósito hay más unidades, pedí que se ajuste el inventario.`, 'error');
        return;
      }
    } catch (e) {
      toast('No se pudo verificar el stock: ' + mensajeDeError(e), 'error');
      return;
    }
    const sector = sectoresActivos.find(s => s.id === sectorId);
    // Se captura una foto del carrito acá — el paso final usa esto, no vuelve a
    // leer el estado en vivo (evita el bug que tuvimos en la app vieja donde el
    // botón final dependía de que la pantalla siguiera exactamente igual).
    setPendiente({ sectorId, sectorNombre: sector?.nombre ?? '', observacionGeneral, items: cart.map(c => ({ ...c })) });
    setResumenAbierto(true);
  }

  async function handleConfirmar() {
    if (!pendiente) return;
    setConfirmando(true);
    try {
      await confirmarRetiro.mutateAsync({ sectorId: pendiente.sectorId, observacionGeneral: pendiente.observacionGeneral, items: pendiente.items });
      toast('Retiro confirmado', 'success');
      clear();
      setSectorId('');
      setObservacionGeneral('');
      setResumenAbierto(false);
      setPendiente(null);
    } catch (e) {
      toast('Error al confirmar el retiro: ' + mensajeDeError(e), 'error');
    } finally {
      setConfirmando(false);
    }
  }

  if (!cart.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Icono n="carrito" /></div>
        <h2>No tenés nada para retirar todavía</h2>
        <p>Buscá un repuesto y tocá "Retirar".</p>
      </div>
    );
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header"><Icono n="retirar" /> Ítems a retirar</div>
      <div className="admin-card-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {cart.map(c => {
            const stockDisponible = stockPorId.get(c.item_id) ?? null;
            const excedeStock = c.cantidad > (stockDisponible ?? 0);
            return (
              <div key={c.item_id} style={{ padding: 8, background: 'var(--surface2)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{c.codigo}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>{c.descripcion}</div>
                  </div>
                  <Input type="number" min={1} style={{ width: 64 }} value={c.cantidad} onChange={e => updateCantidad(c.item_id, parseInt(e.target.value, 10) || 1)} />
                  <Input type="text" placeholder="Observación..." style={{ width: 150 }} value={c.observacion} onChange={e => updateObservacion(c.item_id, e.target.value)} />
                  <Button variant="dangerGhost" size="icon" title="Quitar" onClick={() => removeItem(c.item_id)}><Icono n="cerrar" /></Button>
                </div>
                {excedeStock && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)' }}>
                    
                    <Icono n="alerta" /> {stockDisponible ? `Solo hay ${stockDisponible} en stock` : 'No hay stock cargado de este repuesto'}: no se puede retirar más. Si en el depósito hay más unidades, pedí que se ajuste el inventario.
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="form-group full" style={{ marginBottom: 12 }}>
          <label htmlFor="retiro-cart-panel-1">Sector *</label>
          <Select id="retiro-cart-panel-1" value={sectorId} onChange={e => setSectorId(e.target.value)}>
            <option value="">Elegir sector...</option>
            {sectoresActivos.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </Select>
        </div>
        <div className="form-group full" style={{ marginBottom: 12 }}>
          <label htmlFor="retiro-cart-panel-2">Observación general (opcional)</label>
          <Input id="retiro-cart-panel-2" type="text" placeholder="Ej: para reparación de la envasadora" value={observacionGeneral} onChange={e => setObservacionGeneral(e.target.value)} />
        </div>
        <Button variant="success" onClick={() => void handleRevisar()}><Icono n="ok" /> Revisar y confirmar</Button>
      </div>

      <Modal
        open={resumenAbierto}
        onClose={() => setResumenAbierto(false)}
        title="Revisá antes de confirmar"
        large
        footer={
          <>
            <Button variant="ghost" onClick={() => setResumenAbierto(false)}>Volver</Button>
            <Button variant="success" onClick={() => void handleConfirmar()} disabled={confirmando}><Icono n="ok" /> Sí, confirmar retiro</Button>
          </>
        }
      >
        {pendiente && (
          <>
            <div className="detail-grid" style={{ marginBottom: 14 }}>
              <div className="detail-item"><label>Sector</label><div className="value">{pendiente.sectorNombre}</div></div>
              {pendiente.observacionGeneral && <div className="detail-item"><label>Observación general</label><div className="value">{pendiente.observacionGeneral}</div></div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendiente.items.map(c => (
                <div key={c.item_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span><strong>{c.codigo}</strong> — {c.descripcion}{c.observacion ? ` (${c.observacion})` : ''}</span>
                  <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>x{c.cantidad}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
