import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import TareaCard from './TareaCard';
import TareaDetailModal from './TareaDetailModal';
import TareaForm from './TareaForm';
import TareasStats from './TareasStats';
import { useCompletarTarea, useProcesarTareasPendientes, useTareasQuery, type Tarea } from './useTareas';
import { Button } from '@/components/ui/button';
import { mensajeDeError } from '@/lib/errores';
import { Icono, Punto } from '@/components/Icono';
import type { ReactNode } from 'react';

type Filtro = 'todas' | 'green' | 'yellow' | 'red' | 'stagnant' | 'completed';
type Vista = 'wide' | 'list' | 'grid';

const FILTROS: { id: Filtro; label: ReactNode; dot?: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'red', label: 'Rojas', dot: 'dot-red' },
  { id: 'yellow', label: 'Amarillas', dot: 'dot-yellow' },
  { id: 'green', label: 'Verdes', dot: 'dot-green' },
  { id: 'stagnant', label: <><Icono n="alerta" /> Estancadas</> },
  { id: 'completed', label: <><Icono n="ok" /> Completadas</> },
];

const VISTAS: { id: Vista; icon: ReactNode; label: string }[] = [
  { id: 'wide', icon: <Icono n="ancho" />, label: 'Cards anchas' },
  { id: 'list', icon: <Icono n="vistaLista" />, label: 'Lista' },
  { id: 'grid', icon: <Icono n="vistaGrilla" />, label: 'Cuadrícula' },
];

const EMPTY_MSG: Record<Filtro, { icon: ReactNode; title: string; desc: string }> = {
  todas: { icon: <Icono n="semaforo" />, title: 'Sin tareas pendientes', desc: 'Creá tu primera tarea para empezar.' },
  completed: { icon: <Icono n="exito" />, title: 'Sin tareas completadas', desc: 'Completá tareas para verlas acá.' },
  stagnant: { icon: <Icono n="objetivo" />, title: 'Sin tareas estancadas', desc: '¡Bien! No tenés tareas acumuladas.' },
  green: { icon: <><Punto color="var(--success)" /></>, title: 'Sin tareas verdes', desc: '' },
  yellow: { icon: <><Punto color="var(--warning, #d4a017)" /></>, title: 'Sin tareas amarillas', desc: '' },
  red: { icon: <><Punto color="var(--danger)" /></>, title: 'Sin tareas rojas', desc: '' },
};

const ORDEN_SEMAFORO: Record<string, number> = { red: 0, yellow: 2, green: 3 };

function ordenarTareas(tareas: Tarea[]) {
  return [...tareas].sort((a, b) => {
    const aOrder = a.is_stagnant && a.traffic_level !== 'red' ? 1 : (ORDEN_SEMAFORO[a.traffic_level] ?? 3);
    const bOrder = b.is_stagnant && b.traffic_level !== 'red' ? 1 : (ORDEN_SEMAFORO[b.traffic_level] ?? 3);
    return aOrder - bOrder;
  });
}

export default function TareasScreen() {
  const { data: tareas, isLoading, isError } = useTareasQuery();
  const procesarPendientes = useProcesarTareasPendientes();
  const completarTarea = useCompletarTarea();
  const toast = useToast();

  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [vista, setVista] = useState<Vista>('wide');
  const [vistaDropdownOpen, setVistaDropdownOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const procesadoRef = useRef(false);

  useEffect(() => {
    if (procesadoRef.current) return;
    procesadoRef.current = true;
    procesarPendientes.mutate();
  }, [procesarPendientes]);

  // El botón flotante "+" (mobile) y el padding extra del contenido solo
  // aplican mientras esta pestaña está activa — ver body.tareas-mode en tareas.css.
  useEffect(() => {
    document.body.classList.add('tareas-mode');
    return () => document.body.classList.remove('tareas-mode');
  }, []);

  const visibles = useMemo(() => {
    let lista = (tareas ?? []).filter(t => t.status === 'pending');
    switch (filtro) {
      case 'green': lista = lista.filter(t => t.traffic_level === 'green'); break;
      case 'yellow': lista = lista.filter(t => t.traffic_level === 'yellow'); break;
      case 'red': lista = lista.filter(t => t.traffic_level === 'red'); break;
      case 'stagnant': lista = lista.filter(t => t.is_stagnant); break;
      case 'completed': lista = (tareas ?? []).filter(t => t.status === 'completed'); break;
      default: break;
    }
    return filtro === 'todas' ? ordenarTareas(lista) : lista;
  }, [tareas, filtro]);

  async function handleCompletar(id: string) {
    try {
      await completarTarea.mutateAsync(id);
      toast('Tarea completada', 'success');
    } catch (e) {
      toast('Error: ' + mensajeDeError(e), 'error');
    }
  }

  const emptyMsg = EMPTY_MSG[filtro];

  return (
    <div>
      <div className="section-header">
        <div className="section-title" />
        <div className="section-actions">
          <Button variant="primary" size="sm" onClick={() => setFormOpen(true)}>+ Nueva tarea</Button>
        </div>
      </div>

      <TareasStats tareas={tareas ?? []} />

      <div className="tareas-toolbar">
        <div className="tareas-filters">
          {FILTROS.map(f => (
            <button key={f.id} className={`tareas-filter-btn${filtro === f.id ? ' active' : ''}`} onClick={() => setFiltro(f.id)}>
              {f.dot && <span className={`filter-dot ${f.dot}`} />}{f.label}
            </button>
          ))}
        </div>
        <div className="vista-selector">
          <button className="vista-btn" onClick={() => setVistaDropdownOpen(v => !v)}>
            <span>{VISTAS.find(v => v.id === vista)?.icon}</span> Vista
          </button>
          <div className={`vista-dropdown${vistaDropdownOpen ? ' open' : ''}`}>
            {VISTAS.map(v => (
              <button key={v.id} className={`vista-option${vista === v.id ? ' active' : ''}`} onClick={() => { setVista(v.id); setVistaDropdownOpen(false); }}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {isError && <p style={{ color: 'var(--danger)' }}>Error al cargar tareas.</p>}

      {!isLoading && !isError && (
        visibles.length === 0 ? (
          <div className="tareas-empty">
            <div className="tareas-empty-icon">{emptyMsg.icon}</div>
            <h2>{emptyMsg.title}</h2>
            <p>{emptyMsg.desc}</p>
          </div>
        ) : (
          <div className={`task-list view-${vista}`}>
            {visibles.map(t => (
              <TareaCard key={t.id} tarea={t} grid={vista === 'grid'} onOpen={setDetailTaskId} onCompletar={id => void handleCompletar(id)} />
            ))}
          </div>
        )
      )}

      <button className="fab-new-task" onClick={() => setFormOpen(true)} aria-label="Nueva tarea">+</button>

      <TareaForm open={formOpen} onClose={() => setFormOpen(false)} />
      <TareaDetailModal open={!!detailTaskId} onClose={() => setDetailTaskId(null)} taskId={detailTaskId} />
    </div>
  );
}
