import { useId, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { mensajeDeError } from '../../lib/errores';
import { useMantenimiento } from './servicio';
import type { Intervencion, Prioridad, TipoMantenimiento } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  /** Para editar una entrada existente. */
  intervencion?: Intervencion | null;
}

// Registrar en el historial algo que se hizo en el equipo, correctivo o preventivo (del diseño del socio). Quiénes lo hicieron se eligen de
// los técnicos de Mantenimiento. (Los repuestos que descuentan stock llegan con la etapa 2, junto con las órdenes de trabajo.)
export default function IntervencionForm(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} title={<><Icono n="historial" /> {props.intervencion ? 'Editar registro' : 'Registrar mantenimiento'}</>}>
      {props.open && <Formulario {...props} />}
    </Modal>
  );
}

function Formulario({ onClose, equipoId, intervencion }: Props) {
  const uid = useId();
  const toast = useToast();
  const s = useMantenimiento();
  const [tipo, setTipo] = useState<TipoMantenimiento>(intervencion?.tipo ?? 'correctivo');
  const [fecha, setFecha] = useState(intervencion?.fecha ?? fechaHoyISO());
  const [descripcion, setDescripcion] = useState(intervencion?.descripcion ?? '');
  const [tecnicos, setTecnicos] = useState<string[]>(intervencion?.tecnicos.flatMap(t => (t.id ? [t.id] : [])) ?? []);
  const [horas, setHoras] = useState(intervencion?.horas != null ? String(intervencion.horas) : '');
  const [repuestos, setRepuestos] = useState(intervencion?.repuestosUsados ?? '');
  const c = intervencion?.correctivo;
  const [prioridad, setPrioridad] = useState<Prioridad>(c?.prioridad ?? 'normal');
  const [falla, setFalla] = useState(c?.falla ?? '');
  const [causa, setCausa] = useState(c?.causa ?? '');
  const [solucion, setSolucion] = useState(c?.solucion ?? '');
  // las horas de equipo parado, también en los preventivos (para la disponibilidad)
  const [parada, setParada] = useState(intervencion?.horasParada != null ? String(intervencion.horasParada) : '');
  const [guardando, setGuardando] = useState(false);
  // los que figuran en el registro y ya no son técnicos (o se borraron) se siguen viendo, sin poder elegirse de nuevo
  const otros = (intervencion?.tecnicos ?? []).filter(t => !t.id || !s.tecnicos.some(x => x.id === t.id));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!descripcion.trim()) { toast('Contá qué se hizo.', 'error'); return; }
    const h = horas.trim() ? Number(horas.replace(',', '.')) : null;
    if (h != null && (!Number.isFinite(h) || h < 0)) { toast('Las horas tienen que ser un número.', 'error'); return; }
    const hp = parada.trim() ? Number(parada.replace(',', '.')) : null;
    if (hp != null && (!Number.isFinite(hp) || hp < 0)) { toast('Las horas de parada tienen que ser un número.', 'error'); return; }
    setGuardando(true);
    try {
      await s.guardarIntervencion({
        id: intervencion?.id ?? null, equipoId: intervencion?.equipoId ?? equipoId, fecha, tipo, descripcion: descripcion.trim(),
        tecnicos: [...tecnicos, ...otros.flatMap(t => (t.id ? [t.id] : []))], horas: h, repuestosUsados: repuestos.trim(),
        correctivo: tipo === 'correctivo' ? { prioridad, falla: falla.trim(), causa: causa.trim(), solucion: solucion.trim(), horasParada: hp } : null,
        horasParada: tipo === 'preventivo' ? hp : null,
      });
      toast('Guardado en el historial', 'success');
      onClose();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={enviar}>
      <div className="mt-chips" role="radiogroup" aria-label="Tipo de mantenimiento">
        {(['correctivo', 'preventivo'] as const).map(t => (
          <button key={t} type="button" role="radio" aria-checked={tipo === t} className={`mt-chip${tipo === t ? ' activo' : ''}`} onClick={() => setTipo(t)}>
            {t === 'correctivo' ? 'Correctivo (se rompió / falla)' : 'Preventivo (de rutina)'}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor={`${uid}-f`}>Fecha</label>
          <Input id={`${uid}-f`} type="date" value={fecha} max={fechaHoyISO()} onChange={e => setFecha(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-h`}>Horas de trabajo</label>
          <Input id={`${uid}-h`} inputMode="decimal" value={horas} onChange={e => setHoras(e.target.value)} placeholder="Ej.: 1,5" />
        </div>
        <fieldset className="form-group full" style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Realizado por</legend>
          {s.tecnicos.length || otros.length ? (
            <div className="mt-chips" style={{ flexWrap: 'wrap', marginBottom: 0 }}>
              {s.tecnicos.map(t => {
                const elegido = tecnicos.includes(t.id);
                return (
                  <button key={t.id} type="button" aria-pressed={elegido} className={`mt-chip${elegido ? ' activo' : ''}`}
                    onClick={() => setTecnicos(v => (elegido ? v.filter(x => x !== t.id) : [...v, t.id]))}>
                    {elegido && <Icono n="ok" />}{t.nombre}
                  </button>
                );
              })}
              {otros.map(t => <span key={t.nombre} className="mt-tag">{t.nombre}</span>)}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Todavía no hay técnicos: un dueño les da el rol en Configuración → Usuarios.</div>
          )}
        </fieldset>
        <div className="form-group full">
          <label htmlFor={`${uid}-d`}>Qué se hizo *</label>
          <Textarea id={`${uid}-d`} data-autofocus value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Falla encontrada y trabajo realizado" maxLength={4000} />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-hp`}>Horas de equipo parado</label>
          <Input id={`${uid}-hp`} inputMode="decimal" value={parada} onChange={e => setParada(e.target.value)} placeholder={tipo === 'correctivo' ? 'Ej.: 3,5' : 'Vacío si no se paró'} />
        </div>
        {tipo === 'correctivo' && (
          <>
            <div className="form-group">
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
              <label htmlFor={`${uid}-fa`}>Falla</label>
              <Textarea id={`${uid}-fa`} rows={2} value={falla} onChange={e => setFalla(e.target.value)} placeholder="Qué se vio o qué avisaron" maxLength={4000} />
            </div>
            <div className="form-group full">
              <label htmlFor={`${uid}-ca`}>Causa</label>
              <Textarea id={`${uid}-ca`} rows={2} value={causa} onChange={e => setCausa(e.target.value)} placeholder="Por qué pasó" maxLength={4000} />
            </div>
            <div className="form-group full">
              <label htmlFor={`${uid}-so`}>Solución</label>
              <Textarea id={`${uid}-so`} rows={2} value={solucion} onChange={e => setSolucion(e.target.value)} placeholder="Qué se hizo para arreglarlo" maxLength={4000} />
            </div>
          </>
        )}
        <div className="form-group full">
          <label htmlFor={`${uid}-r`}>Repuestos usados</label>
          <Input id={`${uid}-r`} value={repuestos} onChange={e => setRepuestos(e.target.value)} placeholder="Ej.: 2 rodamientos YAR 206, 1 sello" maxLength={2000} />
        </div>
      </div>
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={guardando}><Icono n="guardar" /> {guardando ? 'Guardando...' : 'Guardar'}</Button>
      </div>
    </form>
  );
}
