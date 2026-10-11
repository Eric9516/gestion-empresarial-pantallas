import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useAuth } from '../../auth/AuthContext';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { cantidadPendiente, useRegistrarEntrega, type ReparacionItemConDetalle } from './useReparaciones';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { mensajeDeError } from '@/lib/errores';

interface Props {
  linea: ReparacionItemConDetalle | null;
  onClose: () => void;
}

export default function RegistrarEntregaModal({ linea, onClose }: Props) {
  const { profile } = useAuth();
  const registrar = useRegistrarEntrega();
  const toast = useToast();

  const pendiente = linea ? cantidadPendiente(linea) : 0;

  const [cantidad, setCantidad] = useState('1');
  const [resultado, setResultado] = useState<'reparado' | 'baja'>('reparado');
  const [reponeStock, setReponeStock] = useState(true);
  const [puntoVenta, setPuntoVenta] = useState('');
  const [numeroRemito, setNumeroRemito] = useState('');
  const [fechaRemito, setFechaRemito] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState(fechaHoyISO);

  useEffect(() => {
    if (linea) {
      setCantidad(String(cantidadPendiente(linea)));
      setResultado('reparado');
      setReponeStock(true);
      setPuntoVenta('');
      setNumeroRemito('');
      setFechaRemito('');
      setFechaEntrega(fechaHoyISO());
    }
  }, [linea]);

  async function handleGuardar() {
    if (!linea || !profile) return;
    const cant = parseInt(cantidad, 10);
    if (!(cant > 0)) { toast('Ingresá una cantidad mayor a 0', 'error'); return; }
    if (cant > pendiente) { toast(`No podés registrar más de ${pendiente}, es lo que queda pendiente`, 'error'); return; }
    try {
      await registrar.mutateAsync({
        reparacion_item_id: linea.id,
        cantidad_devuelta: cant,
        resultado,
        remito_punto_venta: puntoVenta.trim() || null,
        remito_numero: numeroRemito.trim() || null,
        remito_fecha: fechaRemito || null,
        fecha_entrega: fechaEntrega,
        registrado_por: profile.id,
        repone_stock: resultado === 'reparado' && reponeStock,
      });
      toast('Entrega registrada', 'success');
      onClose();
    } catch (err) {
      await registrarErrorAccion('Error al registrar una entrega de reparación', err);
      toast('Error al registrar la entrega: ' + mensajeDeError(err), 'error');
    }
  }

  return (
    <Modal
      open={!!linea}
      onClose={onClose}
      title={linea ? `Registrar entrega — ${linea.items?.codigo}` : ''}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="success" disabled={registrar.isPending} onClick={() => void handleGuardar()}>
            {registrar.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </>
      }
    >
      {linea && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 14 }}>
            Quedan <strong>{pendiente}</strong> unidad{pendiente === 1 ? '' : 'es'} pendiente{pendiente === 1 ? '' : 's'} de esta línea.
          </p>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="registrar-entrega-modal-1">Cantidad que vuelve ahora</label>
              <Input id="registrar-entrega-modal-1" type="number" min={1} max={pendiente} value={cantidad} onChange={e => setCantidad(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="registrar-entrega-modal-2">Resultado</label>
              <Select id="registrar-entrega-modal-2" value={resultado} onChange={e => setResultado(e.target.value as 'reparado' | 'baja')}>
                <option value="reparado">Reparado</option>
                <option value="baja">Sin arreglo — se da de baja</option>
              </Select>
            </div>
            <div className="form-group">
              <label htmlFor="registrar-entrega-modal-3">Fecha de entrega</label>
              <Input id="registrar-entrega-modal-3" type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} />
            </div>
            <div className="form-group">
              {resultado === 'reparado' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-mid)', cursor: 'pointer', marginTop: 22 }} title="Destildalo si va directo a instalarse en vez de volver al depósito">
                  <input type="checkbox" checked={reponeStock} onChange={e => setReponeStock(e.target.checked)} />
                  Sumar al stock
                </label>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="registrar-entrega-modal-4">Punto de venta (remito)</label>
              <Input id="registrar-entrega-modal-4" type="text" placeholder="Ej: 0003" value={puntoVenta} onChange={e => setPuntoVenta(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="registrar-entrega-modal-5">Número de remito</label>
              <Input id="registrar-entrega-modal-5" type="text" placeholder="Ej: 00012345" value={numeroRemito} onChange={e => setNumeroRemito(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="registrar-entrega-modal-6">Fecha del remito</label>
              <Input id="registrar-entrega-modal-6" type="date" value={fechaRemito} onChange={e => setFechaRemito(e.target.value)} />
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
