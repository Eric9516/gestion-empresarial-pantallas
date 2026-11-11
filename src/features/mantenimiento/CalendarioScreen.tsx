import { useMemo, useState } from 'react';
import { fechaHoyISO, formatearFechaSola } from '../../lib/fechaHoy';
import { aFecha, aISO, frecuenciaEnPalabras, nombreMes, sumarDias } from './fechas';
import { avanceTareas, diasDeAviso, estadoAviso, proyectarFechas, resumenTareas, type EstadoAviso } from './preventivo';
import { useImprimirOrdenes } from './useImprimirOrdenes';
import { useEquiposQuery, usePersonasSugeridas } from './useEquipos';
import { useOrdenesQuery, useRutinasQuery } from './usePreventivo';
import OrdenDetalleModal from './OrdenDetalleModal';
import OrdenCorrectivaForm from './OrdenCorrectivaForm';
import { useUsuarioMantenimiento } from './usuarioMantenimiento';
import RutinaForm from './RutinaForm';
import PlanillasModal from './PlanillasModal';
import EstadoOT from './EstadoOT';
import Modal from '../../components/Modal';
import { ahora, colorDe, NOMBRE_ETAPA } from './flujo';
import { useDerivarOrdenes } from './usePreventivo';
import { useToast } from '../../components/ToastProvider';
import type { FechaISO, OrdenTrabajo, RutinaPreventiva } from './tipos';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';

const DIAS_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** Lo que se muestra en un día del calendario: una OT real o una fecha futura de una rutina. */
type Entrada =
  | { clase: EstadoAviso; ot: OrdenTrabajo; texto: string }
  | { clase: 'futura'; rutina: RutinaPreventiva; texto: string; fecha: FechaISO };

interface Props {
  esAdmin: boolean;
  onVerEquipo: (equipoId: string) => void;
}

export default function CalendarioScreen({ esAdmin, onVerEquipo }: Props) {
  const { data: ordenes } = useOrdenesQuery();
  const { data: rutinas } = useRutinasQuery();
  const { data: equipos } = useEquiposQuery();
  const personas = usePersonasSugeridas();
  const hoy = fechaHoyISO();

  const [mes, setMes] = useState(() => { const d = aFecha(hoy); return { anio: d.getFullYear(), mes: d.getMonth() }; });
  const [elegido, setElegido] = useState<FechaISO>(hoy);
  const [otAbierta, setOtAbierta] = useState<string | null>(null);
  const [rutinaForm, setRutinaForm] = useState<RutinaPreventiva | 'nueva' | null>(null);
  const [correctivaOpen, setCorrectivaOpen] = useState(false);
  const usuario = useUsuarioMantenimiento();
  const [planillasOpen, setPlanillasOpen] = useState(false);
  const imprimir = useImprimirOrdenes();
  const derivar = useDerivarOrdenes();
  const toast = useToast();
  // Ventana con todo lo de un día (se abre al tocar un día que tiene algo).
  const [diaAbierto, setDiaAbierto] = useState(false);
  // Si la OT se abrió desde la ventana del día, al cerrarla se vuelve a esa ventana.
  const [volverAlDia, setVolverAlDia] = useState(false);

  const equipoPorId = useMemo(() => new Map(equipos.map(e => [e.id, e])), [equipos]);
  const codigo = (id: string) => equipoPorId.get(id)?.codigo ?? '?';

  // La grilla arranca el lunes de la semana del día 1 y muestra 6 semanas.
  const dias = useMemo(() => {
    const primero = new Date(mes.anio, mes.mes, 1);
    const corrimiento = (primero.getDay() + 6) % 7;
    const inicio = sumarDias(aISO(primero), -corrimiento);
    return Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
  }, [mes]);

  const porDia = useMemo(() => {
    const m = new Map<FechaISO, Entrada[]>();
    const agregar = (f: FechaISO, e: Entrada) => m.set(f, [...(m.get(f) ?? []), e]);
    for (const o of ordenes) {
      const clase = estadoAviso(o, hoy, diasDeAviso(o, rutinas));
      const fecha = o.estado === 'terminada' ? (o.fechaCierre ?? o.fechaProgramada) : o.fechaProgramada;
      agregar(fecha, { clase, ot: o, texto: `${codigo(o.equipoId)} ${resumenTareas(o.tareas)}` });
    }
    for (const r of rutinas) {
      for (const f of proyectarFechas(r, dias[0], dias[dias.length - 1])) agregar(f, { clase: 'futura', rutina: r, texto: `${codigo(r.equipoId)} ${resumenTareas(r.tarea)}`, fecha: f });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenes, rutinas, dias, hoy, equipoPorId]);

  const avisos = useMemo(() => ordenes
    .map(o => ({ o, e: estadoAviso(o, hoy, diasDeAviso(o, rutinas)) }))
    .filter(x => x.e === 'vencida' || x.e === 'por_vencer')
    .sort((a, b) => a.o.fechaProgramada.localeCompare(b.o.fechaProgramada)), [ordenes, rutinas, hoy]);

  function moverMes(delta: number) {
    setMes(m => { const d = new Date(m.anio, m.mes + delta, 1); return { anio: d.getFullYear(), mes: d.getMonth() }; });
  }

  function irAHoy() {
    const d = aFecha(hoy);
    setMes({ anio: d.getFullYear(), mes: d.getMonth() });
    setElegido(hoy);
  }

  const delDia = porDia.get(elegido) ?? [];
  const delDiaOts = delDia.flatMap(e => (e.clase === 'futura' ? [] : [e.ot]));
  const paraDerivar = usuario.esResponsable ? delDiaOts.filter(o => o.etapa === 'por_derivar') : [];

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
    const ids = paraDerivar.map(o => o.id);
    await derivar.mutateAsync({ ids, cuando: ahora(), quien: usuario.persona });
    toast(ids.length === 1 ? 'OT derivada al jefe de taller' : `${ids.length} OT derivadas al jefe de taller`, 'success');
  }

  const botonesDelDia = (
    <>
      {paraDerivar.length > 0 && <Button variant="success" size="sm" onClick={() => void derivarDelDia()}><Icono n="exportar" /> Derivar {paraDerivar.length === 1 ? 'la OT' : `las ${paraDerivar.length}`} al jefe</Button>}
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
    <div key={i} className={`mt-fila mt-fila-color ${colorDe(e.ot, hoy, usuario.persona.rol)}`} style={{ cursor: 'pointer' }} onClick={() => abrirOT(e.ot.id, desdeDia)}>
      <div className="mt-fila-cuerpo">
        <div className="mt-tags" style={{ marginBottom: 3 }}>
          <strong style={{ fontSize: 13 }}>{e.ot.numero}</strong>
          <EstadoOT ot={e.ot} estado={e.clase} />
          <span className={`mt-tag ${e.ot.tipo === 'preventiva' ? 'prev' : 'corr'}`}>{e.ot.tipo === 'preventiva' ? 'Preventiva' : 'Correctiva'}</span>
          <span className="mt-tag">{NOMBRE_ETAPA[e.ot.etapa]}</span>
        </div>
        <div className="mt-fila-titulo" style={{ fontSize: 13 }}>{codigo(e.ot.equipoId)} — {equipoPorId.get(e.ot.equipoId)?.nombre}</div>
        <div className="mt-fila-sub">{[resumenTareas(e.ot.tareas) || e.ot.correctivo?.falla, avanceTareas(e.ot), e.ot.asignadoA].filter(Boolean).join(' · ')}</div>
      </div>
      <Button variant="primary" size="sm" style={{ flexShrink: 0 }} onClick={ev => { ev.stopPropagation(); abrirOT(e.ot.id, desdeDia); }}>Ver OT</Button>
    </div>
  ));

  const fechaLarga = aFecha(elegido).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const tituloDia = fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1);

  return (
    <div>
      <div className="section-header">
        <div className="section-title"><Icono n="calendario" /> Calendario preventivo</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {usuario.esTecnico && <Button variant="ghost" size="sm" onClick={() => setCorrectivaOpen(true)}><Icono n="herramienta" /> Cargar OT correctiva</Button>}
          <Button variant="ghost" size="sm" onClick={() => setPlanillasOpen(true)}><Icono n="lista" /> Planillas de tareas</Button>
          {esAdmin && <Button variant="primary" size="sm" onClick={() => setRutinaForm('nueva')}><Icono n="mas" /> Nueva rutina</Button>}
        </div>
      </div>

      <div className="mt-columnas">
        <div>
          {avisos.length > 0 && (
            <div className="mt-bloque" style={{ borderColor: avisos.some(a => a.e === 'vencida') ? '#f2b8b5' : '#f3d58a' }}>
              <div className="mt-bloque-titulo"><span><Icono n="alerta" /> Avisos ({avisos.length})</span></div>
              {avisos.map(({ o, e }) => (
                <div key={o.id} className="mt-fila" style={{ cursor: 'pointer' }} onClick={() => setOtAbierta(o.id)}>
                  <div className="mt-fila-cuerpo">
                    <div className="mt-tags" style={{ marginBottom: 3 }}>
                      <strong style={{ fontSize: 13 }}>{o.numero}</strong>
                      <EstadoOT ot={o} estado={e} conFecha />
                    </div>
                    <div className="mt-fila-titulo" style={{ fontSize: 13 }}>{codigo(o.equipoId)} — {equipoPorId.get(o.equipoId)?.nombre}</div>
                    <div className="mt-fila-sub">{resumenTareas(o.tareas)}{avanceTareas(o) && ` · ${avanceTareas(o)}`}{o.asignadoA && ` · ${o.asignadoA}`}</div>
                  </div>
                  <Button variant="primary" size="sm" onClick={ev => { ev.stopPropagation(); setOtAbierta(o.id); }}>Ver OT</Button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-bloque">
            <div className="mt-cal-cabecera">
              <Button variant="ghost" size="icon" onClick={() => moverMes(-1)} aria-label="Mes anterior"><Icono n="volver" /></Button>
              <div className="mt-cal-mes">{nombreMes(mes.anio, mes.mes)}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button variant="ghost" size="sm" onClick={irAHoy}>Hoy</Button>
                <Button variant="ghost" size="icon" onClick={() => moverMes(1)} aria-label="Mes siguiente"><Icono n="desplegar" /></Button>
              </div>
            </div>
            <div className="mt-cal">
              {DIAS_SEMANA.map(d => <div key={d} className="mt-cal-dia-sem">{d}</div>)}
              {dias.map(f => {
                const entradas = porDia.get(f) ?? [];
                const otroMes = aFecha(f).getMonth() !== mes.mes;
                return (
                  <button
                    key={f}
                    type="button"
                    className={`mt-cal-dia${otroMes ? ' otro-mes' : ''}${f === hoy ? ' hoy' : ''}${f === elegido ? ' elegido' : ''}`}
                    onClick={() => tocarDia(f)}
                    aria-label={`${formatearFechaSola(f)}: ${entradas.length} ${entradas.length === 1 ? 'tarea' : 'tareas'}`}
                  >
                    <span className="mt-cal-num">{aFecha(f).getDate()}</span>
                    <span className="mt-cal-marcas">{entradas.slice(0, 6).map((e, i) => <span key={i} className={`mt-cal-marca ${e.clase}`} />)}</span>
                    {entradas.slice(0, 3).map((e, i) => <span key={i} className={`mt-cal-texto ${e.clase}`} title={e.texto}>{e.texto}</span>)}
                    {entradas.length > 3 && <span className="mt-cal-texto" style={{ color: 'var(--text-muted)' }}>+{entradas.length - 3} más</span>}
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
                <div className="mt-fila-titulo" style={{ fontSize: 13 }}>{codigo(r.equipoId)} — {resumenTareas(r.tarea)}</div>
                <div className="mt-fila-sub">
                  {r.activa ? <>{frecuenciaEnPalabras(r.frecuenciaDias)} · próxima {formatearFechaSola(r.proximaFecha)}</> : 'Desactivada'}
                  {r.responsable && ` · ${r.responsable}`}
                </div>
              </div>
              <div className="mt-fila-acciones">
                <Button variant="ghost" size="icon" title="Ver equipo" onClick={() => onVerEquipo(r.equipoId)}><Icono n="ver" /></Button>
                {esAdmin && <Button variant="ghost" size="icon" title="Editar rutina" onClick={() => setRutinaForm(r)}><Icono n="editar" /></Button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal
        open={diaAbierto}
        onClose={() => setDiaAbierto(false)}
        large
        title={<><Icono n="calendario" /> {tituloDia}{elegido === hoy && ' (hoy)'}</>}
      >
        <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: '0 0 10px' }}>
          {delDiaOts.length === 1 ? '1 OT' : `${delDiaOts.length} OT`}
          {delDia.length > delDiaOts.length && ` · ${delDia.length - delDiaOts.length} más adelante (todavía sin OT)`}
        </p>
        {(paraDerivar.length > 0 || delDiaOts.length > 0) && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>{botonesDelDia}</div>}
        {filasDelDia(true)}
      </Modal>

      <OrdenDetalleModal ordenId={otAbierta} onClose={cerrarOT} onVerEquipo={onVerEquipo} esAdmin={esAdmin} personas={personas} />
      <PlanillasModal open={planillasOpen} onClose={() => setPlanillasOpen(false)} esAdmin={esAdmin} />
      <RutinaForm open={!!rutinaForm} onClose={() => setRutinaForm(null)} rutina={rutinaForm === 'nueva' ? null : rutinaForm} personas={personas} />
      <OrdenCorrectivaForm open={correctivaOpen} onClose={() => setCorrectivaOpen(false)} />
    </div>
  );
}
