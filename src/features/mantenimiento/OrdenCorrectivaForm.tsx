import { useId, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { mensajeDeError } from '../../lib/errores';
import { faltantes, numeroOT, tareasDeTexto } from './preventivo';
import { RepuestosEditor } from './Repuestos';
import { limpiarLineas } from './lineasDeRepuestos';
import { useComponentes } from './useComponentes';
import { useMantenimiento } from './servicio';
import type { Prioridad, RepuestoLinea } from './tipos';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  equipoId?: string;
  /** Después de crearla (por ejemplo, para abrirla). */
  onCreada?: (numero: number) => void;
}

// OT correctiva hecha a mano (del diseño del socio): algo que se rompió o un trabajo de una sola vez. Se crea siempre, aunque falte algún
// repuesto: solo se avisa.
export default function OrdenCorrectivaForm(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} large title={<><Icono n="herramienta" /> Programar OT correctiva</>}>
      {props.open && <Formulario {...props} />}
    </Modal>
  );
}

function Formulario({ onClose, equipoId, onCreada }: Props) {
  const uid = useId();
  const toast = useToast();
  const s = useMantenimiento();
  const [equipo, setEquipo] = useState(equipoId ?? '');
  const [fecha, setFecha] = useState(fechaHoyISO());
  const [tareas, setTareas] = useState('');
  const [asignado, setAsignado] = useState(s.tecnicos.some(t => t.id === s.usuarioId) ? s.usuarioId : '');
  const [prioridad, setPrioridad] = useState<Prioridad>('normal');
  const [falla, setFalla] = useState('');
  const [repuestos, setRepuestos] = useState<RepuestoLinea[]>([]);
  const [guardando, setGuardando] = useState(false);
  const componentes = useComponentes(equipo || null);
  const opciones = useMemo(() => (s.equipos ?? []).map(e => ({ value: e.id, label: `${e.codigo} — ${e.nombre}`, buscar: [e.sector, ...e.etiquetas] })), [s.equipos]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const lista = tareasDeTexto(tareas);
    if (!equipo) { toast('Elegí el equipo.', 'error'); return; }
    if (!lista.length) { toast('Escribí qué hay que hacer.', 'error'); return; }
    const lineas = limpiarLineas(repuestos);
    setGuardando(true);
    try {
      const numero = await s.crearCorrectiva({ equipoId: equipo, fecha, asignadoId: asignado || null, prioridad, falla: falla.trim(), tareas: lista, repuestos: lineas });
      const faltan = faltantes(lineas);
      if (faltan.length) toast(`${numeroOT(numero)} creada. Ojo: falta stock de ${faltan.map(l => l.descripcion || l.codigo).join(', ')}`, 'error');
      else toast(`${numeroOT(numero)} creada`, 'success');
      onClose();
      onCreada?.(numero);
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
          <label htmlFor={`${uid}-eq`}>Equipo *</label>
          <Combobox id={`${uid}-eq`} value={equipo} onChange={setEquipo} opciones={opciones} placeholder="Buscá el equipo" disabled={!!equipoId} />
        </div>
        <div className="form-group full">
          <label id={`${uid}-pr`}>Prioridad</label>
          <div className="mt-chips" role="radiogroup" aria-labelledby={`${uid}-pr`} style={{ marginBottom: 0 }}>
            {(['normal', 'urgente'] as const).map(p => (
              <button key={p} type="button" role="radio" aria-checked={prioridad === p} className={`mt-chip${prioridad === p ? ' activo' : ''}${p === 'urgente' ? ' alerta' : ''}`} onClick={() => setPrioridad(p)}>
                {p === 'urgente' ? 'Urgente' : 'Normal'}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-fa`}>Falla reportada</label>
          <Textarea id={`${uid}-fa`} data-autofocus value={falla} onChange={e => setFalla(e.target.value)} rows={2} placeholder="Qué se ve o qué avisaron. Ej.: hace ruido el rodamiento lado acople" maxLength={4000} />
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
          <Select id={`${uid}-a`} value={asignado} onChange={e => setAsignado(e.target.value)}>
            <option value="">Sin asignar</option>
            {s.tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </Select>
        </div>
        <div className="form-group full">
          <label>Repuestos que va a llevar</label>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Se descuentan del stock recién al terminar la OT, y solo lo que se usó.</div>
          <RepuestosEditor lineas={repuestos} onChange={setRepuestos} componentes={componentes} />
        </div>
      </div>
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={guardando}><Icono n="guardar" /> {guardando ? 'Creando...' : 'Crear OT'}</Button>
      </div>
    </form>
  );
}
