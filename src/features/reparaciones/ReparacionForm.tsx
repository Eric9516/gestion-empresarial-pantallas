import { useMemo, useRef, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { useRepuestosQueCoinciden } from '../items/useRepuestosQueCoinciden';
import { enviosDelProveedor, enviosLibres, etiquetaDeEnvio } from '../rotulos/etiquetaEnvio';
import { useServicioDeReparaciones } from './servicioDeReparaciones';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

// Un repuesto del depósito o, sin item_id, algo que no está en el depósito (una máquina de la planta): se describe con un texto y no mueve stock.
interface LineaNueva {
  clave: string;
  item_id: string | null;
  codigo: string | null;
  descripcion: string;
  cantidad: number;
  descuentaStock: boolean;
}

export default function ReparacionForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const servicio = useServicioDeReparaciones();
  const { proveedores, envios } = servicio;
  const [guardando, setGuardando] = useState(false);
  const toast = useToast();

  const [proveedorId, setProveedorId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [fechaSalida, setFechaSalida] = useState(fechaHoyISO);
  const [envioId, setEnvioId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [lineas, setLineas] = useState<LineaNueva[]>([]);
  const libres = useRef(0);

  // Solo los envíos del proveedor elegido que no tengan ya otra reparación, con lo que lleva cada uno para reconocerlos.
  const asignados = servicio.enviosAsignados;
  const enviosDelProv = useMemo(() => enviosDelProveedor(envios, proveedorId), [envios, proveedorId]);
  const enviosLibresDelProv = useMemo(() => enviosLibres(enviosDelProv, asignados), [enviosDelProv, asignados]);
  const detallesDeEnvios = servicio.detallesDeEnvios;

  const resultados = useRepuestosQueCoinciden(busqueda, servicio.buscarRepuestos);

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
    setLineas(prev => [...prev, { clave: it.id, item_id: it.id, codigo: it.codigo, descripcion: it.descripcion, cantidad: 1, descuentaStock: true }]);
    setBusqueda('');
  }

  function agregarLineaLibre() {
    libres.current += 1;
    setLineas(prev => [...prev, { clave: `libre-${libres.current}`, item_id: null, codigo: null, descripcion: '', cantidad: 1, descuentaStock: false }]);
  }

  function cambiarLinea(clave: string, cambio: Partial<LineaNueva>) {
    setLineas(prev => prev.map(l => (l.clave === clave ? { ...l, ...cambio } : l)));
  }

  function actualizarCantidad(clave: string, value: string) {
    const n = parseInt(value, 10);
    cambiarLinea(clave, { cantidad: n > 0 ? n : 1 });
  }

  function quitarLinea(clave: string) {
    setLineas(prev => prev.filter(l => l.clave !== clave));
  }

  async function handleGuardar() {
    if (!proveedorId) { toast('Elegí un proveedor', 'error'); return; }
    if (!motivo.trim()) { toast('Ingresá un motivo', 'error'); return; }
    if (!lineas.length) { toast('Agregá al menos un artículo', 'error'); return; }
    if (lineas.some(l => !l.item_id && !l.descripcion.trim())) { toast('Escribí qué se envía en las líneas que no son del depósito', 'error'); return; }
    setGuardando(true);
    try {
      await servicio.crear({
        proveedor_id: proveedorId,
        motivo: motivo.trim(),
        fecha_salida: fechaSalida,
        envio_id: envioId || null,
        items: lineas.map(l => l.item_id
          ? { item_id: l.item_id, cantidad: l.cantidad, descuenta_stock: l.descuentaStock }
          : { item_id: null, descripcion: l.descripcion.trim(), cantidad: l.cantidad, descuenta_stock: false }),
      });
      toast('Reparación cargada', 'success');
      handleClose();
    } catch (err) {
      await servicio.registrarError('Error al crear una reparación', err);
      toast('Error al guardar la reparación: ' + mensajeDeError(err), 'error');
    } finally {
      setGuardando(false);
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
          <Button variant="success" disabled={guardando} onClick={() => void handleGuardar()}>
            {guardando ? 'Guardando...' : 'Guardar reparación'}
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
      <div style={{ marginBottom: 12 }}>
        <Button variant="ghost" size="sm" onClick={agregarLineaLibre} title="Una máquina o algo de la planta que no tenés cargado en el depósito: se describe con un texto y no mueve stock">
          <Icono n="mas" /> Agregar algo que no está en el depósito
        </Button>
      </div>

      {!lineas.length && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Todavía no agregaste ningún artículo.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lineas.map(l => (
          <div key={l.clave} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)' }}>
            {l.item_id ? (
              <div style={{ flex: 1, minWidth: 160, fontSize: 13 }}><strong>{l.codigo}</strong> — {l.descripcion}</div>
            ) : (
              <Input aria-label="Qué se envía" autoFocus maxLength={300} style={{ flex: 1, minWidth: 200 }} value={l.descripcion}
                placeholder="Ej: impresora de etiquetas Honeywell PD45, cámara de expedición" onChange={e => cambiarLinea(l.clave, { descripcion: e.target.value })} />
            )}
            <label htmlFor={`cantidad-${l.clave}`} style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cantidad:</label>
            <Input id={`cantidad-${l.clave}`} type="number" min={1} style={{ width: 64 }} value={l.cantidad} onChange={e => actualizarCantidad(l.clave, e.target.value)} />
            {l.item_id ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-mid)', cursor: 'pointer' }} title="Destildalo si ya se descontó antes, por ejemplo con un retiro">
                <input type="checkbox" checked={l.descuentaStock} onChange={e => cambiarLinea(l.clave, { descuentaStock: e.target.checked })} />
                Descontar del stock
              </label>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No está en el depósito: no mueve stock</span>
            )}
            <Button variant="dangerGhost" size="icon" title="Quitar" onClick={() => quitarLinea(l.clave)}><Icono n="cerrar" /></Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
