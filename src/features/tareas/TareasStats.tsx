import type { Tarea } from './useTareas';

interface Props {
  tareas: Tarea[];
}

export default function TareasStats({ tareas }: Props) {
  const pending = tareas.filter(t => t.status === 'pending');
  const red = pending.filter(t => t.traffic_level === 'red').length;
  const yellow = pending.filter(t => t.traffic_level === 'yellow').length;
  const green = pending.filter(t => t.traffic_level === 'green').length;
  const stagnant = pending.filter(t => t.is_stagnant).length;

  return (
    <div className="tareas-stats">
      <div className="tareas-stat stat-red"><div className="tareas-stat-number">{red}</div><div className="tareas-stat-label">Rojas</div></div>
      <div className="tareas-stat stat-yellow"><div className="tareas-stat-number">{yellow}</div><div className="tareas-stat-label">Amarillas</div></div>
      <div className="tareas-stat stat-green"><div className="tareas-stat-number">{green}</div><div className="tareas-stat-label">Verdes</div></div>
      <div className="tareas-stat stat-blue"><div className="tareas-stat-number">{stagnant}</div><div className="tareas-stat-label">Estancadas</div></div>
    </div>
  );
}
