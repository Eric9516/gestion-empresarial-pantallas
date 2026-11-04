import { useId, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { useComponentesDeEquipo, useEquiposQuery } from './useEquipos';
import RepuestosEditor from './RepuestosEditor';
import { limpiarLineas } from './repuestos';
import { useFaltantes } from './useStockRepuestos';
import type { Prioridad, RepuestoLinea } from './tipos';
import { useCrearOrdenCorrectiva } from './usePreventivo';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  equipoId?: string;
  personas: string[];
}

// OT correctiva hecha a mano: algo que se rompió o un trabajo de una sola vez.
export default function OrdenCorrectivaForm(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} title={<><Icono n="herramienta" /> Nueva OT correctiva</>}>
      {props.open && <Formulario {...props} />}
    </Modal>
  );
}

function Formulario({ onClose, equipoId, personas }: Props) {
  const uid = useId();
  const toast = useToast();
  const crear = useCrearOrdenCorrectiva();
  const { data: equipos } = useEquiposQuery();
  const [equipo, setEquipo] = useState(equipoId ?? '');
  const [fecha, setFecha] = useState(fechaHoyISO());
  const [tareas, setTareas] = useState('');
  const [asignado, setAsignado] = useState('');
  const [prioridad, setPrioridad] = useState<Prioridad>('normal');
  const [falla, setFalla] = useState('');
  const [repuestos, setRepuestos] = useState<RepuestoLinea[]>([]);
  const componentes = useComponentesDeEquipo(equipo || null);
  const faltantes = useFaltantes();
  const opciones = useMemo(() => equipos.map(e => ({ value: e.id, label: `${e.codigo} — ${e.nombre}`, buscar: [e.sector, ...e.etiquetas] })), [equipos]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!equipo) { toast('Elegí el equipo.', 'error'); return; }
    if (!tareas.trim()) { toast('Escribí qué hay que hacer.', 'error'); return; }
    const lineas = limpiarLineas(repuestos);
    // La OT se crea siempre, aunque falte algún repuesto: solo se avisa.
    const numero = await crear.mutateAsync({ equipoId: equipo, fechaProgramada: fecha, tareas: tareas.trim(), asignadoA: asignado.trim(), repuestos: lineas, prioridad, falla: falla.trim() });
    const faltan = faltantes(lineas);
    if (faltan.length) toast(`${numero} creada. Ojo: falta stock de ${faltan.map(l => l.descripcion || l.codigo).join(', ')}`, 'error');
    else toast(`${numero} creada`, 'success');
    onClose();
  }

  return (
    <form onSubmit={enviar}>
      <div className="form-grid">
        <div className="form-group full">
          <label htmlFor={`${uid}-eq`}>Equipo *</label>
          <Combobox id={`${uid}-eq`} value={equipo} onChange={setEquipo} opciones={opciones} placeholder="Buscá el equipo" disabled={!!equipoId} />
        </div>
        <div className="form-group full">
          <label>Prioridad</label>
          <div className="mt-chips" role="radiogroup" aria-label="Prioridad" style={{ marginBottom: 0 }}>
            {(['normal', 'urgente'] as const).map(p => (
              <button key={p} type="button" role="radio" aria-checked={prioridad === p} className={`mt-chip${prioridad === p ? ' activo' : ''}${p === 'urgente' ? ' alerta' : ''}`} onClick={() => setPrioridad(p)}>
                {p === 'urgente' ? 'Urgente' : 'Normal'}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-fa`}>Falla reportada</label>
          <Textarea id={`${uid}-fa`} data-autofocus value={falla} onChange={e => setFalla(e.target.value)} rows={2} placeholder="Qué se ve o qué avisaron. Ej.: hace ruido el rodamiento lado acople" />
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-t`}>Qué hay que hacer * (una tarea por renglón)</label>
          <Textarea id={`${uid}-t`} value={tareas} onChange={e => setTareas(e.target.value)} rows={4} placeholder={'Revisar motor\nCambiar rodamiento\nProbar en marcha'} />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-f`}>Fecha</label>
          <Input id={`${uid}-f`} type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-a`}>Asignada a</label>
          <Input id={`${uid}-a`} list={`${uid}-personas`} value={asignado} onChange={e => setAsignado(e.target.value)} />
          <datalist id={`${uid}-personas`}>{personas.map(p => <option key={p} value={p} />)}</datalist>
        </div>
        <div className="form-group full">
          <label>Repuestos que va a llevar</label>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Se descuentan del stock recién al terminar la OT, y solo lo que se usó.</div>
          <RepuestosEditor lineas={repuestos} onChange={setRepuestos} componentes={componentes} />
        </div>
      </div>
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary"><Icono n="guardar" /> Crear OT</Button>
      </div>
    </form>
  );
}
