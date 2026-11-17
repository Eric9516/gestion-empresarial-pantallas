import { useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { fechaHoyISO, formatearFechaSola } from '../../lib/fechaHoy';
import { mensajeDeError } from '../../lib/errores';
import { colorDe, NOMBRE_ETAPA } from './flujo';
import { aFecha, aISO, frecuenciaEnPalabras, nombreMes, sumarDias } from './fechas';
import { avanceTareas, estadoAviso, numeroOT, proyectarFechas, resumenTareas, type EstadoAviso } from './preventivo';
import { useImprimirOrdenes } from './otPdf';
import { useMantenimiento } from './servicio';
import OrdenDetalleModal from './OrdenDetalleModal';
import OrdenCorrectivaForm from './OrdenCorrectivaForm';
import CargarCorrectivaForm from './CargarCorrectivaForm';
import RutinaForm from './RutinaForm';
import PlanillasModal from './PlanillasModal';
import EstadoOT from './EstadoOT';
import type { FechaISO, OrdenTrabajo, Rutina } from './tipos';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';

const DIAS_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** Lo que se muestra en un día del calendario: una OT, o una fecha futura de una rutina (todavía sin OT). */
type Entrada =
  | { clase: EstadoAviso; ot: OrdenTrabajo; texto: string }
  | { clase: 'futura'; rutina: Rutina; texto: string; fecha: FechaISO };

// Calendario preventivo (del diseño del socio): avisos de lo vencido y lo que está por vencer, el mes con las OT de cada día (y lo que viene
// más adelante de cada rutina), el día elegido con sus OT para abrir o imprimir, y la lista de rutinas. Al tocar un día que tiene algo se abre
// una ventana con todo lo de ese día (del socio, 10/11/2026): cada OT con su color, su etapa y "Ver OT" (al cerrarla se vuelve a la ventana),
// y los botones para derivar al jefe las del día (el responsable) e imprimirlas.
export default function PantallaDeCalendario({ onVerEquipo }: { onVerEquipo: (equipoId: string) => void }) {
  const s = useMantenimiento();
  const ordenes = useMemo(() => s.ordenes ?? [], [s.ordenes]);
  const rutinas = useMemo(() => s.rutinas ?? [], [s.rutinas]);
  const hoy = fechaHoyISO();
  const imprimir = useImprimirOrdenes();

  const [mes, setMes] = useState(() => { const d = aFecha(hoy); return { anio: d.getFullYear(), mes: d.getMonth() }; });
  const [elegido, setElegido] = useState<FechaISO>(hoy);
  const [otAbierta, setOtAbierta] = useState<string | null>(null);
  const [rutinaForm, setRutinaForm] = useState<Rutina | 'nueva' | null>(null);
  const [correctivaOpen, setCorrectivaOpen] = useState(false);
  const [cargarOpen, setCargarOpen] = useState(false);
  const [planillasOpen, setPlanillasOpen] = useState(false);
  const toast = useToast();
  // la ventana con todo lo de un día; si una OT se abrió desde ahí, al cerrarla se vuelve a la ventana
  const [diaAbierto, setDiaAbierto] = useState(false);
  const [volverAlDia, setVolverAlDia] = useState(false);
  const [derivando, setDerivando] = useState(false);

  const equipoPorId = useMemo(() => new Map((s.equipos ?? []).map(e => [e.id, e])), [s.equipos]);
  const codigo = (id: string) => equipoPorId.get(id)?.codigo ?? '?';

  // la grilla arranca el lunes de la semana del día 1 y muestra 6 semanas
  const dias = useMemo(() => {
    const primero = new Date(mes.anio, mes.mes, 1);
    const inicio = sumarDias(aISO(primero), -((primero.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
  }, [mes]);

  const porDia = useMemo(() => {
    const m = new Map<FechaISO, Entrada[]>();
    const agregar = (f: FechaISO, e: Entrada) => m.set(f, [...(m.get(f) ?? []), e]);
    const cod = (id: string) => equipoPorId.get(id)?.codigo ?? '?';
    for (const o of ordenes) {
      const fecha = o.estado === 'terminada' ? (o.fechaCierre ?? o.fechaProgramada) : o.fechaProgramada;
      agregar(fecha, { clase: estadoAviso(o, hoy), ot: o, texto: `${cod(o.equipoId)} ${resumenTareas(o.tareas)}` });
    }
    for (const r of rutinas) {
      for (const f of proyectarFechas(r, dias[0], dias[dias.length - 1])) agregar(f, { clase: 'futura', rutina: r, texto: `${cod(r.equipoId)} ${resumenTareas(r.tareas)}`, fecha: f });
    }
    return m;
  }, [ordenes, rutinas, dias, hoy, equipoPorId]);

  const avisos = useMemo(() => ordenes
    .map(o => ({ o, e: estadoAviso(o, hoy) }))
    .filter(x => x.e === 'vencida' || x.e === 'por_vencer')
    .sort((a, b) => a.o.fechaProgramada.localeCompare(b.o.fechaProgramada)), [ordenes, hoy]);

  const moverMes = (delta: number) => setMes(m => { const d = new Date(m.anio, m.mes + delta, 1); return { anio: d.getFullYear(), mes: d.getMonth() }; });
  function irAHoy() {
    const d = aFecha(hoy);
    setMes({ anio: d.getFullYear(), mes: d.getMonth() });
    setElegido(hoy);
  }

  const delDia = porDia.get(elegido) ?? [];
  const delDiaOts = delDia.flatMap(e => (e.clase === 'futura' ? [] : [e.ot]));
  const paraDerivar = s.esAdmin ? delDiaOts.filter(o => o.etapa === 'por_derivar') : [];

  function tocarDia(f: FechaISO) {
    setElegido(f);
    if ((porDia.get(f) ?? []).length) setDiaAbierto(true);
  }
  function abrirOT(id: string, desdeDia: boolean) {
    if (desdeDia) { setDiaAbierto(false); setVolverAlDia(true); }
    setOtAbierta(id);
  }
  function cerrarOT() {
    setOtAbierta(null);
    if (volverAlDia) { setVolverAlDia(false); setDiaAbierto(true); }
  }
  async function derivarDelDia() {
    setDerivando(true);
    try {
      const n = await s.derivarOts(paraDerivar.map(o => o.id));
      toast(n === 1 ? 'OT derivada al jefe de taller' : `${n} OT derivadas al jefe de taller`, 'success');
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    } finally {
      setDerivando(false);
    }
  }

  const botonesDelDia = (
    <>
      {paraDerivar.length > 0 && <Button variant="success" size="sm" disabled={derivando} onClick={() => void derivarDelDia()}><Icono n="exportar" /> Derivar {paraDerivar.length === 1 ? 'la OT' : `las ${paraDerivar.length}`} al jefe</Button>}
      {delDiaOts.length > 0 && <Button variant="ghost" size="sm" onClick={() => void imprimir(delDiaOts)}><Icono n="imprimir" /> Imprimir {delDiaOts.length === 1 ? 'la OT' : `las ${delDiaOts.length} OT`} del día</Button>}
    </>
  );

  const filasDelDia = (desdeDia: boolean) => delDia.map((e, i) => e.clase === 'futura' ? (
    <div key={i} className="mt-fila">
      <div className="mt-fila-cuerpo">
        <div className="mt-tags" style={{ marginBottom: 3 }}><span className="mt-tag">Más adelante</span></div>
        <div className="mt-fila-titulo" style={{ fontSize: 13 }}>{e.texto}</div>
        <div className="mt-fila-sub">La OT se genera cuando se termine la anterior de esta rutina ({frecuenciaEnPalabras(e.rutina.frecuenciaDias)}).</div>
      </div>
    </div>
  ) : (
    <div key={i} className={`mt-fila mt-fila-color ${colorDe(e.ot, hoy, s.rol)}`}>
      <div className="mt-fila-cuerpo">
        <div className="mt-tags" style={{ marginBottom: 3 }}>
          <strong style={{ fontSize: 13 }}>{numeroOT(e.ot.numero)}</strong>
          <EstadoOT ot={e.ot} estado={e.clase} />
          <span className={`mt-tag ${e.ot.tipo === 'preventiva' ? 'prev' : 'corr'}`}>{e.ot.tipo === 'preventiva' ? 'Preventiva' : 'Correctiva'}</span>
          <span className={`mt-tag etapa ${e.ot.etapa}`}>{NOMBRE_ETAPA[e.ot.etapa]}</span>
        </div>
        <div className="mt-fila-titulo" style={{ fontSize: 13 }}>{codigo(e.ot.equipoId)} — {equipoPorId.get(e.ot.equipoId)?.nombre}</div>
        <div className="mt-fila-sub">{[resumenTareas(e.ot.tareas) || e.ot.correctivo?.falla, avanceTareas(e.ot), e.ot.asignados.map(a => a.nombre).join(', ') || e.ot.asignado].filter(Boolean).join(' · ')}</div>
      </div>
      <Button variant="primary" size="sm" style={{ flexShrink: 0 }} onClick={() => abrirOT(e.ot.id, desdeDia)}>Ver OT</Button>
    </div>
  ));

  const fechaLarga = aFecha(elegido).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const tituloDia = fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1);

  return (
    <div>
      <div className="section-header">
        <div className="section-title"><Icono n="calendario" /> Calendario preventivo</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" size="sm" onClick={() => setPlanillasOpen(true)}><Icono n="planilla" /> Planillas de tareas</Button>
          {(s.esAdmin || s.jefe) && <Button variant="ghost" size="sm" onClick={() => setCorrectivaOpen(true)}><Icono n="fecha" /> Programar correctiva</Button>}
          {s.trabaja && <Button variant="ghost" size="sm" onClick={() => setCargarOpen(true)}><Icono n="herramienta" /> Cargar OT correctiva</Button>}
          {s.esAdmin && <Button variant="primary" size="sm" onClick={() => setRutinaForm('nueva')}><Icono n="mas" /> Nueva rutina</Button>}
        </div>
      </div>

      {s.ordenes === undefined ? <div className="mt-vacio">{s.isError ? 'No se pudo leer el calendario. Probá de nuevo.' : 'Cargando...'}</div> : (
        <div className="mt-columnas">
          <div>
            {avisos.length > 0 && (
              <div className="mt-bloque" style={{ borderColor: avisos.some(a => a.e === 'vencida') ? '#f2b8b5' : '#f3d58a' }}>
                <div className="mt-bloque-titulo"><span><Icono n="alerta" /> Avisos ({avisos.length})</span></div>
                {avisos.map(({ o, e }) => (
                  <div key={o.id} className="mt-fila">
                    <div className="mt-fila-cuerpo">
                      <div className="mt-tags" style={{ marginBottom: 3 }}>
                        <strong style={{ fontSize: 13 }}>{numeroOT(o.numero)}</strong>
                        <EstadoOT ot={o} estado={e} conFecha />
                      </div>
                      <div className="mt-fila-titulo" style={{ fontSize: 13 }}>{codigo(o.equipoId)} — {equipoPorId.get(o.equipoId)?.nombre}</div>
                      <div className="mt-fila-sub">{resumenTareas(o.tareas)}{avanceTareas(o) && ` · ${avanceTareas(o)}`}{o.asignado && ` · ${o.asignado}`}</div>
                    </div>
                    <Button variant="primary" size="sm" onClick={() => setOtAbierta(o.id)}>Ver OT</Button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-bloque">
              <div className="mt-cal-cabecera">
                <Button variant="ghost" size="icon" onClick={() => moverMes(-1)} aria-label="Mes anterior"><Icono n="volver" /></Button>
                <div className="mt-cal-mes" aria-live="polite">{nombreMes(mes.anio, mes.mes)}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button variant="ghost" size="sm" onClick={irAHoy}>Hoy</Button>
                  <Button variant="ghost" size="icon" onClick={() => moverMes(1)} aria-label="Mes siguiente"><Icono n="desplegar" /></Button>
                </div>
              </div>
              <div className="mt-cal">
                {DIAS_SEMANA.map(d => <div key={d} className="mt-cal-dia-sem" aria-hidden="true">{d}</div>)}
                {dias.map(f => {
                  const entradas = porDia.get(f) ?? [];
                  const otroMes = aFecha(f).getMonth() !== mes.mes;
                  return (
                    <button
                      key={f}
                      type="button"
                      className={`mt-cal-dia${otroMes ? ' otro-mes' : ''}${f === hoy ? ' hoy' : ''}${f === elegido ? ' elegido' : ''}`}
                      onClick={() => tocarDia(f)}
                      aria-pressed={f === elegido}
                      aria-label={`${formatearFechaSola(f)}: ${entradas.length} ${entradas.length === 1 ? 'tarea' : 'tareas'}`}
                    >
                      <span className="mt-cal-num">{aFecha(f).getDate()}</span>
                      <span className="mt-cal-marcas">{entradas.slice(0, 6).map((e, i) => <span key={i} className={`mt-cal-marca ${e.clase}`} />)}</span>
                      {entradas.slice(0, 3).map((e, i) => <span key={i} className={`mt-cal-texto ${e.clase}`} title={e.texto}>{e.texto}</span>)}
                      {entradas.length > 3 && <span className="mt-cal-texto">+{entradas.length - 3} más</span>}
                    </button>
                  );
                })}
              </div>
              <div className="mt-leyenda">
                <span><span className="mt-cal-marca vencida" /> Vencida</span>
                <span><span className="mt-cal-marca por_vencer" /> Por vencer</span>
                <span><span className="mt-cal-marca programada" /> Programada</span>
                <span><span className="mt-cal-marca terminada" /> Terminada</span>
                <span><span className="mt-cal-marca futura" /> Más adelante (todavía sin OT)</span>
              </div>
            </div>

            <div className="mt-bloque">
              <div className="mt-bloque-titulo">
                <span><Icono n="fecha" /> {formatearFechaSola(elegido)}{elegido === hoy && ' (hoy)'}</span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{botonesDelDia}</span>
              </div>
              {!delDia.length && <div className="mt-vacio">Nada para este día.</div>}
              {filasDelDia(false)}
            </div>
          </div>

          <div className="mt-bloque">
            <div className="mt-bloque-titulo"><span><Icono n="repetir" /> Rutinas preventivas ({rutinas.length})</span></div>
            <p style={{ fontSize: 12, color: 'var(--text-mid)', margin: '0 0 6px' }}>Cada rutina activa tiene siempre su orden de trabajo para la próxima fecha. Al terminarla, se programa sola la siguiente.</p>
            {!rutinas.length && <div className="mt-vacio">No hay rutinas cargadas.</div>}
            {[...rutinas].sort((a, b) => Number(b.activa) - Number(a.activa) || a.proximaFecha.localeCompare(b.proximaFecha)).map(r => (
              <div key={r.id} className="mt-fila">
                <div className="mt-fila-cuerpo">
                  <div className="mt-fila-titulo" style={{ fontSize: 13 }}>{codigo(r.equipoId)} — {resumenTareas(r.tareas)}</div>
                  <div className="mt-fila-sub">
                    {r.activa ? <>{frecuenciaEnPalabras(r.frecuenciaDias)} · próxima {formatearFechaSola(r.proximaFecha)}</> : 'Desactivada'}
                    {r.responsable && ` · ${r.responsable}`}
                  </div>
                </div>
                <div className="mt-fila-acciones">
                  <Button variant="ghost" size="icon" title="Ver equipo" aria-label={`Ver el equipo ${codigo(r.equipoId)}`} onClick={() => onVerEquipo(r.equipoId)}><Icono n="ver" /></Button>
                  {s.esAdmin && <Button variant="ghost" size="icon" title="Editar rutina" aria-label={`Editar la rutina de ${codigo(r.equipoId)}`} onClick={() => setRutinaForm(r)}><Icono n="editar" /></Button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={diaAbierto} onClose={() => setDiaAbierto(false)} large title={<><Icono n="calendario" /> {tituloDia}{elegido === hoy && ' (hoy)'}</>}>
        <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: '0 0 10px' }}>
          {delDiaOts.length === 1 ? '1 OT' : `${delDiaOts.length} OT`}
          {delDia.length > delDiaOts.length && ` · ${delDia.length - delDiaOts.length} más adelante (todavía sin OT)`}
        </p>
        {(paraDerivar.length > 0 || delDiaOts.length > 0) && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>{botonesDelDia}</div>}
        {filasDelDia(true)}
      </Modal>

      <OrdenDetalleModal ordenId={otAbierta} onClose={cerrarOT} onVerEquipo={onVerEquipo} />
      <PlanillasModal open={planillasOpen} onClose={() => setPlanillasOpen(false)} />
      <RutinaForm open={!!rutinaForm} onClose={() => setRutinaForm(null)} rutina={rutinaForm === 'nueva' ? null : rutinaForm} />
      <OrdenCorrectivaForm open={correctivaOpen} onClose={() => setCorrectivaOpen(false)} />
      <CargarCorrectivaForm open={cargarOpen} onClose={() => setCargarOpen(false)} />
    </div>
  );
}
