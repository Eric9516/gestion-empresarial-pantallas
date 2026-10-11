import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { useProveedoresQuery } from '../proveedores/useProveedores';
import { useRotulosQuery } from '../rotulos/useRotulos';
import { useEditarReparacion, type ReparacionConDetalle } from './useReparaciones';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

interface Props {
  reparacion: ReparacionConDetalle | null;
  onClose: () => void;
}

export default function EditarReparacionModal({ reparacion, onClose }: Props) {
  const { data: proveedores } = useProveedoresQuery();
  const { data: envios } = useRotulosQuery();
  const editar = useEditarReparacion();
  const toast = useToast();

  const [proveedorId, setProveedorId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [fechaSalida, setFechaSalida] = useState('');
  const [envioId, setEnvioId] = useState('');
  const [ocNumero, setOcNumero] = useState('');
  const [ocFecha, setOcFecha] = useState('');

  useEffect(() => {
    if (reparacion) {
      setProveedorId(reparacion.proveedor_id);
      setMotivo(reparacion.motivo);
      setFechaSalida(reparacion.fecha_salida);
      setEnvioId(reparacion.envio_id ?? '');
      setOcNumero(reparacion.orden_compra_numero ?? '');
      setOcFecha(reparacion.orden_compra_fecha ?? '');
    }
  }, [reparacion]);

  async function handleGuardar() {
    if (!reparacion) return;
    if (!proveedorId) { toast('Elegí un proveedor', 'error'); return; }
    if (!motivo.trim()) { toast('Ingresá un motivo', 'error'); return; }
    try {
      await editar.mutateAsync({
        id: reparacion.id,
        proveedor_id: proveedorId,
        motivo: motivo.trim(),
        fecha_salida: fechaSalida,
        envio_id: envioId || null,
        orden_compra_numero: ocNumero.trim() || null,
        orden_compra_fecha: ocFecha || null,
      });
      toast('Reparación actualizada', 'success');
      onClose();
    } catch (err) {
      await registrarErrorAccion('Error al editar una reparación', err);
      toast('Error al guardar: ' + mensajeDeError(err), 'error');
    }
  }

  return (
    <Modal
      open={!!reparacion}
      onClose={onClose}
      title={<><Icono n="editar" /> Editar reparación</>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="success" disabled={editar.isPending} onClick={() => void handleGuardar()}>
            {editar.isPending ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="editar-reparacion-modal-1">Proveedor (taller)</label>
          <Select id="editar-reparacion-modal-1" value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
            <option value="">Elegí un proveedor...</option>
            {proveedores?.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </Select>
        </div>
        <div className="form-group">
          <label htmlFor="editar-reparacion-modal-2">Motivo</label>
          <Input id="editar-reparacion-modal-2" type="text" value={motivo} onChange={e => setMotivo(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="editar-reparacion-modal-3">Fecha de salida</label>
          <Input id="editar-reparacion-modal-3" type="date" value={fechaSalida} onChange={e => setFechaSalida(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="editar-reparacion-modal-4">Envío / nota de despacho (opcional)</label>
          <Select id="editar-reparacion-modal-4" value={envioId} onChange={e => setEnvioId(e.target.value)}>
            <option value="">— No tiene remito de salida —</option>
            {envios?.map(e => <option key={e.id} value={e.id}>{e.numero_documento || '(sin número)'}</option>)}
          </Select>
        </div>
        <div className="form-group">
          <label htmlFor="editar-reparacion-modal-5">N° de orden de compra</label>
          <Input id="editar-reparacion-modal-5" type="text" placeholder="Se completa cuando llega, no es obligatorio" value={ocNumero} onChange={e => setOcNumero(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="editar-reparacion-modal-6">Fecha de la orden de compra</label>
          <Input id="editar-reparacion-modal-6" type="date" value={ocFecha} onChange={e => setOcFecha(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
