import { useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import ReprogramarModal from './ReprogramarModal';
import TareaForm from './TareaForm';
import { useCancelarTarea, useCompletarTarea, useTareaHistorialQuery, useTareasQuery } from './useTareas';
import { Button } from '@/components/ui/button';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';
import type { ReactNode } from 'react';

const TRAFFIC_LABEL: Record<string, string> = { green: 'Normal', yellow: 'Atención', red: 'Crítica' };
const ESTADO_LABEL: Record<string, string> = { pending: 'Pendiente', completed: 'Completada', cancelled: 'Cancelada' };
const ACCION_LABELS: Record<string, ReactNode> = {
  created: <><Icono n="nuevo" /> Creada</>, edited: <><Icono n="editar" /> Editada</>, completed: <><Icono n="exito" /> Completada</>, cancelled: <><Icono n="fallo" /> Cancelada</>,
  carried: <><Icono n="repetir" /> Arrastrada</>, reprogrammed: <><Icono n="fecha" /> Reprogramada</>, traffic_changed: <><Icono n="semaforo" /> Semáforo</>, stagnant_detected: <><Icono n="alerta" /> Estancada</>,
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

interface Props {
  open: boolean;
  onClose: () => void;
  taskId: string | null;
}

export default function TareaDetailModal({ open, onClose, taskId }: Props) {
  const toast = useToast();
  const confirmar = useConfirm();
  const { data: tareas } = useTareasQuery();
  const { data: historial } = useTareaHistorialQuery(taskId);
  const completarTarea = useCompletarTarea();
  const cancelarTarea = useCancelarTarea();
  const [reprogramarOpen, setReprogramarOpen] = useState(false);
  const [editarOpen, setEditarOpen] = useState(false);

  const t = tareas?.find(x => x.id === taskId);
  if (!t) return null;

  async function handleCompletar() {
    if (!t) return;
    try {
      await completarTarea.mutateAsync(t.id);
      toast('Tarea completada', 'success');
      onClose();
    } catch (e) {
      toast('Error: ' + mensajeDeError(e), 'error');
    }
  }

  async function handleCancelar() {
    if (!t || !(await confirmar('¿Cancelar esta tarea?', { textoConfirmar: 'Cancelar tarea' }))) return;
    try {
      await cancelarTarea.mutateAsync(t.id);
      toast('Tarea cancelada', 'success');
      onClose();
    } catch (e) {
      toast('Error: ' + mensajeDeError(e), 'error');
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={<><span className="accent"><Icono n="semaforo" /></span> {t.title}</>}
        large
        footer={t.status === 'pending' ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cerrar</Button>
            <Button variant="ghost" onClick={() => setEditarOpen(true)}><Icono n="editar" /> Editar</Button>
            <Button variant="ghost" onClick={() => setReprogramarOpen(true)}><Icono n="fecha" /> Reprogramar</Button>
            <Button variant="dangerGhost" onClick={() => void handleCancelar()}><Icono n="fallo" /> Cancelar</Button>
            <Button variant="success" onClick={() => void handleCompletar()}><Icono n="ok" /> Completar</Button>
          </>
        ) : undefined}
      >
        <div className="detail-grid">
          <div className="detail-item"><label>Estado</label><div className="value"><span className={`badge ${t.status === 'pending' ? 'badge-active' : 'badge-inactive'}`}>{ESTADO_LABEL[t.status] || t.status}</span></div></div>
          <div className="detail-item"><label>Semáforo</label><div className="value"><span className={`traffic-badge ${t.traffic_level}`}>{TRAFFIC_LABEL[t.traffic_level] || t.traffic_level}</span></div></div>
          <div className="detail-item"><label>Fecha inicio</label><div className="value">{formatDate(t.start_date)}</div></div>
          <div className="detail-item"><label>Fecha asignada</label><div className="value">{formatDate(t.assigned_date)}</div></div>
          <div className="detail-item"><label>Días pendiente</label><div className="value">{t.pending_days}</div></div>
          <div className="detail-item"><label>Arrastres</label><div className="value">{t.carry_count}</div></div>
          <div className="detail-item"><label>Estancada</label><div className="value">{t.is_stagnant ? <span className="stagnant-badge"><Icono n="alerta" /> Sí</span> : 'No'}</div></div>
        </div>
        {t.description && (
          <div className="detail-section">
            <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>Descripción</label>
            <p style={{ marginTop: 4, fontSize: 14, color: 'var(--text-mid)' }}>{t.description}</p>
          </div>
        )}
        {t.is_stagnant && t.status === 'pending' && (
          <div style={{ background: '#fff3e0', border: '1.5px solid #ffe0b2', borderRadius: 'var(--radius-sm)', padding: 14, marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e65100', marginBottom: 4 }}><Icono n="alerta" /> Tarea estancada</div>
            <div style={{ fontSize: 12, color: '#bf360c', lineHeight: 1.5 }}>Esta tarea lleva varios días pendiente y requiere una decisión para que no siga acumulándose.</div>
          </div>
        )}
        <div className="divider" />
        <div style={{ fontWeight: 700, color: 'var(--blue)', marginBottom: 12, fontSize: 13 }}><Icono n="lista" /> Historial</div>
        {!historial?.length ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Sin registros</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {historial.map(h => (
              <div key={h.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--text-mid)' }}>{ACCION_LABELS[h.action] || h.action}</span>
                <span style={{ color: 'var(--text-muted)', flex: 1 }}>{h.note || ''}</span>
                <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 11 }}>{new Date(h.created_at).toLocaleDateString('es-AR')}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
      <ReprogramarModal open={reprogramarOpen} onClose={() => setReprogramarOpen(false)} taskId={t.id} onReprogramada={onClose} />
      <TareaForm open={editarOpen} onClose={() => setEditarOpen(false)} tarea={t} />
    </>
  );
}
