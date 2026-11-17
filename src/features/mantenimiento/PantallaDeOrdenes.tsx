import { useMemo, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import { fechaHoyISO, formatearFechaSola } from '../../lib/fechaHoy';
import { mensajeDeError } from '../../lib/errores';
import { normalizar, palabrasDeBusqueda } from './buscador';
import { ahora, colorDe, devolucion, laVe, llegaEn, momentoCorto, NOMBRE_ETAPA, yaLlego, type ColorOT } from './flujo';
import { avanceTareas, estadoAviso, faltantes, numeroOT, resumenTareas } from './preventivo';
import { useImprimirOrdenes } from './otPdf';
import { useMantenimiento } from './servicio';
import OrdenDetalleModal from './OrdenDetalleModal';
import OrdenCorrectivaForm from './OrdenCorrectivaForm';
import CargarCorrectivaForm from './CargarCorrectivaForm';
import FormatoOTModal from './FormatoOTModal';
import EstadoOT from './EstadoOT';
import type { OrdenTrabajo, TipoOT } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

const ORDEN: ColorOT[] = ['verde', 'amarillo', 'rojo', 'azul', 'gris'];

// Las órdenes de trabajo (del socio, 10/11/2026), separadas en Preventivas y Correctivas y agrupadas por color según quién mira:
// verde = las que tengo que mandar (responsable: derivar al jefe de taller; jefe: asignar a los técnicos), amarillo = pendientes o en curso,
// rojo = vencidas, azul = terminadas para revisar o aprobar. Las aprobadas no se muestran (están en el historial de cada equipo), salvo con
// "Ver aprobadas". El técnico ve solo las suyas; las terminadas le llegan al jefe y al responsable dentro del horario de recepción.
export default function PantallaDeOrdenes({ onVerEquipo, abrir }: { onVerEquipo: (equipoId: string) => void; abrir: string | null }) {
  const s = useMantenimiento();
  const toast = useToast();
  const hoy = fechaHoyISO();
  const momento = ahora();
  const rol = s.rol;
  const [tipo, setTipo] = useState<TipoOT>('preventiva');
  const [soloFaltantes, setSoloFaltantes] = useState(false);
  const [verAprobadas, setVerAprobadas] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [otAbierta, setOtAbierta] = useState<string | null>(abrir);
  const [correctivaOpen, setCorrectivaOpen] = useState(false);
  const [cargarOpen, setCargarOpen] = useState(false);
  const [formatoOpen, setFormatoOpen] = useState(false);
  const [derivando, setDerivando] = useState(false);
  const imprimir = useImprimirOrdenes();
  const horario = s.config.horarioRecepcion;

  const equipoPorId = useMemo(() => new Map((s.equipos ?? []).map(e => [e.id, e])), [s.equipos]);
  const quien = useMemo(() => ({ id: s.usuarioId, rol }), [s.usuarioId, rol]);
  const visibles = useMemo(() => (s.ordenes ?? []).filter(o => laVe(o, quien, momento, horario)), [s.ordenes, quien, momento, horario]);
  const cuantas = (t: TipoOT) => visibles.filter(o => o.tipo === t && o.etapa !== 'aprobada').length;
  // terminadas que todavía no les llegaron (fuera del horario de recepción)
  const enEspera = rol === 'tecnico' || rol === 'consulta' ? []
    : (s.ordenes ?? []).filter(o => o.tipo === tipo && o.terminadaEn && o.etapa !== 'aprobada' && !yaLlego(o, momento, horario));

  const filas = useMemo(() => {
    const palabras = palabrasDeBusqueda(consulta);
    return visibles
      .filter(o => o.tipo === tipo)
      .filter(o => verAprobadas || o.etapa !== 'aprobada')
      .filter(o => !soloFaltantes || (o.estado !== 'terminada' && faltantes(o.repuestos).length > 0))
      .filter(o => {
        if (!palabras.length) return true;
        const e = equipoPorId.get(o.equipoId);
        const texto = normalizar([
          numeroOT(o.numero), ...o.tareas.map(t => t.texto), o.asignado, ...o.asignados.map(a => a.nombre), o.observaciones, e?.codigo, e?.nombre, e?.sector,
          o.correctivo?.falla, o.correctivo?.causa, NOMBRE_ETAPA[o.etapa], ...o.repuestos.flatMap(r => [r.componente, r.codigo, r.descripcion]),
        ].join(' '));
        return palabras.every(p => texto.includes(p));
      })
      .sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada) || a.numero - b.numero);
  }, [visibles, tipo, verAprobadas, soloFaltantes, consulta, equipoPorId]);

  const grupos = useMemo(() => {
    const g = new Map<ColorOT, OrdenTrabajo[]>();
    for (const o of filas) {
      const c = colorDe(o, hoy, rol);
      g.set(c, [...(g.get(c) ?? []), o]);
    }
    // las aprobadas, de la más nueva a la más vieja
    g.get('gris')?.reverse();
    return ORDEN.filter(c => g.get(c)?.length).map(c => ({ color: c, ordenes: g.get(c)! }));
  }, [filas, hoy, rol]);

  function titulo(c: ColorOT): string {
    if (c === 'verde') return rol === 'jefe' ? 'Para asignar' : 'Para derivar';
    if (c === 'amarillo') return rol === 'tecnico' ? 'Para hacer' : 'Pendientes o en curso';
    if (c === 'rojo') return 'Vencidas';
    if (c === 'azul') return rol === 'tecnico' ? 'Terminadas, esperando aprobación' : rol === 'jefe' ? 'Para revisar' : 'Para revisar o aprobar';
    return 'Aprobadas';
  }

  async function derivar(lista: OrdenTrabajo[]) {
    const ids = lista.filter(o => o.etapa === 'por_derivar').map(o => o.id);
    setDerivando(true);
    try {
      const n = await s.derivarOts(ids);
      toast(n === 1 ? 'OT derivada al jefe de taller' : `${n} OT derivadas al jefe de taller`, 'success');
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    } finally {
      setDerivando(false);
    }
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title"><Icono n="lista" /> {rol === 'tecnico' ? 'Mis órdenes de trabajo' : 'Órdenes de trabajo'}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {s.esAdmin && <Button variant="ghost" size="sm" onClick={() => setFormatoOpen(true)} title="Registro de calidad, liberación del equipo y horario de recepción"><Icono n="config" /> Formato de la OT</Button>}
          {filas.length > 0 && <Button variant="ghost" size="sm" onClick={() => void imprimir(filas)} title="Un PDF con una hoja por OT"><Icono n="imprimir" /> Imprimir las {filas.length} de la lista</Button>}
          {(s.esAdmin || s.jefe) && <Button variant="ghost" size="sm" onClick={() => setCorrectivaOpen(true)} title="Una correctiva para hacer más adelante"><Icono n="fecha" /> Programar correctiva</Button>}
          {s.trabaja && <Button variant="primary" size="sm" onClick={() => setCargarOpen(true)} title="Un trabajo que ya hiciste (por ejemplo, un llamado de guardia)"><Icono n="mas" /> Cargar OT correctiva</Button>}
        </div>
      </div>

      <div className="mt-tipos-ot" role="tablist" aria-label="Tipo de OT">
        {(['preventiva', 'correctiva'] as const).map(t => (
          <button key={t} type="button" role="tab" aria-selected={tipo === t} className={`mt-tipo-ot${tipo === t ? ' activo' : ''}`} onClick={() => setTipo(t)}>
            {t === 'preventiva' ? 'Preventivas' : 'Correctivas'} <span className="mt-tipo-ot-num">{cuantas(t)}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Input type="search" placeholder="Número, equipo, tarea, técnico..." value={consulta} onChange={e => setConsulta(e.target.value)} aria-label="Buscar órdenes de trabajo" />
        </div>
      </div>
      <div className="mt-chips">
        <button type="button" className={`mt-chip${soloFaltantes ? ' activo' : ''}`} aria-pressed={soloFaltantes} onClick={() => setSoloFaltantes(v => !v)}><Icono n="paquete" /> Con repuesto faltante</button>
        <button type="button" className={`mt-chip${verAprobadas ? ' activo' : ''}`} aria-pressed={verAprobadas} onClick={() => setVerAprobadas(v => !v)}><Icono n="historial" /> Ver aprobadas</button>
      </div>

      {enEspera.length > 0 && (
        <p className="mt-en-espera">
          <Icono n="reloj" /> {enEspera.length === 1 ? '1 OT terminada te llega' : `${enEspera.length} OT terminadas te llegan`} a partir del {momentoCorto(enEspera.map(o => llegaEn(o.terminadaEn!, horario)).sort()[0])}, al abrir el horario de recepción.
        </p>
      )}

      {s.ordenes === undefined ? <div className="mt-vacio">{s.isError ? 'No se pudieron leer las órdenes. Probá de nuevo.' : 'Cargando...'}</div> : !grupos.length ? (
        <div className="empty-state">
          <div className="empty-icon"><Icono n="lista" /></div>
          <h2>No hay órdenes</h2>
          <p>{soloFaltantes ? 'A ninguna OT abierta le falta stock de repuestos.' : consulta ? 'Probá con otra búsqueda.' : `No hay OT ${tipo === 'preventiva' ? 'preventivas' : 'correctivas'} para mostrar.`}</p>
        </div>
      ) : grupos.map(g => (
        <section key={g.color} className={`mt-grupo-ot ${g.color}`} aria-label={titulo(g.color)}>
          <div className="mt-grupo-ot-titulo">
            <span className="mt-punto" aria-hidden="true" />
            <span>{titulo(g.color)} ({g.ordenes.length})</span>
            {g.color === 'verde' && rol === 'responsable' && g.ordenes.filter(o => o.etapa === 'por_derivar').length > 1 && (
              <Button variant="success" size="sm" style={{ marginLeft: 'auto' }} disabled={derivando} onClick={() => void derivar(g.ordenes)}><Icono n="exportar" /> Derivar las {g.ordenes.filter(o => o.etapa === 'por_derivar').length}</Button>
            )}
          </div>
          <div className="mt-lista">
            {g.ordenes.map(o => {
              const e = equipoPorId.get(o.equipoId);
              const dev = devolucion(o);
              const asignados = o.asignados.map(a => a.nombre).join(', ') || o.asignado;
              return (
                <div key={o.id} className={`mt-card mt-card-ot ${g.color}`} role="button" tabIndex={0} onClick={() => setOtAbierta(o.id)} onKeyDown={ev => { if (ev.key === 'Enter') setOtAbierta(o.id); }}>
                  <div className="mt-card-top">
                    <span className="mt-card-nombre">{numeroOT(o.numero)} · {e ? `${e.codigo} — ${e.nombre}` : 'Equipo eliminado'}</span>
                  </div>
                  <div className="mt-tags">
                    <span className={`mt-tag etapa ${o.etapa}`}>{NOMBRE_ETAPA[o.etapa]}</span>
                    {o.estado !== 'terminada' && <EstadoOT ot={o} estado={estadoAviso(o, hoy)} conFecha />}
                    {o.correctivo?.prioridad === 'urgente' && <span className="mt-tag urgente">Urgente</span>}
                    {dev && <span className="mt-tag falta"><Icono n="volver" /> Devuelta</span>}
                  </div>
                  <div className="mt-card-linea">{o.tipo === 'correctiva' && o.correctivo?.falla ? o.correctivo.falla : resumenTareas(o.tareas)}{avanceTareas(o) && <span className="mt-tag">{avanceTareas(o)}</span>}</div>
                  <div className="mt-card-linea">
                    {asignados && <span><Icono n="usuario" /> {asignados}</span>}
                    {o.estado === 'terminada' && o.fechaCierre && <span><Icono n="exito" /> Terminada el {formatearFechaSola(o.fechaCierre)}</span>}
                  </div>
                  {o.etapa === 'por_derivar' && rol === 'responsable' && (
                    <Button variant="success" size="sm" style={{ alignSelf: 'flex-start' }} disabled={derivando} onClick={ev => { ev.stopPropagation(); void derivar([o]); }}><Icono n="exportar" /> Derivar</Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <OrdenDetalleModal ordenId={otAbierta} onClose={() => setOtAbierta(null)} onVerEquipo={onVerEquipo} />
      <OrdenCorrectivaForm open={correctivaOpen} onClose={() => setCorrectivaOpen(false)} />
      <CargarCorrectivaForm open={cargarOpen} onClose={() => setCargarOpen(false)} />
      <FormatoOTModal open={formatoOpen} onClose={() => setFormatoOpen(false)} />
    </div>
  );
}
