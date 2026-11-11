import { useId, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { mensajeDeError } from '../../lib/errores';
import { useComponentesDeEquipo, useRegistrarIntervencion } from './useEquipos';
import RepuestosEditor from './RepuestosEditor';
import { limpiarLineas } from './repuestos';
import type { Intervencion, Prioridad, RepuestoLinea, TipoMantenimiento } from './tipos';
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
  /** Sugerencias para "Realizado por". */
  personas: string[];
}

// Registrar en el historial algo que se hizo en el equipo (correctivo o preventivo).
export default function IntervencionForm(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} title={<><Icono n="historial" /> {props.intervencion ? 'Editar registro' : 'Registrar mantenimiento'}</>}>
      {props.open && <Formulario {...props} />}
    </Modal>
  );
}

function Formulario({ onClose, equipoId, intervencion, personas }: Props) {
  const uid = useId();
  const toast = useToast();
  const guardar = useRegistrarIntervencion();
  const [tipo, setTipo] = useState<TipoMantenimiento>(intervencion?.tipo ?? 'correctivo');
  const [fecha, setFecha] = useState(intervencion?.fecha ?? fechaHoyISO());
  const [descripcion, setDescripcion] = useState(intervencion?.descripcion ?? '');
  const [realizadoPor, setRealizadoPor] = useState(intervencion?.realizadoPor ?? '');
  const [horas, setHoras] = useState(intervencion?.horas != null ? String(intervencion.horas) : '');
  const [repuestosTexto, setRepuestosTexto] = useState(intervencion?.repuestosUsados ?? '');
  const [lineas, setLineas] = useState<RepuestoLinea[]>(intervencion?.repuestos ?? []);
  const [descontar, setDescontar] = useState(true);
  const c = intervencion?.correctivo;
  const [prioridad, setPrioridad] = useState<Prioridad>(c?.prioridad ?? 'normal');
  const [falla, setFalla] = useState(c?.falla ?? '');
  const [causa, setCausa] = useState(c?.causa ?? '');
  const [solucion, setSolucion] = useState(c?.solucion ?? '');
  const paradaGuardada = c?.horasParada ?? intervencion?.horasParada ?? null;
  const [parada, setParada] = useState(paradaGuardada != null ? String(paradaGuardada) : '');
  const componentes = useComponentesDeEquipo(intervencion?.equipoId ?? equipoId);
  const nueva = !intervencion;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!descripcion.trim()) { toast('Contá qué se hizo.', 'error'); return; }
    const h = horas.trim() ? Number(horas.replace(',', '.')) : null;
    if (h != null && (!Number.isFinite(h) || h < 0)) { toast('Las horas tienen que ser un número.', 'error'); return; }
    const hp = parada.trim() ? Number(parada.replace(',', '.')) : null;
    if (hp != null && (!Number.isFinite(hp) || hp < 0)) { toast('Las horas de parada tienen que ser un número.', 'error'); return; }
    const usados = limpiarLineas(lineas).filter(l => l.cantidad > 0).map(l => ({ ...l, usado: l.cantidad }));
    try {
      await guardar.mutateAsync({
        id: intervencion?.id, equipoId: intervencion?.equipoId ?? equipoId, fecha, tipo, descripcion: descripcion.trim(), realizadoPor: realizadoPor.trim(),
        horas: h, repuestosUsados: repuestosTexto.trim(), otId: intervencion?.otId ?? null,
        repuestos: usados, tareas: intervencion?.tareas ?? [], otNumero: intervencion?.otNumero ?? null,
        tecnicos: intervencion?.tecnicos ?? [], liberacion: intervencion?.liberacion ?? null,
        correctivo: tipo === 'correctivo' ? { prioridad, falla: falla.trim(), causa: causa.trim(), solucion: solucion.trim(), horasParada: hp } : null,
        horasParada: tipo === 'preventivo' ? hp : null,
        descontarStock: nueva && descontar,
      });
      const descontados = nueva && descontar ? usados.filter(l => l.codigo).length : 0;
      toast(descontados ? `Guardado en el historial. Se descontaron ${descontados === 1 ? '1 repuesto' : `${descontados} repuestos`} del stock.` : 'Guardado en el historial', 'success');
      onClose();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
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
          <Input id={`${uid}-f`} type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-p`}>Realizado por</label>
          <Input id={`${uid}-p`} list={`${uid}-personas`} value={realizadoPor} onChange={e => setRealizadoPor(e.target.value)} />
          <datalist id={`${uid}-personas`}>{personas.map(p => <option key={p} value={p} />)}</datalist>
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-d`}>Qué se hizo *</label>
          <Textarea id={`${uid}-d`} data-autofocus value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Falla encontrada y trabajo realizado" />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-h`}>Horas de trabajo</label>
          <Input id={`${uid}-h`} inputMode="decimal" value={horas} onChange={e => setHoras(e.target.value)} placeholder="Ej.: 1,5" />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-hp`}>Horas de equipo parado</label>
          <Input id={`${uid}-hp`} inputMode="decimal" value={parada} onChange={e => setParada(e.target.value)} placeholder={tipo === 'correctivo' ? 'Ej.: 3,5' : 'Vacío si no se paró'} />
        </div>
        {tipo === 'correctivo' && (
          <>
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
              <label htmlFor={`${uid}-fa`}>Falla</label>
              <Textarea id={`${uid}-fa`} rows={2} value={falla} onChange={e => setFalla(e.target.value)} placeholder="Qué se vio o qué avisaron" />
            </div>
            <div className="form-group full">
              <label htmlFor={`${uid}-ca`}>Causa</label>
              <Textarea id={`${uid}-ca`} rows={2} value={causa} onChange={e => setCausa(e.target.value)} placeholder="Por qué pasó" />
            </div>
            <div className="form-group full">
              <label htmlFor={`${uid}-so`}>Solución</label>
              <Textarea id={`${uid}-so`} rows={2} value={solucion} onChange={e => setSolucion(e.target.value)} placeholder="Qué se hizo para arreglarlo" />
            </div>
          </>
        )}
        <div className="form-group full">
          <label>Repuestos usados</label>
          <RepuestosEditor lineas={lineas} onChange={setLineas} componentes={componentes} conPrecio />
          {nueva && lineas.some(l => l.codigo.trim()) && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontWeight: 700, marginTop: 8 }}>
              <input type="checkbox" checked={descontar} onChange={e => setDescontar(e.target.checked)} style={{ width: 18, height: 18 }} />
              Descontarlos del stock del Depósito
            </label>
          )}
          {!nueva && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Cambiar los repuestos acá no modifica el stock.</div>}
        </div>
        {repuestosTexto && (
          <div className="form-group full">
            <label htmlFor={`${uid}-r`}>Otros repuestos (texto)</label>
            <Input id={`${uid}-r`} value={repuestosTexto} onChange={e => setRepuestosTexto(e.target.value)} />
          </div>
        )}
      </div>
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary"><Icono n="guardar" /> Guardar</Button>
      </div>
    </form>
  );
}
