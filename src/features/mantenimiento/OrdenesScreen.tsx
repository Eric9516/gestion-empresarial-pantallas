import { useMemo, useState } from 'react';
import { fechaHoyISO, formatearFechaSola } from '../../lib/fechaHoy';
import { normalizar, palabrasDeBusqueda } from './buscador';
import { avanceTareas, diasDeAviso, estadoAviso, resumenTareas } from './preventivo';
import { ahora, colorDe, devolucion, laVe, llegaEn, momentoCorto, NOMBRE_ETAPA, yaLlego, type ColorOT } from './flujo';
import { useImprimirOrdenes } from './useImprimirOrdenes';
import { useEquiposQuery, usePersonasSugeridas } from './useEquipos';
import { useConfigMantenimiento, useDerivarOrdenes, useOrdenesQuery, useRutinasQuery } from './usePreventivo';
import { useFaltantes } from './useStockRepuestos';
import { useAhora, useUsuarioMantenimiento } from './usuarioMantenimiento';
import OrdenDetalleModal from './OrdenDetalleModal';
import OrdenCorrectivaForm from './OrdenCorrectivaForm';
import FormatoOTModal from './FormatoOTModal';
import EstadoOT from './EstadoOT';
import { useToast } from '../../components/ToastProvider';
import type { OrdenTrabajo, TipoOT } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

export type FiltroOrdenes = 'abiertas' | 'falta';

interface Props {
  onVerEquipo: (equipoId: string) => void;
  /** 'falta': mostrar solo las OT abiertas a las que les falta stock de algún repuesto. */
  filtroInicial?: FiltroOrdenes;
  esAdmin: boolean;
}

const ORDEN: ColorOT[] = ['verde', 'amarillo', 'rojo', 'azul', 'gris'];

// Órdenes de trabajo, separadas en Preventivas y Correctivas, y agrupadas por color según quién mira:
// verde = las que tengo que mandar (responsable: derivar al jefe de taller; jefe: asignar a los técnicos),
// amarillo = pendientes o en curso, rojo = vencidas, azul = terminadas para revisar o aprobar.
// Las aprobadas no se muestran (están en el historial de cada equipo), salvo con "Ver aprobadas".
export default function OrdenesScreen({ onVerEquipo, filtroInicial = 'abiertas', esAdmin }: Props) {
  const toast = useToast();
  const usuario = useUsuarioMantenimiento();
  const momento = useAhora();
  const config = useConfigMantenimiento();
  const { data: ordenes } = useOrdenesQuery();
  const { data: rutinas } = useRutinasQuery();
  const { data: equipos } = useEquiposQuery();
  const personas = usePersonasSugeridas();
  const derivar = useDerivarOrdenes();
  const hoy = fechaHoyISO();
  const rol = usuario.persona.rol;
  const [tipo, setTipo] = useState<TipoOT>('preventiva');
  const [soloFaltantes, setSoloFaltantes] = useState(filtroInicial === 'falta');
  const [verAprobadas, setVerAprobadas] = useState(false);
  const faltantes = useFaltantes();
  const [consulta, setConsulta] = useState('');
  const [otAbierta, setOtAbierta] = useState<string | null>(null);
  const [correctivaOpen, setCorrectivaOpen] = useState(false);
  const [formatoOpen, setFormatoOpen] = useState(false);
  const imprimir = useImprimirOrdenes();

  const equipoPorId = useMemo(() => new Map(equipos.map(e => [e.id, e])), [equipos]);
  const visibles = useMemo(() => ordenes.filter(o => laVe(o, usuario.persona, momento, config.horarioRecepcion)), [ordenes, usuario.persona, momento, config.horarioRecepcion]);
  const cuantas = (t: TipoOT) => visibles.filter(o => o.tipo === t && o.etapa !== 'aprobada').length;
  // Terminadas que todavía no les llegaron (fuera del horario de recepción).
  const enEspera = rol === 'tecnico' ? [] : ordenes.filter(o => o.tipo === tipo && o.terminadaEn && o.etapa !== 'aprobada' && !yaLlego(o, momento, config.horarioRecepcion));

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
          o.numero, o.tareas, o.asignadoA, o.observaciones, e?.codigo, e?.nombre, e?.sector, o.correctivo?.falla, o.correctivo?.causa, NOMBRE_ETAPA[o.etapa],
          ...o.repuestos.flatMap(r => [r.componente, r.codigo, r.descripcion]),
        ].join(' '));
        return palabras.every(p => texto.includes(p));
      })
      .sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada));
  }, [visibles, tipo, verAprobadas, soloFaltantes, faltantes, consulta, equipoPorId]);

  const grupos = useMemo(() => {
    const g = new Map<ColorOT, OrdenTrabajo[]>();
    for (const o of filas) {
      const c = colorDe(o, hoy, rol);
      g.set(c, [...(g.get(c) ?? []), o]);
    }
    // Las aprobadas, de la más nueva a la más vieja.
    g.get('gris')?.reverse();
    return ORDEN.filter(c => g.get(c)?.length).map(c => ({ color: c, ordenes: g.get(c)! }));
  }, [filas, hoy, rol]);

  function titulo(c: ColorOT): string {
    if (c === 'verde') return rol === 'jefe' ? 'Para asignar' : 'Para derivar';
    if (c === 'amarillo') return rol === 'tecnico' ? 'Para hacer' : 'Pendientes o en curso';
    if (c === 'rojo') return 'Vencidas';
    if (c === 'azul') return rol === 'tecnico' ? 'Terminadas, esperando aprobación' : rol === 'jefe' ? 'Para revisar' : 'Para aprobar';
    return 'Aprobadas';
  }

  async function derivarTodas(lista: OrdenTrabajo[]) {
    const ids = lista.filter(o => o.etapa === 'por_derivar').map(o => o.id);
    await derivar.mutateAsync({ ids, cuando: ahora(), quien: usuario.persona });
    toast(ids.length === 1 ? 'OT derivada al jefe de taller' : `${ids.length} OT derivadas al jefe de taller`, 'success');
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title"><Icono n="lista" /> {rol === 'tecnico' ? 'Mis órdenes de trabajo' : 'Órdenes de trabajo'}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filas.length > 0 && <Button variant="ghost" size="sm" onClick={() => void imprimir(filas)} title="Un PDF con una hoja por OT"><Icono n="imprimir" /> Imprimir las {filas.length} de la lista</Button>}
          {esAdmin && <Button variant="ghost" size="sm" onClick={() => setFormatoOpen(true)}><Icono n="config" /> Formato de la OT</Button>}
          {usuario.esTecnico && <Button variant="primary" size="sm" onClick={() => setCorrectivaOpen(true)}><Icono n="mas" /> Cargar OT correctiva</Button>}
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
          <Input type="search" placeholder="Número, equipo, tarea, técnico..." value={consulta} onChange={e => setConsulta(e.target.value)} />
        </div>
      </div>
      <div className="mt-chips">
        <button type="button" className={`mt-chip${soloFaltantes ? ' activo' : ''}`} aria-pressed={soloFaltantes} onClick={() => setSoloFaltantes(v => !v)}><Icono n="paquete" /> Con repuesto faltante</button>
        <button type="button" className={`mt-chip${verAprobadas ? ' activo' : ''}`} aria-pressed={verAprobadas} onClick={() => setVerAprobadas(v => !v)}><Icono n="historial" /> Ver aprobadas</button>
      </div>

      {enEspera.length > 0 && (
        <p className="mt-en-espera">
          <Icono n="reloj" /> {enEspera.length === 1 ? '1 OT terminada te llega' : `${enEspera.length} OT terminadas te llegan`} a partir del {momentoCorto(enEspera.map(o => llegaEn(o.terminadaEn!, config.horarioRecepcion)).sort()[0])}, al abrir el horario de recepción.
        </p>
      )}

      {!grupos.length ? (
        <div className="empty-state">
          <div className="empty-icon"><Icono n="lista" /></div>
          <h3>No hay órdenes</h3>
          <p>{soloFaltantes ? 'A ninguna OT abierta le falta stock de repuestos.' : consulta ? 'Probá con otra búsqueda.' : `No hay OT ${tipo === 'preventiva' ? 'preventivas' : 'correctivas'} para mostrar.`}</p>
        </div>
      ) : grupos.map(g => (
        <section key={g.color} className={`mt-grupo-ot ${g.color}`}>
          <div className="mt-grupo-ot-titulo">
            <span className="mt-punto" aria-hidden="true" />
            <span>{titulo(g.color)} ({g.ordenes.length})</span>
            {g.color === 'verde' && rol === 'responsable' && g.ordenes.length > 1 && (
              <Button variant="success" size="sm" style={{ marginLeft: 'auto' }} onClick={() => void derivarTodas(g.ordenes)}><Icono n="exportar" /> Derivar las {g.ordenes.length}</Button>
            )}
          </div>
          <div className="mt-lista">
            {g.ordenes.map(o => {
              const e = equipoPorId.get(o.equipoId);
              const dev = devolucion(o);
              return (
                <div key={o.id} className={`mt-card mt-card-ot ${g.color}`} role="button" tabIndex={0} onClick={() => setOtAbierta(o.id)} onKeyDown={ev => { if (ev.key === 'Enter') setOtAbierta(o.id); }}>
                  <div className="mt-card-top">
                    <span className="mt-card-nombre">{o.numero} · {e ? `${e.codigo} — ${e.nombre}` : 'Equipo eliminado'}</span>
                  </div>
                  <div className="mt-tags">
                    <span className={`mt-tag etapa ${o.etapa}`}>{NOMBRE_ETAPA[o.etapa]}</span>
                    {o.estado !== 'terminada' && <EstadoOT ot={o} estado={estadoAviso(o, hoy, diasDeAviso(o, rutinas))} conFecha />}
                    {o.estado === 'terminada' && o.correctivo?.prioridad === 'urgente' && <span className="mt-tag urgente">Urgente</span>}
                    {dev && <span className="mt-tag falta"><Icono n="volver" /> Devuelta</span>}
                  </div>
                  <div className="mt-card-linea">{o.correctivo?.falla && o.tipo === 'correctiva' ? o.correctivo.falla : resumenTareas(o.tareas)}{avanceTareas(o) && <span className="mt-tag">{avanceTareas(o)}</span>}</div>
                  <div className="mt-card-linea">
                    {o.asignadoA && <span><Icono n="usuario" /> {o.asignadoA}</span>}
                    {o.estado === 'terminada' && o.fechaCierre && <span><Icono n="exito" /> Terminada el {formatearFechaSola(o.fechaCierre)}</span>}
                  </div>
                  {o.etapa === 'por_derivar' && rol === 'responsable' && (
                    <Button variant="success" size="sm" style={{ alignSelf: 'flex-start' }} onClick={ev => { ev.stopPropagation(); void derivarTodas([o]); }}><Icono n="exportar" /> Derivar</Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <OrdenDetalleModal ordenId={otAbierta} onClose={() => setOtAbierta(null)} onVerEquipo={onVerEquipo} esAdmin={esAdmin} personas={personas} />
      <FormatoOTModal open={formatoOpen} onClose={() => setFormatoOpen(false)} />
      <OrdenCorrectivaForm open={correctivaOpen} onClose={() => setCorrectivaOpen(false)} />
    </div>
  );
}
