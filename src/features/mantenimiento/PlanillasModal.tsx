import { useId, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { mensajeDeError } from '../../lib/errores';
import { filaNueva, filasDeTareas, tareasDeFilas, type FilaTarea } from './tareas';
import TareasEditor from './TareasEditor';
import { useEliminarPlanilla, useGuardarPlanilla, usePlanillasQuery, useRutinasQuery } from './usePreventivo';
import { useImprimirPlanilla } from './useImprimirOrdenes';
import type { PlanillaTareas } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Icono } from '@/components/Icono';

// Planillas de tareas armadas de antemano (ej.: "Bomba centrífuga – mensual"). Las rutinas las usan
// para cargar sus tareas solas; si la planilla cambia, cambian todas las rutinas que la usan.
// Cada planilla se puede imprimir en blanco para llevarla a cualquier equipo.

interface Props {
  open: boolean;
  onClose: () => void;
  esAdmin: boolean;
}

export default function PlanillasModal({ open, onClose, esAdmin }: Props) {
  const [editando, setEditando] = useState<PlanillaTareas | 'nueva' | null>(null);
  function cerrar() {
    setEditando(null);
    onClose();
  }
  return (
    <Modal open={open} onClose={cerrar} title={<><Icono n="lista" /> {editando ? (editando === 'nueva' ? 'Nueva planilla de tareas' : 'Editar planilla') : 'Planillas de tareas'}</>}>
      {open && (editando
        ? <Formulario key={editando === 'nueva' ? 'nueva' : editando.id} planilla={editando === 'nueva' ? null : editando} onVolver={() => setEditando(null)} />
        : <Lista esAdmin={esAdmin} onEditar={setEditando} />)}
    </Modal>
  );
}

function Lista({ esAdmin, onEditar }: { esAdmin: boolean; onEditar: (p: PlanillaTareas | 'nueva') => void }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const { data: planillas } = usePlanillasQuery();
  const { data: rutinas } = useRutinasQuery();
  const eliminar = useEliminarPlanilla();
  const imprimir = useImprimirPlanilla();
  const usos = (id: string) => rutinas.filter(r => r.planillaId === id).length;
  const ordenadas = [...planillas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  async function borrar(p: PlanillaTareas) {
    const n = usos(p.id);
    const aviso = n ? ` Las ${n === 1 ? 'rutina que la usa se queda' : `${n} rutinas que la usan se quedan`} con una copia de sus tareas.` : '';
    if (!(await confirmar(`¿Eliminar la planilla "${p.nombre}"?${aviso}`, { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    await eliminar.mutateAsync(p.id);
    toast('Planilla eliminada', 'success');
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: '0 0 12px' }}>
        Listas de tareas armadas de antemano. Al crear una rutina elegís la planilla y las tareas se cargan solas. Si cambiás una planilla, se actualizan todas las rutinas que la usan.
      </p>
      {esAdmin && (
        <div className="mt-acciones">
          <Button variant="primary" size="sm" onClick={() => onEditar('nueva')}><Icono n="mas" /> Nueva planilla</Button>
        </div>
      )}
      {!ordenadas.length && <div className="mt-vacio">Todavía no hay planillas.</div>}
      {ordenadas.map(p => {
        const n = usos(p.id);
        const meds = p.tareas.filter(t => t.medicion).length;
        return (
          <div key={p.id} className="mt-fila">
            <div className="mt-fila-cuerpo">
              <div className="mt-fila-titulo">{p.nombre}</div>
              <div className="mt-fila-sub">
                {[`${p.tareas.length} ${p.tareas.length === 1 ? 'tarea' : 'tareas'}`, meds > 0 && `${meds} con medición`, n ? `la usan ${n} ${n === 1 ? 'rutina' : 'rutinas'}` : 'ninguna rutina la usa'].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="mt-fila-acciones">
              <Button variant="ghost" size="icon" title="Imprimir planilla" aria-label={`Imprimir ${p.nombre}`} onClick={() => void imprimir(p)}><Icono n="imprimir" /></Button>
              {esAdmin && <Button variant="ghost" size="icon" title="Editar" aria-label={`Editar ${p.nombre}`} onClick={() => onEditar(p)}><Icono n="editar" /></Button>}
              {esAdmin && <Button variant="dangerGhost" size="icon" title="Eliminar" aria-label={`Eliminar ${p.nombre}`} onClick={() => void borrar(p)}><Icono n="borrar" /></Button>}
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
  const guardar = useGuardarPlanilla();
  const imprimir = useImprimirPlanilla();
  const { data: rutinas } = useRutinasQuery();
  const [nombre, setNombre] = useState(planilla?.nombre ?? '');
  const [notas, setNotas] = useState(planilla?.notas ?? '');
  const [filas, setFilas] = useState<FilaTarea[]>(() => (planilla ? filasDeTareas(planilla.tareas) : [filaNueva()]));
  const usos = planilla ? rutinas.filter(r => r.planillaId === planilla.id).length : 0;

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
    try {
      await guardar.mutateAsync({ ...p, id: planilla?.id });
      toast(usos ? `Planilla guardada. ${usos === 1 ? 'Se actualizó la rutina que la usa' : `Se actualizaron las ${usos} rutinas que la usan`}.` : 'Planilla guardada', 'success');
      onVolver();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    }
  }

  return (
    <form onSubmit={enviar}>
      <div className="form-grid">
        <div className="form-group full">
          <label htmlFor={`${uid}-n`}>Nombre *</label>
          <Input id={`${uid}-n`} data-autofocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej.: Bomba centrífuga – mensual" />
        </div>
        <div className="form-group full">
          <label>Tareas</label>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            Cada tarea se tilda en la OT. Si marcás "Anotar un valor", también pide un número (ej.: vibración en mm/s) y avisa si queda fuera del rango normal.
          </div>
          <TareasEditor filas={filas} onChange={setFilas} />
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-no`}>Notas (opcional)</label>
          <Textarea id={`${uid}-no`} rows={2} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Herramientas, cuidados, a qué equipos aplica..." />
        </div>
      </div>
      {usos > 0 && <p style={{ fontSize: 12, color: '#8a5a00', fontWeight: 700, margin: '10px 0 0' }}>La usan {usos} {usos === 1 ? 'rutina' : 'rutinas'}: al guardar se actualizan sus tareas y las de sus OT pendientes.</p>}
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onVolver}>Volver</Button>
        <Button type="button" variant="ghost" onClick={() => { const p = armar(); if (p) void imprimir(p); }}><Icono n="imprimir" /> Imprimir</Button>
        <Button type="submit" variant="primary"><Icono n="guardar" /> Guardar</Button>
      </div>
    </form>
  );
}

