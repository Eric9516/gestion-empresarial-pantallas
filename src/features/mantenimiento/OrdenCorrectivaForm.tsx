import { useId, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { mensajeDeError } from '../../lib/errores';
import { normalizar } from './buscador';
import { ahora, horaDeAhora } from './flujo';
import { liberacionInicial, totalHorasHombre } from './preventivo';
import { limpiarLineas } from './repuestos';
import { useComponentesDeEquipo, useEquiposQuery, useSectoresMantenimiento } from './useEquipos';
import { useCargarCorrectiva, useConfigMantenimiento } from './usePreventivo';
import { useUsuarioMantenimiento } from './usuarioMantenimiento';
import RepuestosEditor from './RepuestosEditor';
import TecnicosEditor from './TecnicosEditor';
import { nuevoId } from './almacenDemo';
import type { Liberacion, Prioridad, RepuestoLinea, TrabajoTecnico } from './tipos';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Equipo ya elegido (si se carga desde la ficha del equipo). */
  equipoId?: string;
}

// OT correctiva que carga el técnico DESPUÉS de hacer el trabajo (por ejemplo, un llamado al teléfono de guardia):
// sector y equipo, problema, causa, solución, lo que se hizo y lo que quedó pendiente, técnicos con horarios,
// repuestos, horas de parada y liberación. Queda "para revisar": la revisa el jefe de taller y la aprueba el responsable.
export default function OrdenCorrectivaForm(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} title={<><Icono n="herramienta" /> Cargar OT correctiva</>}>
      {props.open && <Formulario {...props} />}
    </Modal>
  );
}

function aNumero(t: string): number | null | 'error' {
  const s = t.trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 'error';
}

function Formulario({ onClose, equipoId }: Props) {
  const uid = useId();
  const toast = useToast();
  const cargar = useCargarCorrectiva();
  const config = useConfigMantenimiento();
  const usuario = useUsuarioMantenimiento();
  const { data: equipos } = useEquiposQuery();
  const sectores = useSectoresMantenimiento();
  const hoy = fechaHoyISO();
  const inicial = equipos.find(e => e.id === equipoId);
  const [sector, setSector] = useState(inicial?.sector ?? '');
  const [equipo, setEquipo] = useState(equipoId ?? '');
  const [fecha, setFecha] = useState(hoy);
  const [prioridad, setPrioridad] = useState<Prioridad>('urgente');
  const [falla, setFalla] = useState('');
  const [causa, setCausa] = useState('');
  const [solucion, setSolucion] = useState('');
  const [parada, setParada] = useState('');
  const [horas, setHoras] = useState('');
  const [obs, setObs] = useState('');
  const [lineas, setLineas] = useState<RepuestoLinea[]>([]);
  const [tecnicos, setTecnicos] = useState<TrabajoTecnico[]>(() => [{ id: nuevoId(), nombre: usuario.persona.nombre, fecha: hoy, inicio: '', fin: horaDeAhora() }]);
  const [liberacion, setLiberacion] = useState<Liberacion | null>(() => liberacionInicial(config));
  const componentes = useComponentesDeEquipo(equipo || null);

  // Equipos del sector elegido (o todos, si no se eligió sector), con sus sub-equipos.
  const opciones = useMemo(() => equipos
    .filter(e => !sector || normalizar(e.sector) === normalizar(sector))
    .map(e => ({ value: e.id, label: `${e.codigo} — ${e.nombre}`, buscar: [e.sector, e.subsector, ...e.etiquetas] })), [equipos, sector]);

  function elegirEquipo(id: string) {
    setEquipo(id);
    const e = equipos.find(x => x.id === id);
    if (e && !sector) setSector(e.sector);
  }

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!equipo) { toast('Elegí el sector y el equipo.', 'error'); return; }
    if (!falla.trim()) { toast('Contá cuál fue el problema.', 'error'); return; }
    if (!solucion.trim()) { toast('Escribí el trabajo realizado.', 'error'); return; }
    const hp = aNumero(parada);
    const h = aNumero(horas);
    if (hp === 'error' || h === 'error') { toast('Las horas tienen que ser un número.', 'error'); return; }
    const conNombre = tecnicos.filter(t => t.nombre.trim()).map(t => ({ ...t, nombre: t.nombre.trim() }));
    if (!conNombre.length) { toast('Agregá al menos un técnico.', 'error'); return; }
    try {
      const numero = await cargar.mutateAsync({
        cuando: ahora(), quien: usuario.persona,
        datos: {
          equipoId: equipo, fecha, prioridad, falla: falla.trim(), causa: causa.trim(), solucion: solucion.trim(),
          tecnicos: conNombre, horas: totalHorasHombre(conNombre) ?? h, horasParada: hp,
          repuestos: limpiarLineas(lineas).filter(l => l.cantidad > 0), observaciones: obs.trim(),
          liberacion: liberacion ? { ...liberacion, recibio: liberacion.recibio.trim() } : null,
        },
      });
      toast(`${numero} cargada. Le llega al jefe de taller para revisar.`, 'success');
      onClose();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    }
  }

  return (
    <form onSubmit={enviar}>
      <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: '0 0 12px' }}>
        Para un trabajo que ya hiciste (por ejemplo, un llamado de guardia). Al guardarla le llega al jefe de taller para revisar y después al responsable para aprobar.
      </p>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor={`${uid}-s`}>Sector *</label>
          <Select id={`${uid}-s`} value={sector} onChange={e => { setSector(e.target.value); setEquipo(''); }}>
            <option value="">Todos los sectores</option>
            {sectores.map(s => <option key={s.nombre} value={s.nombre}>{s.nombre}</option>)}
          </Select>
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-eq`}>Equipo *</label>
          <Combobox id={`${uid}-eq`} value={equipo} onChange={elegirEquipo} opciones={opciones} placeholder="Buscá el equipo" />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-f`}>Fecha del trabajo</label>
          <Input id={`${uid}-f`} type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Prioridad</label>
          <div className="mt-chips" role="radiogroup" aria-label="Prioridad" style={{ marginBottom: 0 }}>
            {(['urgente', 'normal'] as const).map(p => (
              <button key={p} type="button" role="radio" aria-checked={prioridad === p} className={`mt-chip${prioridad === p ? ' activo' : ''}${p === 'urgente' ? ' alerta' : ''}`} onClick={() => setPrioridad(p)}>
                {p === 'urgente' ? 'Urgente' : 'Normal'}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-fa`}>Problema *</label>
          <Textarea id={`${uid}-fa`} rows={2} value={falla} onChange={e => setFalla(e.target.value)} placeholder="Qué pasaba. Ej.: la cinta se frena" />
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-ca`}>Causa</label>
          <Textarea id={`${uid}-ca`} rows={2} value={causa} onChange={e => setCausa(e.target.value)} placeholder="Por qué pasó" />
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-so`}>Trabajo realizado *</label>
          <Textarea id={`${uid}-so`} rows={4} value={solucion} onChange={e => setSolucion(e.target.value)} placeholder="Contá qué hiciste para arreglarlo. Ej.: se destrabó el rodillo y se engrasó" />
        </div>
        <div className="form-group full">
          <label>Técnicos</label>
          <TecnicosEditor tecnicos={tecnicos} onChange={setTecnicos} personas={usuario.tecnicos.map(t => t.nombre)} fecha={fecha} />
          {totalHorasHombre(tecnicos) == null && (
            <div className="mt-rep-campo" style={{ marginTop: 8, maxWidth: 220 }}>
              <label htmlFor={`${uid}-ht`}>O las horas de trabajo en total</label>
              <Input id={`${uid}-ht`} inputMode="decimal" value={horas} onChange={e => setHoras(e.target.value)} />
            </div>
          )}
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-hp`}>Horas de equipo parado</label>
          <Input id={`${uid}-hp`} inputMode="decimal" value={parada} onChange={e => setParada(e.target.value)} placeholder="Ej.: 3,5" />
        </div>
        <div className="form-group full">
          <label>Repuestos usados</label>
          <RepuestosEditor lineas={lineas} onChange={setLineas} componentes={componentes} conPrecio />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Se descuentan del stock cuando el responsable aprueba la OT.</div>
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-o`}>Observaciones</label>
          <Textarea id={`${uid}-o`} rows={3} value={obs} onChange={e => setObs(e.target.value)} placeholder="Si quedó algo pendiente, anotalo acá. Ej.: falta cambiar el rodamiento del rodillo" />
        </div>
        {liberacion && (
          <div className="form-group full">
            <label>Liberación del equipo — verificación de entrega</label>
            <div className="mt-liberacion">
              {liberacion.controles.map((c, i) => (
                <label key={i}>
                  <input type="checkbox" checked={c.ok} onChange={e => setLiberacion(l => l && { ...l, controles: l.controles.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)) })} />
                  {c.texto}
                </label>
              ))}
            </div>
            <div className="mt-rep-campo" style={{ marginTop: 8 }}>
              <label htmlFor={`${uid}-rec`}>{config.recibeLiberacion || 'Recibió'}</label>
              <Input id={`${uid}-rec`} value={liberacion.recibio} onChange={e => setLiberacion(l => l && { ...l, recibio: e.target.value })} placeholder="Nombre de quien recibe el equipo" />
            </div>
          </div>
        )}
      </div>
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary"><Icono n="guardar" /> Guardar y mandar a revisar</Button>
      </div>
    </form>
  );
}
