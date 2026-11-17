import { useId, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { mensajeDeError } from '../../lib/errores';
import { frecuenciaEnPalabras } from './fechas';
import { textoTareaDef } from './preventivo';
import { filaNueva, filasDeTareas, tareasDeFilas, type FilaTarea } from './filasDeTareas';
import TareasEditor from './TareasEditor';
import { RepuestosEditor } from './Repuestos';
import { limpiarLineas } from './lineasDeRepuestos';
import { useComponentes } from './useComponentes';
import { useMantenimiento } from './servicio';
import type { RepuestoLinea, Rutina } from './tipos';
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
  rutina?: Rutina | null;
  /** Equipo ya elegido (al crearla desde la ficha del equipo). */
  equipoId?: string;
}

// Rutina preventiva (del diseño del socio): qué hacer, en qué equipo, cada cuánto, desde cuándo, con cuánto aviso, quién y con qué repuestos.
// Cada rutina activa tiene siempre su orden de trabajo para la próxima fecha: la arma la base al guardarla. Las tareas salen de una planilla
// (si la planilla cambia, cambian) o se escriben acá; cualquier tarea puede pedir anotar un valor (medición).
export default function RutinaForm(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} large title={<><Icono n="calendario" /> {props.rutina ? 'Editar rutina preventiva' : 'Nueva rutina preventiva'}</>}>
      {props.open && <Formulario {...props} />}
    </Modal>
  );
}

function Formulario({ onClose, rutina, equipoId }: Props) {
  const uid = useId();
  const toast = useToast();
  const confirmar = useConfirm();
  const s = useMantenimiento();
  const inicial = descomponer(rutina?.frecuenciaDias ?? 30);
  const [equipo, setEquipo] = useState(rutina?.equipoId ?? equipoId ?? '');
  const [planilla, setPlanilla] = useState(rutina?.planillaId ?? '');
  const [filas, setFilas] = useState<FilaTarea[]>(() => (rutina?.tareas.length ? filasDeTareas(rutina.tareas) : [filaNueva()]));
  const deLaPlanilla = s.planillas.find(p => p.id === planilla);
  const [cada, setCada] = useState(String(inicial.cada));
  const [unidad, setUnidad] = useState<Unidad>(inicial.unidad);
  const [proxima, setProxima] = useState(rutina?.proximaFecha ?? fechaHoyISO());
  const [aviso, setAviso] = useState(String(rutina?.avisoDias ?? 3));
  const [responsable, setResponsable] = useState(rutina?.responsableId ?? '');
  const [activa, setActiva] = useState(rutina?.activa ?? true);
  const [repuestos, setRepuestos] = useState<RepuestoLinea[]>(rutina?.repuestos ?? []);
  const [guardando, setGuardando] = useState(false);
  const componentes = useComponentes(equipo || null);

  const opciones = useMemo(() => (s.equipos ?? []).map(e => ({ value: e.id, label: `${e.codigo} — ${e.nombre}`, buscar: [e.sector, ...e.etiquetas] })), [s.equipos]);
  const dias = Math.round(Number(cada) * UNIDADES[unidad]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!equipo) { toast('Elegí el equipo.', 'error'); return; }
    const r = planilla ? { tareas: [] } : tareasDeFilas(filas);
    if ('error' in r) { toast(r.error, 'error'); return; }
    if (!planilla && !r.tareas.length) { toast('Escribí al menos una tarea.', 'error'); return; }
    if (!Number.isFinite(dias) || dias < 1 || dias > 3650) { toast('La frecuencia tiene que ser de 1 día a 10 años.', 'error'); return; }
    const av = Number(aviso);
    if (!Number.isInteger(av) || av < 0 || av > 365) { toast('Los días de aviso tienen que ser un número de 0 a 365.', 'error'); return; }
    setGuardando(true);
    try {
      await s.guardarRutina({
        id: rutina?.id ?? null, equipoId: equipo, tareas: r.tareas, planillaId: planilla || null, frecuenciaDias: dias, proximaFecha: proxima, avisoDias: av, responsableId: responsable || null,
        activa, repuestos: limpiarLineas(repuestos),
      });
      toast(rutina ? 'Rutina actualizada' : 'Rutina creada: ya tiene su orden de trabajo en el calendario', 'success');
      onClose();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!rutina) return;
    if (!(await confirmar('¿Eliminar esta rutina? Se quita su orden de trabajo pendiente. Lo que ya se hizo queda en el historial.', { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    try {
      await s.eliminarRutina(rutina.id);
      toast('Rutina eliminada', 'success');
      onClose();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    }
  }

  return (
    <form onSubmit={enviar}>
      <div className="form-grid">
        <div className="form-group full">
          <label htmlFor={`${uid}-eq`}>Equipo *</label>
          <Combobox id={`${uid}-eq`} value={equipo} onChange={setEquipo} opciones={opciones} placeholder="Buscá el equipo" disabled={!!equipoId && !rutina} />
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-pl`}>Tareas de</label>
          <Select id={`${uid}-pl`} value={planilla} onChange={e => {
            // al dejar la planilla, sus tareas quedan para editar
            if (!e.target.value && deLaPlanilla) setFilas(filasDeTareas(deLaPlanilla.tareas));
            setPlanilla(e.target.value);
          }}>
            <option value="">Escribirlas acá</option>
            {s.planillas.map(p => <option key={p.id} value={p.id}>Planilla: {p.nombre}</option>)}
          </Select>
        </div>
        <div className="form-group full">
          {deLaPlanilla ? (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 6 }}>Si la planilla cambia, cambian estas tareas (y las de su OT pendiente).</div>
              <ol className="mt-planilla-lista">{deLaPlanilla.tareas.map((t, i) => <li key={i}>{textoTareaDef(t)}</li>)}</ol>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 6 }}>En la OT, cada tarea sale para tildar; las que piden un valor, con su casillero.</div>
              <TareasEditor filas={filas} onChange={setFilas} />
            </>
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
          <Select id={`${uid}-r`} value={responsable} onChange={e => setResponsable(e.target.value)}>
            <option value="">Sin asignar</option>
            {rutina?.responsableId && !s.tecnicos.some(t => t.id === rutina.responsableId) && <option value={rutina.responsableId}>{rutina.responsable}</option>}
            {s.tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </Select>
        </div>
        <div className="form-group full">
          <label>Repuestos que lleva cada vez</label>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Se copian a cada OT. Si no hay stock, la OT avisa que falta.</div>
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
        <Button type="submit" variant="primary" disabled={guardando}><Icono n="guardar" /> {guardando ? 'Guardando...' : 'Guardar'}</Button>
      </div>
    </form>
  );
}
