import { useId, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { mensajeDeError } from '../../lib/errores';
import { useGuardarRepuestoCritico } from './useEquipos';
import BuscadorRepuesto from './BuscadorRepuesto';
import type { RepuestoCritico } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  repuesto?: RepuestoCritico | null;
}

// Agregar un repuesto crítico a un equipo. Se elige de los repuestos del Depósito (así se ve su
// stock); si todavía no está cargado ahí, se puede escribir el código y la descripción a mano.
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
  const guardar = useGuardarRepuestoCritico();
  const [aMano, setAMano] = useState(!!repuesto);
  const [codigo, setCodigo] = useState(repuesto?.codigo ?? '');
  const [descripcion, setDescripcion] = useState(repuesto?.descripcion ?? '');
  const [cantidad, setCantidad] = useState(String(repuesto?.cantidad ?? 1));
  const [nota, setNota] = useState(repuesto?.nota ?? '');


  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!codigo.trim()) { toast('Elegí un repuesto o escribí su código.', 'error'); return; }
    const cant = Number(cantidad.replace(',', '.'));
    if (!Number.isFinite(cant) || cant < 0) { toast('La cantidad tiene que ser un número.', 'error'); return; }
    try {
      await guardar.mutateAsync({ id: repuesto?.id, equipoId, codigo: codigo.trim(), descripcion: descripcion.trim(), cantidad: cant, nota: nota.trim() });
      toast('Repuesto guardado', 'success');
      onClose();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    }
  }

  return (
    <form onSubmit={enviar}>
      <div className="form-grid">
        {!aMano ? (
          <div className="form-group full">
            <label htmlFor={`${uid}-it`}>Repuesto del Depósito</label>
            {codigo && <div className="mt-rep-elegido" style={{ marginBottom: 6 }}><strong>{codigo}</strong>{descripcion && <span>— {descripcion}</span>}</div>}
            <BuscadorRepuesto id={`${uid}-it`} onElegir={r => { setCodigo(r.codigo); setDescripcion(r.descripcion); }} placeholder={codigo ? 'Buscar otro repuesto' : undefined} />
            <button type="button" onClick={() => setAMano(true)} style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, color: 'var(--blue)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', fontSize: 12 }}>
              No está en el Depósito: escribirlo a mano
            </button>
          </div>
        ) : (
          <>
            <div className="form-group">
              <label htmlFor={`${uid}-c`}>Código del repuesto *</label>
              <Input id={`${uid}-c`} value={codigo} onChange={e => setCodigo(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor={`${uid}-d`}>Descripción</label>
              <Input id={`${uid}-d`} value={descripcion} onChange={e => setDescripcion(e.target.value)} />
            </div>
          </>
        )}
        <div className="form-group">
          <label htmlFor={`${uid}-q`}>Cantidad que conviene tener</label>
          <Input id={`${uid}-q`} inputMode="decimal" value={cantidad} onChange={e => setCantidad(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-n`}>Nota</label>
          <Input id={`${uid}-n`} value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej.: cambiar cada 2000 h" />
        </div>
      </div>
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary"><Icono n="guardar" /> Guardar</Button>
      </div>
    </form>
  );
}
