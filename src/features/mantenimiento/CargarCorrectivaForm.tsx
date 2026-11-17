import { useId, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { mensajeDeError } from '../../lib/errores';
import { ahora, llegaEn, momentoCorto } from './flujo';
import { numeroOT, totalHorasHombre } from './preventivo';
import { RepuestosEditor } from './Repuestos';
import { limpiarLineas } from './lineasDeRepuestos';
import { useComponentes } from './useComponentes';
import { useMantenimiento } from './servicio';
import TecnicosEditor from './TecnicosEditor';
import type { Liberacion, Prioridad, RepuestoLinea, TrabajoTecnico } from './tipos';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  equipoId?: string;
}

/** "HH:MM" de ahora (en la hora de la computadora). */
const horaDeAhora = () => ahora().slice(11, 16);

// La OT correctiva que carga el técnico (del socio, 10/11/2026): las fallas entran por el teléfono de guardia del taller; el técnico hace el
// trabajo y después la carga ya hecha (falla, causa, trabajo realizado, técnicos con horarios, repuestos, horas de parada, liberación y lo
// pendiente). Nace terminada y sigue el circuito: la revisa el jefe de taller y la aprueba el responsable (recién ahí va al historial y
// descuenta los repuestos).
export default function CargarCorrectivaForm(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} large title={<><Icono n="herramienta" /> Cargar OT correctiva</>}>
      {props.open && <Formulario {...props} />}
    </Modal>
  );
}

function Formulario({ onClose, equipoId }: Props) {
  const uid = useId();
  const toast = useToast();
  const s = useMantenimiento();
  const hoy = fechaHoyISO();
  const [equipo, setEquipo] = useState(equipoId ?? '');
  const [fecha, setFecha] = useState(hoy);
  const [prioridad, setPrioridad] = useState<Prioridad>('normal');
  const [falla, setFalla] = useState('');
  const [causa, setCausa] = useState('');
  const [solucion, setSolucion] = useState('');
  const [parada, setParada] = useState('');
  const [horas, setHoras] = useState('');
  const [obs, setObs] = useState('');
  const yo = s.tecnicos.find(t => t.id === s.usuarioId);
  const [tecnicos, setTecnicos] = useState<TrabajoTecnico[]>(yo ? [{ usuarioId: yo.id, nombre: yo.nombre, fecha: hoy, inicio: '', fin: horaDeAhora() }] : []);
  const [repuestos, setRepuestos] = useState<RepuestoLinea[]>([]);
  const [liberacion, setLiberacion] = useState<Liberacion | null>(
    s.config.controlesLiberacion.length ? { controles: s.config.controlesLiberacion.map(texto => ({ texto, ok: false })), recibio: '' } : null);
  const [guardando, setGuardando] = useState(false);
  const componentes = useComponentes(equipo || null);
  const opciones = useMemo(() => (s.equipos ?? []).map(e => ({ value: e.id, label: `${e.codigo} — ${e.nombre}`, buscar: [e.sector, ...e.etiquetas] })), [s.equipos]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!equipo) { toast('Elegí el equipo.', 'error'); return; }
    if (!falla.trim()) { toast('Contá cuál fue la falla.', 'error'); return; }
    if (!solucion.trim()) { toast('Escribí el trabajo realizado.', 'error'); return; }
    const hh = totalHorasHombre(tecnicos);
    const h = hh ?? (horas.trim() ? Number(horas.replace(',', '.')) : null);
    if (h != null && (!Number.isFinite(h) || h < 0)) { toast('Las horas tienen que ser un número.', 'error'); return; }
    const hp = parada.trim() ? Number(parada.replace(',', '.')) : null;
    if (hp != null && (!Number.isFinite(hp) || hp < 0)) { toast('Las horas de parada tienen que ser un número.', 'error'); return; }
    setGuardando(true);
    try {
      const cuando = ahora();
      const numero = await s.cargarCorrectiva({
        equipoId: equipo, fecha, prioridad, falla: falla.trim(), causa: causa.trim(), solucion: solucion.trim(), horas: hh == null ? h : null, horasParada: hp,
        observaciones: obs.trim(), liberacion: liberacion ? { ...liberacion, recibio: liberacion.recibio.trim() } : null, tecnicos,
        // lo que se cargó es lo que se usó
        repuestos: limpiarLineas(repuestos).map(r => ({ ...r, usado: r.usado ?? r.cantidad })),
      });
      const llega = llegaEn(cuando, s.config.horarioRecepcion);
      toast(`${numeroOT(numero)} cargada. ${llega === cuando ? 'Le llega al jefe de taller para revisar.' : `Le llega al jefe de taller para revisar el ${momentoCorto(llega)}.`}`, 'success');
      onClose();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={enviar}>
      <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: '0 0 12px' }}>Para un trabajo que ya hiciste (por ejemplo, un llamado de guardia). Al guardarla le llega al jefe de taller para revisar.</p>
      <div className="form-grid">
        <div className="form-group full">
          <label htmlFor={`${uid}-eq`}>Equipo *</label>
          <Combobox id={`${uid}-eq`} value={equipo} onChange={setEquipo} opciones={opciones} placeholder="Buscá el equipo" disabled={!!equipoId} />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-f`}>Fecha en que se hizo</label>
          <Input id={`${uid}-f`} type="date" value={fecha} max={hoy} onChange={e => setFecha(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-hp`}>Horas de equipo parado</label>
          <Input id={`${uid}-hp`} inputMode="decimal" value={parada} onChange={e => setParada(e.target.value)} placeholder="Ej.: 3,5" />
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
          <label htmlFor={`${uid}-fa`}>Falla *</label>
          <Textarea id={`${uid}-fa`} data-autofocus value={falla} onChange={e => setFalla(e.target.value)} rows={2} placeholder="Qué pasó o qué avisaron. Ej.: hace ruido el rodamiento lado acople" maxLength={4000} />
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-ca`}>Causa de la falla</label>
          <Textarea id={`${uid}-ca`} rows={2} value={causa} onChange={e => setCausa(e.target.value)} placeholder="Por qué pasó. Ej.: falta de lubricación" maxLength={4000} />
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-so`}>Trabajo realizado *</label>
          <Textarea id={`${uid}-so`} rows={4} value={solucion} onChange={e => setSolucion(e.target.value)} placeholder="Contá qué hiciste para arreglarlo" maxLength={4000} />
        </div>
        <div className="form-group full">
          <label>Técnicos</label>
          <TecnicosEditor tecnicos={tecnicos} onChange={setTecnicos} fecha={fecha} />
          {totalHorasHombre(tecnicos) == null && (
            <div className="mt-rep-campo" style={{ marginTop: 8, maxWidth: 220 }}>
              <label htmlFor={`${uid}-h`}>O las horas de trabajo en total</label>
              <Input id={`${uid}-h`} inputMode="decimal" value={horas} onChange={e => setHoras(e.target.value)} />
            </div>
          )}
        </div>
        <div className="form-group full">
          <label>Repuestos que se usaron</label>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Se descuentan del stock cuando el responsable aprueba la OT. El precio suma a los costos del equipo.</div>
          <RepuestosEditor lineas={repuestos} onChange={setRepuestos} componentes={componentes} modo="cierre" conPrecio />
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-o`}>Observaciones (si quedó algo pendiente)</label>
          <Textarea id={`${uid}-o`} value={obs} onChange={e => setObs(e.target.value)} placeholder="Lo que quedó por hacer: el responsable lo puede pasar a una OT nueva al aprobar" maxLength={4000} />
        </div>
        {liberacion && (
          <div className="form-group full">
            <label id={`${uid}-lib`}>Liberación del equipo — verificación de entrega</label>
            <div className="mt-liberacion" role="group" aria-labelledby={`${uid}-lib`}>
              {liberacion.controles.map((c, i) => (
                <label key={i}>
                  <input type="checkbox" checked={c.ok} onChange={e => setLiberacion(l => l && { ...l, controles: l.controles.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)) })} />
                  {c.texto}
                </label>
              ))}
            </div>
            <div className="mt-rep-campo" style={{ marginTop: 8, maxWidth: 360 }}>
              <label htmlFor={`${uid}-rec`}>{s.config.recibeLiberacion || 'Recibió'}</label>
              <Input id={`${uid}-rec`} value={liberacion.recibio} onChange={e => setLiberacion(l => l && { ...l, recibio: e.target.value })} placeholder="Nombre de quien recibe el equipo" maxLength={120} />
            </div>
          </div>
        )}
      </div>
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={guardando}><Icono n="guardar" /> {guardando ? 'Guardando...' : 'Cargar OT'}</Button>
      </div>
    </form>
  );
}
