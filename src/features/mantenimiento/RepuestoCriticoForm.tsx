import { useId, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { mensajeDeError } from '../../lib/errores';
import BuscadorRepuesto from './BuscadorRepuesto';
import { useMantenimiento } from './servicio';
import type { RepuestoCritico, RepuestoParaElegir } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  repuesto?: RepuestoCritico | null;
}

// Agregar un repuesto crítico a un equipo (del diseño del socio): se elige de los repuestos del Depósito, así se ve su stock y se avisa si
// falta. (Un repuesto que todavía no está en el Depósito se carga primero allá.)
export default function RepuestoCriticoForm(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} title={<><Icono n="paquete" /> {props.repuesto ? 'Editar repuesto crítico' : 'Agregar repuesto crítico'}</>}>
      {props.open && <Formulario {...props} />}
    </Modal>
  );
}

function Formulario({ onClose, equipoId, repuesto }: Props) {
  const uid = useId();
  const toast = useToast();
  const s = useMantenimiento();
  const [elegido, setElegido] = useState<Pick<RepuestoParaElegir, 'id' | 'codigo' | 'descripcion'> | null>(
    repuesto ? { id: repuesto.itemId, codigo: repuesto.codigo, descripcion: repuesto.descripcion } : null);
  const [cantidad, setCantidad] = useState(String(repuesto?.cantidad ?? 1));
  const [nota, setNota] = useState(repuesto?.nota ?? '');
  const [guardando, setGuardando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!elegido) { toast('Elegí un repuesto del Depósito.', 'error'); return; }
    const cant = Number(cantidad.replace(',', '.'));
    if (!Number.isFinite(cant) || cant <= 0) { toast('La cantidad tiene que ser un número mayor que cero.', 'error'); return; }
    setGuardando(true);
    try {
      await s.guardarRepuesto({ equipoId, itemId: elegido.id, cantidad: cant, nota: nota.trim(), nuevo: !repuesto });
      toast('Repuesto guardado', 'success');
      onClose();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={enviar}>
      <div className="form-grid">
        <div className="form-group full">
          <label htmlFor={`${uid}-it`}>Repuesto del Depósito</label>
          {elegido && <div className="mt-rep-elegido" style={{ marginBottom: 6 }}><strong>{elegido.codigo}</strong>{elegido.descripcion && <span>— {elegido.descripcion}</span>}</div>}
          {!repuesto && <BuscadorRepuesto id={`${uid}-it`} onElegir={setElegido} placeholder={elegido ? 'Buscar otro repuesto' : undefined} />}
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-q`}>Cantidad que conviene tener</label>
          <Input id={`${uid}-q`} inputMode="decimal" value={cantidad} onChange={e => setCantidad(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-n`}>Nota</label>
          <Input id={`${uid}-n`} value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej.: cambiar cada 2000 h" maxLength={300} />
        </div>
      </div>
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={guardando}><Icono n="guardar" /> {guardando ? 'Guardando...' : 'Guardar'}</Button>
      </div>
    </form>
  );
}
