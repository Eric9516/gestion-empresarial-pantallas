import { clicConTeclado } from '@/lib/clicConTeclado';
import type { Tarea } from './useTareas';
import { Icono } from '@/components/Icono';

const TRAFFIC_LABEL: Record<string, string> = { green: 'Normal', yellow: 'Atención', red: 'Crítica' };

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

interface Props {
  tarea: Tarea;
  grid?: boolean;
  onOpen: (id: string) => void;
  onCompletar: (id: string) => void;
}

export default function TareaCard({ tarea: t, grid, onOpen, onCompletar }: Props) {
  const isCompleted = t.status === 'completed';

  const titulo = <div className="task-card-title">{isCompleted ? <s style={{ opacity: 0.5 }}>{t.title}</s> : t.title}</div>;
  const badge = <span className={`traffic-badge ${t.traffic_level}`}>{TRAFFIC_LABEL[t.traffic_level] || t.traffic_level}</span>;
  const stagnant = t.is_stagnant ? <span className="stagnant-badge"><Icono n="alerta" /></span> : null;
  const desc = t.description ? <div className="task-card-desc">{t.description}</div> : null;
  const meta = (
    <div className="task-card-meta">
      <span className="task-meta-item"><Icono n="fecha" /> {formatDate(t.start_date)}</span>
      <span className="task-meta-item"><Icono n="espera" /> {t.pending_days}d</span>
      {t.carry_count > 0 && <span className="task-meta-item"><Icono n="repetir" /> {t.carry_count}</span>}
    </div>
  );
  const completeBtn = !isCompleted ? (
    <button className="task-action-btn complete" onClick={e => { e.stopPropagation(); onCompletar(t.id); }}><Icono n="ok" /></button>
  ) : null;

  if (grid) {
    return (
      <div className={`task-card ${t.traffic_level}`} {...clicConTeclado(() => onOpen(t.id))}>
        <div className="task-card-top">{titulo}{badge} {stagnant}</div>
        {desc}
        {meta}
        {!isCompleted && <div className="task-card-bottom">{completeBtn}</div>}
      </div>
    );
  }

  return (
    <div className={`task-card ${t.traffic_level}`} {...clicConTeclado(() => onOpen(t.id))}>
      <div className="task-card-body">
        <div className="task-card-top">{titulo}{badge} {stagnant}</div>
        {desc}
        {meta}
      </div>
      <div className="task-card-actions">{completeBtn}</div>
    </div>
  );
}
