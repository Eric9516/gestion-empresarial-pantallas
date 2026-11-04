import { useId, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { mensajeDeError } from '../../lib/errores';
import { frecuenciaEnPalabras } from './fechas';
import { useComponentesDeEquipo, useEquiposQuery } from './useEquipos';
import RepuestosEditor from './RepuestosEditor';
import { limpiarLineas } from './repuestos';
import { useEliminarRutina, useGuardarRutina, usePlanillasQuery } from './usePreventivo';
import TareasEditor from './TareasEditor';
import { filaNueva, filasDeRutina, filasDeTareas, tareasDeFilas, textoTareaDef, type FilaTarea } from './tareas';
import { tareasDePlanilla } from './preventivo';
import type { RutinaPreventiva } from './tipos';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Icono } from '@/components/Icono';

const UNIDADES = { dias: 1, semanas: 7, meses: 30 } as const;
type Unidad = keyof typeof UNIDADES;

function descomponer(dias: number): { cada: number; unidad: Unidad } {
  if (dias % 30 === 0) return { cada: dias / 30, unidad: 'meses' };
  if (dias % 7 === 0) return { cada: dias / 7, unidad: 'semanas' };
  return { cada: dias, unidad: 'dias' };
}

interface Props {
  open: boolean;
  onClose: () => void;
  rutina?: RutinaPreventiva | null;
  /** Equipo ya elegido (al crearla desde la ficha del equipo). */
  equipoId?: string;
  personas: string[];
}

// Rutina preventiva: qué hacer, en qué equipo, cada cuánto, desde cuándo y con cuánto aviso.
// Cada rutina genera sola su orden de trabajo para la próxima fecha.
export default function RutinaForm(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} title={<><Icono n="calendario" /> {props.rutina ? 'Editar rutina preventiva' : 'Nueva rutina preventiva'}</>}>
      {props.open && <Formulario {...props} />}
    </Modal>
  );
}

function Formulario({ onClose, rutina, equipoId, personas }: Props) {
  const uid = useId();
  const toast = useToast();
  const confirmar = useConfirm();
  const guardar = useGuardarRutina();
  const eliminar = useEliminarRutina();
  const { data: equipos } = useEquiposQuery();
  const inicial = descomponer(rutina?.frecuenciaDias ?? 30);
  const [equipo, setEquipo] = useState(rutina?.equipoId ?? equipoId ?? '');
  const { data: planillas } = usePlanillasQuery();
  const [planillaId, setPlanillaId] = useState(rutina?.planillaId ?? '');
  const [filas, setFilas] = useState<FilaTarea[]>(() => (rutina && !rutina.planillaId ? filasDeRutina(rutina) : [filaNueva()]));
  const planilla = planillas.find(p => p.id === planillaId);
  const [cada, setCada] = useState(String(inicial.cada));
  const [unidad, setUnidad] = useState<Unidad>(inicial.unidad);
  const [proxima, setProxima] = useState(rutina?.proximaFecha ?? fechaHoyISO());
  const [aviso, setAviso] = useState(String(rutina?.avisoDiasAntes ?? 3));
  const [responsable, setResponsable] = useState(rutina?.responsable ?? '');
  const [activa, setActiva] = useState(rutina?.activa ?? true);
  const [repuestos, setRepuestos] = useState(rutina?.repuestos ?? []);
  const componentes = useComponentesDeEquipo(equipo || null);

  const opciones = useMemo(() => equipos.map(e => ({ value: e.id, label: `${e.codigo} — ${e.nombre}`, buscar: [e.sector, ...e.etiquetas] })), [equipos]);
  const dias = Math.round(Number(cada) * UNIDADES[unidad]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!equipo) { toast('Elegí el equipo.', 'error'); return; }
    let tarea = '';
    let mediciones: RutinaPreventiva['mediciones'] = [];
    if (planilla) {
      ({ tarea, mediciones } = tareasDePlanilla(planilla));
    } else {
      const r = tareasDeFilas(filas);
      if ('error' in r) { toast(r.error, 'error'); return; }
      ({ tarea, mediciones } = tareasDePlanilla(r));
    }
    if (!tarea.trim()) { toast('Escribí al menos una tarea o elegí una planilla.', 'error'); return; }
    if (!Number.isFinite(dias) || dias < 1) { toast('La frecuencia tiene que ser de al menos 1 día.', 'error'); return; }
    const av = Number(aviso);
    if (!Number.isFinite(av) || av < 0) { toast('Los días de aviso tienen que ser un número.', 'error'); return; }
    try {
      await guardar.mutateAsync({ id: rutina?.id, equipoId: equipo, tarea, mediciones, planillaId: planilla?.id ?? null, frecuenciaDias: dias, proximaFecha: proxima, avisoDiasAntes: Math.round(av), responsable: responsable.trim(), activa, repuestos: limpiarLineas(repuestos) });
      toast(rutina ? 'Rutina actualizada' : 'Rutina creada: ya tiene su orden de trabajo en el calendario', 'success');
      onClose();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    }
  }

  async function borrar() {
    if (!rutina) return;
    if (!(await confirmar('¿Eliminar esta rutina? Se quita su orden de trabajo pendiente. Lo que ya se hizo queda en el historial.', { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    await eliminar.mutateAsync(rutina.id);
    toast('Rutina eliminada', 'success');
    onClose();
  }

  return (
    <form onSubmit={enviar}>
      <div className="form-grid">
        <div className="form-group full">
          <label htmlFor={`${uid}-eq`}>Equipo *</label>
          <Combobox id={`${uid}-eq`} value={equipo} onChange={setEquipo} opciones={opciones} placeholder="Buscá el equipo" disabled={!!equipoId && !rutina} />
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-pl`}>Tareas *</label>
          <Select id={`${uid}-pl`} value={planillaId} onChange={e => setPlanillaId(e.target.value)}>
            <option value="">Escribirlas acá</option>
            {[...planillas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(p => <option key={p.id} value={p.id}>Planilla: {p.nombre}</option>)}
          </Select>
          {planilla ? (
            <div className="mt-bloque" style={{ marginTop: 8, marginBottom: 0, padding: '10px 12px' }}>
              <ol className="mt-planilla-lista">
                {planilla.tareas.map(t => <li key={t.id}>{textoTareaDef(t)}</li>)}
              </ol>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                Las tareas salen de la planilla: si la cambiás, se actualiza esta rutina.{' '}
                <button type="button" className="mt-link" onClick={() => { setFilas(filasDeTareas(planilla.tareas).map(f => ({ ...f, id: `${f.id}-c` }))); setPlanillaId(''); }}>Copiarlas para cambiarlas solo acá</button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 8 }}>
              <TareasEditor filas={filas} onChange={setFilas} />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>En la OT, cada tarea sale para tildar; las de medición piden el valor.</div>
            </div>
          )}
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-c`}>Se repite cada</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input id={`${uid}-c`} inputMode="numeric" value={cada} onChange={e => setCada(e.target.value)} style={{ maxWidth: 90 }} />
            <Select value={unidad} onChange={e => setUnidad(e.target.value as Unidad)} aria-label="Unidad">
              <option value="dias">días</option>
              <option value="semanas">semanas</option>
              <option value="meses">meses</option>
            </Select>
          </div>
          {dias >= 1 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{frecuenciaEnPalabras(dias)}</div>}
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-p`}>Próxima fecha</label>
          <Input id={`${uid}-p`} type="date" value={proxima} onChange={e => setProxima(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-a`}>Avisar con (días antes)</label>
          <Input id={`${uid}-a`} inputMode="numeric" value={aviso} onChange={e => setAviso(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-r`}>Responsable</label>
          <Input id={`${uid}-r`} list={`${uid}-personas`} value={responsable} onChange={e => setResponsable(e.target.value)} />
          <datalist id={`${uid}-personas`}>{personas.map(p => <option key={p} value={p} />)}</datalist>
        </div>
        <div className="form-group full">
          <label>Repuestos que lleva cada vez</label>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Se copian a cada OT. Si no hay stock, la OT avisa igual que falta.</div>
          <RepuestosEditor lineas={repuestos} onChange={setRepuestos} componentes={componentes} />
        </div>
        <div className="form-group full">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontWeight: 700 }}>
            <input type="checkbox" checked={activa} onChange={e => setActiva(e.target.checked)} style={{ width: 18, height: 18 }} />
            Activa (si la desactivás, deja de generar órdenes)
          </label>
        </div>
      </div>
      <div className="modal-footer">
        {rutina && <Button type="button" variant="dangerGhost" onClick={() => void borrar()} style={{ marginRight: 'auto' }}><Icono n="borrar" /> Eliminar</Button>}
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary"><Icono n="guardar" /> Guardar</Button>
      </div>
    </form>
  );
}
