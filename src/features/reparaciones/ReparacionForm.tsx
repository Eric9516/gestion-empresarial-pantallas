import { useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { useRepuestosParaElegir } from '../items/useItems';
import { useProveedoresQuery } from '../proveedores/useProveedores';
import { enviosDelProveedor, enviosLibres, etiquetaDeEnvio } from '../rotulos/etiquetaEnvio';
import { useDetallesDeEnviosQuery, useRotulosQuery } from '../rotulos/useRotulos';
import { useCrearReparacion, useEnviosAsignadosQuery } from './useReparaciones';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

interface LineaNueva {
  item_id: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  descuentaStock: boolean;
}

export default function ReparacionForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: proveedores } = useProveedoresQuery();
  const { data: envios } = useRotulosQuery();
  const crear = useCrearReparacion();
  const toast = useToast();

  const [proveedorId, setProveedorId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [fechaSalida, setFechaSalida] = useState(fechaHoyISO);
  const [envioId, setEnvioId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [lineas, setLineas] = useState<LineaNueva[]>([]);

  // Solo los envíos del proveedor elegido que no tengan ya otra reparación, con lo que lleva cada uno para reconocerlos.
  const { data: asignados } = useEnviosAsignadosQuery();
  const enviosDelProv = useMemo(() => enviosDelProveedor(envios, proveedorId), [envios, proveedorId]);
  const enviosLibresDelProv = useMemo(() => enviosLibres(enviosDelProv, asignados), [enviosDelProv, asignados]);
  const { data: detallesDeEnvios } = useDetallesDeEnviosQuery(enviosLibresDelProv.map(e => e.id));

  const resultados = useRepuestosParaElegir(busqueda);

  function handleClose() {
    setProveedorId('');
    setMotivo('');
    setFechaSalida(fechaHoyISO());
    setEnvioId('');
    setBusqueda('');
    setLineas([]);
    onClose();
  }

  function agregarLinea(it: { id: string; codigo: string; descripcion: string }) {
    if (lineas.some(l => l.item_id === it.id)) { toast('Ese artículo ya está agregado', 'error'); return; }
    setLineas(prev => [...prev, { item_id: it.id, codigo: it.codigo, descripcion: it.descripcion, cantidad: 1, descuentaStock: true }]);
    setBusqueda('');
  }

  function actualizarCantidad(itemId: string, value: string) {
    const n = parseInt(value, 10);
    setLineas(prev => prev.map(l => (l.item_id === itemId ? { ...l, cantidad: n > 0 ? n : 1 } : l)));
  }

  function actualizarDescuentaStock(itemId: string, value: boolean) {
    setLineas(prev => prev.map(l => (l.item_id === itemId ? { ...l, descuentaStock: value } : l)));
  }

  function quitarLinea(itemId: string) {
    setLineas(prev => prev.filter(l => l.item_id !== itemId));
  }

  async function handleGuardar() {
    if (!proveedorId) { toast('Elegí un proveedor', 'error'); return; }
    if (!motivo.trim()) { toast('Ingresá un motivo', 'error'); return; }
    if (!lineas.length) { toast('Agregá al menos un artículo', 'error'); return; }
    try {
      await crear.mutateAsync({
        proveedor_id: proveedorId,
        motivo: motivo.trim(),
        fecha_salida: fechaSalida,
        envio_id: envioId || null,
        items: lineas.map(l => ({ item_id: l.item_id, cantidad: l.cantidad, descuenta_stock: l.descuentaStock })),
      });
      toast('Reparación cargada', 'success');
      handleClose();
    } catch (err) {
      await registrarErrorAccion('Error al crear una reparación', err);
      toast('Error al guardar la reparación: ' + mensajeDeError(err), 'error');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      large
      title={<><Icono n="herramienta" /> Nueva reparación</>}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
          <Button variant="success" disabled={crear.isPending} onClick={() => void handleGuardar()}>
            {crear.isPending ? 'Guardando...' : 'Guardar reparación'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="reparacion-form-1">Proveedor (taller)</label>
          <Select id="reparacion-form-1" value={proveedorId} onChange={e => { setProveedorId(e.target.value); setEnvioId(''); }}>
            <option value="">Elegí un proveedor...</option>
            {proveedores?.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </Select>
        </div>
        <div className="form-group">
          <label htmlFor="reparacion-form-2">Motivo</label>
          <Input id="reparacion-form-2" type="text" placeholder="Ej: bobinado quemado, rodamientos..." value={motivo} onChange={e => setMotivo(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="reparacion-form-3">Fecha de salida</label>
          <Input id="reparacion-form-3" type="date" value={fechaSalida} onChange={e => setFechaSalida(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="reparacion-form-4">Envío / nota de despacho (opcional)</label>
          <Select id="reparacion-form-4" value={envioId} disabled={!proveedorId} onChange={e => setEnvioId(e.target.value)}>
            <option value="">{!proveedorId ? '— Elegí primero un proveedor —' : enviosLibresDelProv.length ? '— No tiene remito de salida —' : enviosDelProv.length ? '— Todas sus notas ya están asignadas a otra reparación —' : '— Este proveedor no tiene envíos cargados —'}</option>
            {enviosLibresDelProv.map(e => <option key={e.id} value={e.id}>{etiquetaDeEnvio(e, detallesDeEnvios?.get(e.id))}</option>)}
          </Select>
        </div>
      </div>

      <div className="form-group full" style={{ marginTop: 12, marginBottom: 8 }}>
        <label htmlFor="reparacion-form-5">Artículos enviados</label>
        <Input id="reparacion-form-5" type="text" placeholder="Buscar código o descripción para agregar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>
      {busqueda.trim() && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {resultados.length ? resultados.map(it => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: 13, minWidth: 0 }}><strong>{it.codigo}</strong> — {it.descripcion}</span>
              <Button variant="primary" size="sm" style={{ flexShrink: 0 }} onClick={() => agregarLinea(it)}><Icono n="mas" /> Agregar</Button>
            </div>
          )) : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin resultados</p>}
        </div>
      )}

      {!lineas.length && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Todavía no agregaste ningún artículo.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lineas.map(l => (
          <div key={l.item_id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ flex: 1, minWidth: 160, fontSize: 13 }}><strong>{l.codigo}</strong> — {l.descripcion}</div>
            <label htmlFor={`cantidad-${l.item_id}`} style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cantidad:</label>
            <Input id={`cantidad-${l.item_id}`} type="number" min={1} style={{ width: 64 }} value={l.cantidad} onChange={e => actualizarCantidad(l.item_id, e.target.value)} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-mid)', cursor: 'pointer' }} title="Destildalo si ya se descontó antes, por ejemplo con un retiro">
              <input type="checkbox" checked={l.descuentaStock} onChange={e => actualizarDescuentaStock(l.item_id, e.target.checked)} />
              Descontar del stock
            </label>
            <Button variant="dangerGhost" size="icon" title="Quitar" onClick={() => quitarLinea(l.item_id)}><Icono n="cerrar" /></Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
