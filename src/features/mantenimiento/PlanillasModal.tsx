import { useId, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { mensajeDeError } from '../../lib/errores';
import { filaNueva, filasDeTareas, tareasDeFilas, type FilaTarea } from './filasDeTareas';
import TareasEditor from './TareasEditor';
import { useImprimirPlanilla } from './otPdf';
import { useMantenimiento } from './servicio';
import type { PlanillaTareas } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Icono } from '@/components/Icono';

// Planillas de tareas armadas de antemano (del diseño del socio; ej.: "Bomba centrífuga – mensual"). Las rutinas las usan para cargar sus
// tareas solas; si la planilla cambia, cambian todas las rutinas que la usan (y sus OT pendientes). Cada planilla se puede imprimir en
// blanco para llevarla a cualquier equipo. Crearlas y cambiarlas: quien administra; el resto las ve e imprime.

export default function PlanillasModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [editando, setEditando] = useState<PlanillaTareas | 'nueva' | null>(null);
  function cerrar() {
    setEditando(null);
    onClose();
  }
  return (
    <Modal open={open} onClose={cerrar} large title={<><Icono n="planilla" /> {editando ? (editando === 'nueva' ? 'Nueva planilla de tareas' : 'Editar planilla') : 'Planillas de tareas'}</>}>
      {open && (editando
        ? <Formulario key={editando === 'nueva' ? 'nueva' : editando.id} planilla={editando === 'nueva' ? null : editando} onVolver={() => setEditando(null)} />
        : <Lista onEditar={setEditando} />)}
    </Modal>
  );
}

function Lista({ onEditar }: { onEditar: (p: PlanillaTareas | 'nueva') => void }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const s = useMantenimiento();
  const imprimir = useImprimirPlanilla();
  const usos = (id: string) => (s.rutinas ?? []).filter(r => r.planillaId === id).length;

  async function borrar(p: PlanillaTareas) {
    const n = usos(p.id);
    const aviso = n ? ` ${n === 1 ? 'La rutina que la usa se queda' : `Las ${n} rutinas que la usan se quedan`} con una copia de sus tareas.` : '';
    if (!(await confirmar(`¿Eliminar la planilla "${p.nombre}"?${aviso}`, { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    try {
      await s.eliminarPlanilla(p.id);
      toast('Planilla eliminada', 'success');
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    }
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: '0 0 12px' }}>
        Listas de tareas armadas de antemano. Al crear una rutina elegís la planilla y las tareas se cargan solas. Si cambiás una planilla, se actualizan todas las rutinas que la usan.
      </p>
      {s.esAdmin && (
        <div className="mt-acciones">
          <Button variant="primary" size="sm" onClick={() => onEditar('nueva')}><Icono n="mas" /> Nueva planilla</Button>
        </div>
      )}
      {!s.planillas.length && <div className="mt-vacio">Todavía no hay planillas.</div>}
      {s.planillas.map(p => {
        const n = usos(p.id);
        const meds = p.tareas.filter(t => t.medicion).length;
        return (
          <div key={p.id} className="mt-fila">
            <div className="mt-fila-cuerpo">
              <div className="mt-fila-titulo">{p.nombre}</div>
              <div className="mt-fila-sub">
                {[`${p.tareas.length} ${p.tareas.length === 1 ? 'tarea' : 'tareas'}`, meds > 0 && `${meds} con medición`, n ? `la ${n === 1 ? 'usa 1 rutina' : `usan ${n} rutinas`}` : 'ninguna rutina la usa'].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="mt-fila-acciones">
              <Button variant="ghost" size="icon" title="Imprimir en blanco" aria-label={`Imprimir ${p.nombre}`} onClick={() => void imprimir(p)}><Icono n="imprimir" /></Button>
              {s.esAdmin && <Button variant="ghost" size="icon" title="Editar" aria-label={`Editar ${p.nombre}`} onClick={() => onEditar(p)}><Icono n="editar" /></Button>}
              {s.esAdmin && <Button variant="dangerGhost" size="icon" title="Eliminar" aria-label={`Eliminar ${p.nombre}`} onClick={() => void borrar(p)}><Icono n="borrar" /></Button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Formulario({ planilla, onVolver }: { planilla: PlanillaTareas | null; onVolver: () => void }) {
  const uid = useId();
  const toast = useToast();
  const s = useMantenimiento();
  const imprimir = useImprimirPlanilla();
  const [nombre, setNombre] = useState(planilla?.nombre ?? '');
  const [notas, setNotas] = useState(planilla?.notas ?? '');
  const [filas, setFilas] = useState<FilaTarea[]>(() => (planilla ? filasDeTareas(planilla.tareas) : [filaNueva()]));
  const [guardando, setGuardando] = useState(false);
  const usos = planilla ? (s.rutinas ?? []).filter(r => r.planillaId === planilla.id).length : 0;

  function armar(): PlanillaTareas | null {
    if (!nombre.trim()) { toast('Poné un nombre a la planilla.', 'error'); return null; }
    const r = tareasDeFilas(filas);
    if ('error' in r) { toast(r.error, 'error'); return null; }
    if (!r.tareas.length) { toast('Agregá al menos una tarea.', 'error'); return null; }
    return { id: planilla?.id ?? '', nombre: nombre.trim(), notas: notas.trim(), tareas: r.tareas };
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const p = armar();
    if (!p) return;
    setGuardando(true);
    try {
      const n = await s.guardarPlanilla({ ...p, id: planilla?.id ?? null });
      toast(n ? `Planilla guardada. ${n === 1 ? 'Se actualizó la rutina que la usa' : `Se actualizaron las ${n} rutinas que la usan`}.` : 'Planilla guardada', 'success');
      onVolver();
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
          <label htmlFor={`${uid}-n`}>Nombre *</label>
          <Input id={`${uid}-n`} data-autofocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej.: Bomba centrífuga – mensual" maxLength={160} />
        </div>
        <div className="form-group full">
          <label>Tareas</label>
          <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 6 }}>
            Cada tarea se tilda en la OT. Si marcás "Anotar un valor", también pide un número (ej.: vibración en mm/s) y avisa si queda fuera del rango normal.
          </div>
          <TareasEditor filas={filas} onChange={setFilas} />
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-no`}>Notas (opcional)</label>
          <Textarea id={`${uid}-no`} rows={2} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Herramientas, cuidados, a qué equipos aplica..." maxLength={2000} />
        </div>
      </div>
      {usos > 0 && <p style={{ fontSize: 12, color: '#8a5a00', fontWeight: 700, margin: '10px 0 0' }}>La {usos === 1 ? 'usa 1 rutina' : `usan ${usos} rutinas`}: al guardar se actualizan sus tareas y las de sus OT pendientes.</p>}
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onVolver}>Volver</Button>
        <Button type="button" variant="ghost" onClick={() => { const p = armar(); if (p) void imprimir(p); }}><Icono n="imprimir" /> Imprimir</Button>
        <Button type="submit" variant="primary" disabled={guardando}><Icono n="guardar" /> {guardando ? 'Guardando...' : 'Guardar'}</Button>
      </div>
    </form>
  );
}
