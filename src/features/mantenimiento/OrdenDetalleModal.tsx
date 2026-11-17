import { useId, useRef, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { fechaHoyISO, formatearFechaSola } from '../../lib/fechaHoy';
import { mensajeDeError } from '../../lib/errores';
import { usePedido } from '../../lib/usePedido';
import { useAlCambiar } from '../../lib/useAlCambiar';
import { frecuenciaEnPalabras } from './fechas';
import { NOMBRE_ETAPA, ahora, devolucion, llegaEn, momentoCorto, yaLlego } from './flujo';
import { estadoAviso, faltantes, fueraDeRango, leerNumero, numeroCorto, numeroOT, textoRango, totalHorasHombre } from './preventivo';
import { ListaRepuestos, RepuestosEditor } from './Repuestos';
import { limpiarLineas, lineasParaCierre } from './lineasDeRepuestos';
import { useComponentes } from './useComponentes';
import { useMantenimiento } from './servicio';
import TecnicosEditor, { DetalleTecnicos } from './TecnicosEditor';
import EstadoOT from './EstadoOT';
import { useImprimirOrdenes } from './otPdf';
import type { Liberacion, Medicion, OrdenTrabajo, Prioridad, RepuestoLinea, TrabajoTecnico } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Icono } from '@/components/Icono';

interface Props {
  ordenId: string | null;
  onClose: () => void;
  onVerEquipo?: (equipoId: string) => void;
}

/** "HH:MM" de un momento (en la hora de la computadora). */
const horaDe = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// Detalle de una orden de trabajo (del diseño del socio): la lista de tareas para tildar OK / NO (se guarda en el momento), imprimirla,
// empezarla, terminarla, moverla de fecha o borrarla. Las tareas con medición piden anotar un valor (avisa si queda fuera del rango normal);
// al terminar, la liberación del equipo (los controles de entrega del formato de la OT).
// El circuito (del socio, 10/11/2026): el responsable la deriva al jefe de taller, el jefe la asigna, el técnico asignado la termina con su
// usuario, el jefe la revisa (o la devuelve con un comentario) y el responsable la aprueba: recién ahí va al historial del equipo y se
// descuentan los repuestos; si se pide, se generan las OT con lo pendiente o para revisar los valores fuera de rango.
// En las correctivas no se tilda: el técnico redacta el trabajo realizado y lo pendiente va en las observaciones.
export default function OrdenDetalleModal({ ordenId, onClose, onVerEquipo }: Props) {
  const s = useMantenimiento();
  const pedido = usePedido(ordenId ? `ot|${ordenId}|${s.revision}` : null, () => s.orden(ordenId!), true);
  const ot = ordenId && pedido.data?.id === ordenId ? pedido.data : null;
  return (
    <Modal open={!!ordenId} onClose={onClose} large title={<><Icono n="lista" /> {ot ? `${numeroOT(ot.numero)} · OT ${ot.tipo}` : 'Orden de trabajo'}</>}>
      {ot
        ? <Contenido key={ot.id} ot={ot} onClose={onClose} onVerEquipo={onVerEquipo} />
        : <div className="mt-vacio">{pedido.error ? 'No se pudo abrir la OT. Probá de nuevo.' : pedido.data === null && !pedido.cargando ? 'Esta OT ya no existe.' : 'Cargando...'}</div>}
    </Modal>
  );
}

const QUIEN_LA_TIENE: Record<OrdenTrabajo['etapa'], string> = {
  por_derivar: 'la tiene el responsable para mandarla al jefe de taller',
  por_asignar: 'la tiene el jefe de taller para asignarla',
  asignada: '',
  a_revisar: 'la revisa el jefe de taller',
  para_aprobar: 'la aprueba el responsable',
  aprobada: 'está en el historial del equipo',
};

function Contenido({ ot, onClose, onVerEquipo }: { ot: OrdenTrabajo; onClose: () => void; onVerEquipo?: (equipoId: string) => void }) {
  const uid = useId();
  const toast = useToast();
  const confirmar = useConfirm();
  const s = useMantenimiento();
  const imprimir = useImprimirOrdenes();
  const hoy = fechaHoyISO();
  const equipo = s.equipos?.find(e => e.id === ot.equipoId);
  const rutina = s.rutinas?.find(r => r.id === ot.rutinaId);
  const componentes = useComponentes(ot.equipoId);
  const abierta = ot.estado !== 'terminada';
  // quién puede qué: el técnico asignado la hace; el jefe la asigna y la revisa; el responsable la deriva y la aprueba
  const esAsignado = ot.asignados.some(a => a.id === s.usuarioId);
  const puede = s.trabaja && abierta && ot.etapa === 'asignada' && esAsignado;
  const puedeEditar = s.trabaja && abierta && (s.esAdmin || s.jefe || esAsignado);
  const esCorrectiva = ot.tipo === 'correctiva';
  const devuelta = devolucion(ot);
  const llego = yaLlego(ot, ahora(), s.config.horarioRecepcion);
  const asignadoA = ot.asignados.map(a => a.nombre).join(', ') || ot.asignado;

  // las marcas y los valores se ven al instante y se guardan por detrás, en orden. Mientras falta guardar algo, lo que llega de la base
  // (de un guardado anterior) no pisa lo que la persona ya tildó o anotó; con todo guardado, la última lectura deja todo al día.
  const [sinGuardar, setSinGuardar] = useState(0);
  const [marcas, setMarcas] = useState(() => new Map(ot.tareas.map(t => [t.id, t.hecha])));
  useAlCambiar([ot.tareas], () => { if (sinGuardar === 0) setMarcas(new Map(ot.tareas.map(t => [t.id, t.hecha]))); });
  const [valores, setValores] = useState(() => new Map(ot.tareas.map(t => [t.id, t.valor])));
  useAlCambiar([ot.tareas], () => { if (sinGuardar === 0) setValores(new Map(ot.tareas.map(t => [t.id, t.valor]))); });
  const guardando = useRef<Promise<unknown>>(Promise.resolve());
  const enOrden = (guardar: () => Promise<unknown>, siFalla: () => void) => {
    setSinGuardar(n => n + 1);
    guardando.current = guardando.current.then(guardar).catch(err => { toast(mensajeDeError(err), 'error'); siFalla(); })
      .finally(() => setSinGuardar(n => n - 1));
  };
  const hechas = ot.tareas.filter(t => marcas.get(t.id)).length;
  const conMedicion = ot.tareas.filter(t => t.medicion);
  const fuera = conMedicion.filter(t => fueraDeRango(t.medicion, valores.get(t.id)));
  const sinValor = conMedicion.filter(t => valores.get(t.id) == null).length;
  const pendientes = esCorrectiva ? 0 : ot.tareas.length - hechas;

  const [modo, setModo] = useState<'ver' | 'terminar' | 'mover' | 'repuestos' | 'falla' | 'asignar' | 'devolver' | 'aprobar'>('ver');
  const [ocupado, setOcupado] = useState(false);
  const [cierre, setCierre] = useState({ fecha: hoy, horas: '', obs: '', causa: '', solucion: '', parada: '' });
  const [liberacion, setLiberacion] = useState<Liberacion | null>(null);
  const [lineas, setLineas] = useState<RepuestoLinea[]>([]);
  const [tecnicos, setTecnicos] = useState<TrabajoTecnico[]>([]);
  const [falla, setFalla] = useState<{ prioridad: Prioridad; texto: string }>({ prioridad: 'normal', texto: '' });
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [verRecorrido, setVerRecorrido] = useState(false);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [comentario, setComentario] = useState('');
  const [opAprobar, setOpAprobar] = useState({ otPendientes: true, otPorValores: true, tareasNuevas: '' });

  async function hacer(accion: () => Promise<unknown>, exito?: string) {
    setOcupado(true);
    try {
      await accion();
      if (exito) toast(exito, 'success');
      return true;
    } catch (err) {
      toast(mensajeDeError(err), 'error');
      return false;
    } finally {
      setOcupado(false);
    }
  }

  function tildar(tareaId: string | null, hecha: boolean) {
    if (!puede) return;
    const nuevas = new Map(marcas);
    for (const t of ot.tareas) if (!tareaId || t.id === tareaId) nuevas.set(t.id, hecha);
    setMarcas(nuevas);
    enOrden(() => s.marcarTareas(ot.id, tareaId, hecha), () => setMarcas(new Map(ot.tareas.map(t => [t.id, t.hecha]))));
    // al quedar todas en OK, se abre el cierre ya completo: solo falta revisar y confirmar
    if (modo === 'ver' && ot.tareas.length > 0 && ot.tareas.every(t => nuevas.get(t.id))) abrirTerminar();
  }

  function anotar(tareaId: string, valor: number | null) {
    setValores(v => new Map(v).set(tareaId, valor));
    enOrden(() => s.anotarValor(ot.id, tareaId, valor), () => setValores(new Map(ot.tareas.map(t => [t.id, t.valor]))));
  }

  function abrirTerminar() {
    setCierre({ fecha: hoy, horas: '', obs: '', causa: '', solucion: '', parada: '' });
    // los controles de entrega del formato de la OT, sin tildar (sin controles, la OT no tiene liberación)
    setLiberacion(s.config.controlesLiberacion.length ? { controles: s.config.controlesLiberacion.map(texto => ({ texto, ok: false })), recibio: '' } : null);
    // ya completo: quien la termina y los demás técnicos asignados, con la hora en que la empezó (si fue hoy) y la de ahora como término
    const empezo = ot.empezadaAt ? new Date(ot.empezadaAt) : null;
    const inicio = empezo && empezo.toDateString() === new Date().toDateString() ? horaDe(empezo) : '';
    const ids = [s.usuarioId, ...ot.asignados.map(a => a.id).filter((id): id is string => !!id && id !== s.usuarioId)];
    setTecnicos(ids.flatMap(id => {
      const t = s.tecnicos.find(x => x.id === id);
      return t ? [{ usuarioId: t.id, nombre: t.nombre, fecha: hoy, inicio, fin: horaDe(new Date()) }] : [];
    }));
    setLineas(lineasParaCierre(ot.repuestos));
    setModo('terminar');
  }

  async function confirmarCierre(e: React.FormEvent) {
    e.preventDefault();
    const hh = totalHorasHombre(tecnicos);
    const h = hh ?? (cierre.horas.trim() ? Number(cierre.horas.replace(',', '.')) : null);
    if (h != null && (!Number.isFinite(h) || h < 0)) { toast('Las horas tienen que ser un número.', 'error'); return; }
    const hp = cierre.parada.trim() ? Number(cierre.parada.replace(',', '.')) : null;
    if (hp != null && (!Number.isFinite(hp) || hp < 0)) { toast('Las horas de parada tienen que ser un número.', 'error'); return; }
    if (esCorrectiva && !cierre.solucion.trim()) { toast('Escribí el trabajo realizado.', 'error'); return; }
    setOcupado(true);
    try {
      await guardando.current; // que se guarden antes las marcas y los valores
      const cuando = ahora();
      const siguiente = await s.terminarOt(ot.id, {
        fecha: cierre.fecha, observaciones: cierre.obs.trim(), horas: hh == null ? h : null, causa: cierre.causa.trim(), solucion: cierre.solucion.trim(), horasParada: hp,
        otPendientes: false, otPorValores: false, tecnicos, repuestos: limpiarLineas(lineas),
        liberacion: liberacion ? { ...liberacion, recibio: liberacion.recibio.trim() } : null,
      });
      const llega = llegaEn(cuando, s.config.horarioRecepcion);
      const partes = ['OT terminada.', llega === cuando ? 'Le llega al jefe de taller para revisar.' : `Le llega al jefe de taller para revisar el ${momentoCorto(llega)}.`];
      if (siguiente) partes.push(`Se programó la siguiente (${numeroOT(siguiente)}).`);
      toast(partes.join(' '), 'success');
      setModo('ver');
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    } finally {
      setOcupado(false);
    }
  }

  function abrirAsignar() {
    // de entrada, los que ya tiene; si no tiene, el responsable que figura en la rutina
    const ya = ot.asignados.map(a => a.id).filter((id): id is string => !!id);
    setElegidos(new Set(ya.length ? ya : rutina?.responsableId ? [rutina.responsableId] : []));
    setModo('asignar');
  }

  async function confirmarAprobar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      const r = await s.aprobarOt(ot.id, { otPendientes: opAprobar.otPendientes && pendientes > 0, otPorValores: opAprobar.otPorValores && fuera.length > 0, tareasNuevas: opAprobar.tareasNuevas });
      const partes = [`${numeroOT(ot.numero)} aprobada: ya está en el historial del equipo.`];
      if (r.descontados) partes.push(`Se descontaron del stock ${r.descontados === 1 ? '1 repuesto' : `${r.descontados} repuestos`}.`);
      if (r.faltantes) partes.push(`${r.faltantes === 1 ? 'A 1 repuesto' : `A ${r.faltantes} repuestos`} no le alcanzó el stock: quedó el aviso para el Depósito.`);
      const nuevas = [r.pendientes, r.aMano, r.valores].filter((n): n is number => n != null).map(numeroOT);
      if (nuevas.length) partes.push(`Se generó la ${nuevas.join(' y la ')} para el jefe de taller.`);
      toast(partes.join(' '), r.faltantes ? 'error' : 'success');
      setModo('ver');
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function borrar() {
    if (!(await confirmar(`¿Eliminar la ${numeroOT(ot.numero)}?`, { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    if (await hacer(() => s.eliminarOt(ot.id), 'OT eliminada')) onClose();
  }

  const estado = estadoAviso(ot, hoy);
  const faltan = abierta ? faltantes(ot.repuestos) : [];
  const parada = ot.correctivo ? ot.correctivo.horasParada : ot.horasParada;

  return (
    <div>
      <div className="mt-tags" style={{ marginBottom: 12, alignItems: 'center' }}>
        <EstadoOT ot={ot} estado={estado} />
        <span className={`mt-tag ${ot.tipo === 'preventiva' ? 'prev' : 'corr'}`}>{ot.tipo === 'preventiva' ? 'Preventiva' : 'Correctiva'}</span>
        <Button variant="ghost" size="sm" style={{ marginLeft: 'auto' }} onClick={() => void imprimir([ot])}><Icono n="imprimir" /> Imprimir OT</Button>
      </div>

      <div className={`mt-etapa ${ot.etapa}`}>
        <div>
          <strong>{NOMBRE_ETAPA[ot.etapa]}</strong>
          {ot.etapa === 'asignada' ? ` · ${asignadoA || 'sin técnico'}` : ` · ${QUIEN_LA_TIENE[ot.etapa]}`}
        </div>
        {!llego && ot.terminadaEn && (
          <div style={{ fontSize: 12 }}>Terminada el {momentoCorto(ot.terminadaEn)} · llega para revisar el {momentoCorto(llegaEn(ot.terminadaEn, s.config.horarioRecepcion))}</div>
        )}
        {ot.pasos.length > 0 && (
          <button type="button" className="mt-link" style={{ fontSize: 12, alignSelf: 'flex-start' }} onClick={() => setVerRecorrido(v => !v)} aria-expanded={verRecorrido}>
            {verRecorrido ? 'Ocultar recorrido' : `Ver recorrido (${ot.pasos.length})`}
          </button>
        )}
        {verRecorrido && (
          <ul className="mt-recorrido">
            {ot.pasos.map((p, i) => <li key={i}><span>{momentoCorto(p.cuando)}</span> <strong>{p.quien}</strong> {p.accion.charAt(0).toLowerCase() + p.accion.slice(1)}{p.comentario && <em> — {p.comentario}</em>}</li>)}
          </ul>
        )}
      </div>
      {devuelta && (
        <div className="mt-aviso amarillo" style={{ cursor: 'default' }}>
          <Icono n="volver" />
          <span style={{ flex: 1 }}>Devuelta por {devuelta.quien}: {devuelta.comentario}</span>
        </div>
      )}

      <div className="mt-datos" style={{ marginBottom: 14 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="mt-dato-label">Equipo</div>
          <div className="mt-dato-valor">
            {equipo ? <>{equipo.codigo} — {equipo.nombre}</> : 'Equipo eliminado'}
            {equipo && onVerEquipo && <button type="button" className="mt-link" style={{ marginLeft: 8, fontSize: 13 }} onClick={() => { onClose(); onVerEquipo(equipo.id); }}>ver ficha</button>}
          </div>
        </div>
        <div><div className="mt-dato-label">Fecha</div><div className="mt-dato-valor">{formatearFechaSola(ot.fechaProgramada)}</div></div>
        <div><div className="mt-dato-label">{esCorrectiva && !abierta ? 'Realizada por' : 'Asignada a'}</div><div className="mt-dato-valor">{asignadoA || '—'}</div></div>
        {rutina && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="mt-dato-label">Rutina</div>
            <div className="mt-dato-valor">Se repite {frecuenciaEnPalabras(rutina.frecuenciaDias)} · aviso {rutina.avisoDias} días antes</div>
          </div>
        )}
      </div>

      {ot.correctivo && modo !== 'falla' && (
        <div className="mt-bloque" style={{ padding: '10px 12px' }}>
          <div className="mt-bloque-titulo">
            <span><Icono n="alerta" /> Falla reportada</span>
            {puedeEditar && <button type="button" className="mt-link" style={{ fontSize: 12 }} onClick={() => { setFalla({ prioridad: ot.correctivo!.prioridad, texto: ot.correctivo!.falla }); setModo('falla'); }}>Cambiar</button>}
          </div>
          <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{ot.correctivo.falla || <span style={{ color: 'var(--text-muted)' }}>Sin detalle.</span>}</div>
          {!abierta && (
            <div className="mt-datos" style={{ marginTop: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}><div className="mt-dato-label">Causa</div><div className="mt-dato-valor">{ot.correctivo.causa || '—'}</div></div>
              <div style={{ gridColumn: '1 / -1' }}><div className="mt-dato-label">Trabajo realizado</div><div className="mt-dato-valor" style={{ whiteSpace: 'pre-wrap' }}>{ot.correctivo.solucion || '—'}</div></div>
            </div>
          )}
        </div>
      )}

      {modo === 'falla' && (
        <form onSubmit={e => { e.preventDefault(); void hacer(() => s.guardarFallaOt(ot.id, falla.prioridad, falla.texto.trim()), 'Guardado').then(ok => ok && setModo('ver')); }} className="mt-bloque">
          <div className="mt-bloque-titulo"><span><Icono n="alerta" /> Falla reportada</span></div>
          <div className="mt-chips" role="radiogroup" aria-label="Prioridad">
            {(['normal', 'urgente'] as const).map(p => (
              <button key={p} type="button" role="radio" aria-checked={falla.prioridad === p} className={`mt-chip${falla.prioridad === p ? ' activo' : ''}${p === 'urgente' ? ' alerta' : ''}`} onClick={() => setFalla(f => ({ ...f, prioridad: p }))}>
                {p === 'urgente' ? 'Urgente' : 'Normal'}
              </button>
            ))}
          </div>
          <Textarea value={falla.texto} onChange={e => setFalla(f => ({ ...f, texto: e.target.value }))} rows={3} aria-label="Falla reportada" data-autofocus maxLength={4000} />
          <div className="mt-acciones" style={{ marginTop: 12, marginBottom: 0 }}>
            <Button type="button" variant="ghost" onClick={() => setModo('ver')}>Volver</Button>
            <Button type="submit" variant="primary" disabled={ocupado}><Icono n="guardar" /> Guardar</Button>
          </div>
        </form>
      )}

      {modo !== 'repuestos' && modo !== 'terminar' && (ot.repuestos.length > 0 || puedeEditar) && (
        <div className="mt-bloque" style={{ padding: '10px 12px' }}>
          <div className="mt-bloque-titulo">
            <span><Icono n="paquete" /> Repuestos{abierta ? '' : ' usados'}</span>
            {puedeEditar && <button type="button" className="mt-link" style={{ fontSize: 12 }} onClick={() => { setLineas(ot.repuestos); setModo('repuestos'); }}>{ot.repuestos.length ? 'Cambiar' : 'Agregar'}</button>}
          </div>
          {ot.repuestos.length
            ? <ListaRepuestos lineas={abierta ? ot.repuestos : ot.repuestos.filter(r => (r.usado ?? 0) > 0 || r.cantidad > 0)} modo={abierta ? 'previsto' : 'usado'} />
            : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sin repuestos previstos.</div>}
          {faltan.length > 0 && <p style={{ fontSize: 12, color: 'var(--danger)', margin: '6px 0 0', fontWeight: 700 }}>No hay stock suficiente de {faltan.length === 1 ? 'un repuesto' : `${faltan.length} repuestos`}. La OT sigue igual; conviene pedirlo.</p>}
          {ot.etapa !== 'aprobada' && ot.repuestos.length > 0 && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>Se descuentan del stock al aprobar la OT, solo los que se usaron.</p>}
        </div>
      )}

      {modo === 'repuestos' && (
        <form onSubmit={e => { e.preventDefault(); void hacer(() => s.guardarRepuestosOt(ot.id, limpiarLineas(lineas)), 'Repuestos guardados').then(ok => ok && setModo('ver')); }} className="mt-bloque">
          <div className="mt-bloque-titulo"><span><Icono n="paquete" /> Repuestos previstos</span></div>
          <RepuestosEditor lineas={lineas} onChange={setLineas} componentes={componentes} />
          <div className="mt-acciones" style={{ marginTop: 12, marginBottom: 0 }}>
            <Button type="button" variant="ghost" onClick={() => setModo('ver')}>Volver</Button>
            <Button type="submit" variant="primary" disabled={ocupado}><Icono n="guardar" /> Guardar</Button>
          </div>
        </form>
      )}

      {/* correctiva: lo que hay que hacer, sin casilleros (el técnico redacta el trabajo realizado al terminar) */}
      {esCorrectiva && ot.tareas.length > 0 && (
        <div className="mt-bloque" style={{ padding: '10px 12px' }}>
          <div className="mt-bloque-titulo"><span><Icono n="lista" /> Qué hay que hacer</span></div>
          <ul className="mt-lista-simple">{ot.tareas.map(t => <li key={t.id}>{t.texto}</li>)}</ul>
        </div>
      )}

      {/* preventiva: la lista de tareas para tildar OK */}
      {!esCorrectiva && (
        <div className="mt-bloque" style={{ padding: '10px 12px' }}>
          <div className="mt-bloque-titulo">
            <span><Icono n="exito" /> Tareas · {hechas} de {ot.tareas.length} OK</span>
            {puede && ot.tareas.length > 1 && (
              <span style={{ display: 'flex', gap: 10, fontSize: 12, fontWeight: 700 }}>
                <button type="button" className="mt-link" onClick={() => tildar(null, true)}>Marcar todas</button>
                <button type="button" className="mt-link" onClick={() => tildar(null, false)}>Desmarcar</button>
              </span>
            )}
          </div>
          {ot.tareas.length > 1 && <div className="mt-progreso" aria-hidden="true"><div style={{ width: `${(hechas / ot.tareas.length) * 100}%` }} /></div>}
          <ul className="mt-checklist">
            {ot.tareas.map(t => {
              const hecha = marcas.get(t.id) === true;
              return (
                <li key={t.id}>
                  <label className={`mt-check${hecha ? ' hecha' : ''}${!puede ? ' fija' : ''}`}>
                    <input type="checkbox" checked={hecha} disabled={!puede} onChange={() => tildar(t.id, !hecha)} />
                    <span className="mt-check-caja" aria-hidden="true">{hecha ? <Icono n="ok" /> : !abierta ? <Icono n="cerrar" /> : null}</span>
                    <span className="mt-check-texto">{t.texto}</span>
                  </label>
                  {t.medicion && (
                    <CampoValor key={`${t.id}-${valores.get(t.id) ?? ''}`} medicion={t.medicion} valor={valores.get(t.id) ?? null} editable={puede} etiqueta={t.texto} onCambiar={v => anotar(t.id, v)} />
                  )}
                </li>
              );
            })}
          </ul>
          {puede && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>Lo que tildás{conMedicion.length > 0 && ' y los valores que anotás'} se guarda en el momento. Al tildar la última tarea se abre el cierre de la OT, ya completo.</p>}
          {abierta && !puede && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>Las tareas las tilda el técnico asignado, desde su usuario.</p>}
        </div>
      )}

      {!abierta && (
        <div className="mt-datos" style={{ marginBottom: 14 }}>
          <div><div className="mt-dato-label">Terminada el</div><div className="mt-dato-valor">{ot.fechaCierre ? formatearFechaSola(ot.fechaCierre) : '—'}</div></div>
          <div><div className="mt-dato-label">Horas</div><div className="mt-dato-valor">{ot.horas ?? '—'}</div></div>
          <div><div className="mt-dato-label">Horas de equipo parado</div><div className="mt-dato-valor">{parada ?? '—'}</div></div>
          {ot.observaciones && <div style={{ gridColumn: '1 / -1' }}><div className="mt-dato-label">Observaciones</div><div className="mt-dato-valor" style={{ whiteSpace: 'pre-wrap' }}>{ot.observaciones}</div></div>}
        </div>
      )}
      {!abierta && (
        <div className="mt-hist-detalle" style={{ margin: '0 0 14px', borderLeft: 'none', paddingLeft: 0 }}>
          <DetalleTecnicos tecnicos={ot.tecnicos} />
          {ot.liberacion && <DetalleLiberacion liberacion={ot.liberacion} recibe={s.config.recibeLiberacion} />}
        </div>
      )}
      {abierta && ot.observaciones && <p style={{ fontSize: 12, color: 'var(--text-mid)', margin: '0 0 12px' }}><Icono n="nota" /> {ot.observaciones}</p>}

      {modo === 'ver' && (
        <div className="mt-acciones">
          {s.esAdmin && ot.etapa === 'por_derivar' && (
            <Button variant="success" disabled={ocupado} onClick={() => void hacer(() => s.derivarOts([ot.id]), `${numeroOT(ot.numero)} derivada al jefe de taller`)}><Icono n="exportar" /> Derivar al jefe de taller</Button>
          )}
          {s.jefe && abierta && (ot.etapa === 'por_asignar' || ot.etapa === 'asignada') && (
            <Button variant={ot.etapa === 'por_asignar' ? 'success' : 'ghost'} onClick={abrirAsignar}><Icono n="usuarios" /> {ot.etapa === 'por_asignar' ? 'Asignar técnicos' : 'Reasignar'}</Button>
          )}
          {puede && ot.estado === 'pendiente' && <Button variant="primary" disabled={ocupado} onClick={() => void hacer(() => s.empezarOt(ot.id), 'OT en curso')}><Icono n="cohete" /> Empezar</Button>}
          {puede && <Button variant="success" onClick={abrirTerminar}><Icono n="exito" /> Terminar</Button>}
          {s.jefe && ot.etapa === 'a_revisar' && llego && (
            <>
              <Button variant="success" disabled={ocupado} onClick={() => void hacer(() => s.pasarAAprobacion(ot.id, ''), `${numeroOT(ot.numero)} revisada: le llega al responsable para aprobar`)}><Icono n="aprobar" /> Revisada: pasar a aprobación</Button>
              <Button variant="ghost" onClick={() => { setComentario(''); setModo('devolver'); }}><Icono n="volver" /> Devolver al técnico</Button>
            </>
          )}
          {s.esAdmin && ot.etapa === 'para_aprobar' && llego && (
            <>
              <Button variant="success" onClick={() => { setOpAprobar({ otPendientes: true, otPorValores: true, tareasNuevas: '' }); setModo('aprobar'); }}><Icono n="aprobar" /> Aprobar</Button>
              <Button variant="ghost" onClick={() => { setComentario(''); setModo('devolver'); }}><Icono n="volver" /> Devolver al técnico</Button>
            </>
          )}
          {abierta && (s.esAdmin || s.jefe) && <Button variant="ghost" onClick={() => { setNuevaFecha(ot.fechaProgramada); setModo('mover'); }}><Icono n="fecha" /> Cambiar fecha</Button>}
          {s.esAdmin && esCorrectiva && abierta && <Button variant="dangerGhost" onClick={() => void borrar()}><Icono n="borrar" /> Eliminar</Button>}
        </div>
      )}

      {modo === 'asignar' && (
        <form onSubmit={e => { e.preventDefault(); void hacer(() => s.asignarOt(ot.id, [...elegidos]), `${numeroOT(ot.numero)} asignada`).then(ok => ok && setModo('ver')); }} className="mt-bloque">
          <div className="mt-bloque-titulo"><span><Icono n="usuarios" /> Asignar técnicos</span></div>
          <div className="mt-liberacion" role="group" aria-label="Técnicos">
            {s.tecnicos.map(t => (
              <label key={t.id}>
                <input type="checkbox" checked={elegidos.has(t.id)} onChange={e => setElegidos(prev => { const n = new Set(prev); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n; })} />
                {t.nombre}
              </label>
            ))}
          </div>
          {!s.tecnicos.length && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Todavía no hay técnicos: un dueño les da el rol en Configuración → Usuarios.</div>}
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>A cada uno le aparece en sus OT. Cada técnico carga sus horas al terminarla.</p>
          <div className="mt-acciones" style={{ marginTop: 12, marginBottom: 0 }}>
            <Button type="button" variant="ghost" onClick={() => setModo('ver')}>Volver</Button>
            <Button type="submit" variant="success" disabled={ocupado || !elegidos.size}><Icono n="ok" /> Asignar</Button>
          </div>
        </form>
      )}

      {modo === 'devolver' && (
        <form onSubmit={e => { e.preventDefault(); void hacer(() => s.devolverOt(ot.id, comentario.trim()), `${numeroOT(ot.numero)} devuelta al técnico`).then(ok => ok && setModo('ver')); }} className="mt-bloque">
          <div className="mt-bloque-titulo"><span><Icono n="volver" /> Devolver al técnico</span></div>
          <Textarea value={comentario} onChange={e => setComentario(e.target.value)} rows={3} aria-label="Qué tiene que corregir o completar" placeholder="Qué tiene que corregir o completar" data-autofocus maxLength={2000} required />
          <div className="mt-acciones" style={{ marginTop: 12, marginBottom: 0 }}>
            <Button type="button" variant="ghost" onClick={() => setModo('ver')}>Volver</Button>
            <Button type="submit" variant="primary" disabled={ocupado || !comentario.trim()}><Icono n="volver" /> Devolver</Button>
          </div>
        </form>
      )}

      {modo === 'aprobar' && (
        <form onSubmit={confirmarAprobar} className="mt-bloque">
          <div className="mt-bloque-titulo"><span><Icono n="aprobar" /> Aprobar la OT</span></div>
          <p style={{ fontSize: 13, margin: '0 0 10px' }}>Al aprobarla pasa al historial del equipo y se descuentan del stock los repuestos usados.</p>
          {pendientes > 0 && (
            <label className="mt-opcion">
              <input type="checkbox" checked={opAprobar.otPendientes} onChange={e => setOpAprobar(o => ({ ...o, otPendientes: e.target.checked }))} />
              Generar una OT con {pendientes === 1 ? 'la tarea que quedó en NO' : `las ${pendientes} tareas que quedaron en NO`} (va al jefe de taller)
            </label>
          )}
          {esCorrectiva && (
            <div style={{ marginTop: 6 }}>
              {ot.observaciones && <p style={{ fontSize: 13, margin: '0 0 6px' }}><strong>Observaciones del técnico:</strong> {ot.observaciones}</p>}
              <label htmlFor={`${uid}-tn`} style={{ fontSize: 13, fontWeight: 700 }}>Si quedó algo pendiente, escribí las tareas para una OT nueva (una por renglón; va al jefe de taller)</label>
              <Textarea id={`${uid}-tn`} rows={2} value={opAprobar.tareasNuevas} onChange={e => setOpAprobar(o => ({ ...o, tareasNuevas: e.target.value }))} placeholder="Vacío = no se genera ninguna OT" maxLength={4000} />
            </div>
          )}
          {fuera.length > 0 && (
            <label className="mt-opcion" style={{ color: 'var(--danger)' }}>
              <input type="checkbox" checked={opAprobar.otPorValores} onChange={e => setOpAprobar(o => ({ ...o, otPorValores: e.target.checked }))} />
              Generar una OT correctiva para revisar {fuera.length === 1 ? 'el valor fuera de rango' : `los ${fuera.length} valores fuera de rango`}
            </label>
          )}
          <div className="mt-acciones" style={{ marginTop: 12, marginBottom: 0 }}>
            <Button type="button" variant="ghost" onClick={() => setModo('ver')}>Volver</Button>
            <Button type="submit" variant="success" disabled={ocupado}><Icono n="aprobar" /> {ocupado ? 'Guardando...' : 'Aprobar'}</Button>
          </div>
        </form>
      )}

      {modo === 'terminar' && (
        <form onSubmit={confirmarCierre} className="mt-bloque">
          <div className="mt-bloque-titulo"><span><Icono n="exito" /> Terminar la OT</span></div>
          {!esCorrectiva && (
            <p style={{ fontSize: 13, margin: '0 0 10px', color: pendientes ? '#8a5a00' : 'var(--success)', fontWeight: 700 }}>
              {pendientes === 0 ? `${ot.tareas.length === 1 ? 'La tarea quedó OK' : `Las ${ot.tareas.length} tareas quedaron OK`}.` : `${hechas} de ${ot.tareas.length} tareas OK. Quedan ${pendientes} en NO.`}
              {hechas === 0 && ot.tareas.length > 0 && ' (Tildá arriba las que quedaron OK.)'}
            </p>
          )}
          {conMedicion.length > 0 && (
            <div className="mt-valores-cierre">
              {conMedicion.map(t => {
                const v = valores.get(t.id) ?? null;
                const afuera = fueraDeRango(t.medicion, v);
                return (
                  <div key={t.id} className={afuera ? 'fuera' : v == null ? 'falta' : ''}>
                    <span>{t.texto}:</span> <strong>{v != null ? `${numeroCorto(v)} ${t.medicion!.unidad}`.trim() : 'sin anotar'}</strong>
                    {afuera && <> — fuera de rango ({textoRango(t.medicion!)})</>}
                  </div>
                );
              })}
              {sinValor > 0 && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#8a5a00', fontWeight: 700 }}>{sinValor === 1 ? 'Falta anotar 1 valor' : `Faltan anotar ${sinValor} valores`} (podés anotarlos arriba antes de confirmar).</p>}
            </div>
          )}
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor={`${uid}-f`}>Fecha en que se hizo</label>
              <Input id={`${uid}-f`} type="date" value={cierre.fecha} max={hoy} onChange={e => setCierre(c => ({ ...c, fecha: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label htmlFor={`${uid}-hp`}>Horas de equipo parado</label>
              <Input id={`${uid}-hp`} inputMode="decimal" value={cierre.parada} onChange={e => setCierre(c => ({ ...c, parada: e.target.value }))} placeholder={esCorrectiva ? 'Ej.: 3,5' : 'Vacío si no se paró'} />
            </div>
            <div className="form-group full">
              <label>Técnicos</label>
              <TecnicosEditor tecnicos={tecnicos} onChange={setTecnicos} fecha={cierre.fecha} />
              {totalHorasHombre(tecnicos) == null && (
                <div className="mt-rep-campo" style={{ marginTop: 8, maxWidth: 220 }}>
                  <label htmlFor={`${uid}-h`}>O las horas de trabajo en total</label>
                  <Input id={`${uid}-h`} inputMode="decimal" value={cierre.horas} onChange={e => setCierre(c => ({ ...c, horas: e.target.value }))} />
                </div>
              )}
            </div>
            {ot.correctivo && (
              <>
                <div className="form-group full">
                  <label htmlFor={`${uid}-ca`}>Causa de la falla</label>
                  <Textarea id={`${uid}-ca`} rows={2} value={cierre.causa} onChange={e => setCierre(c => ({ ...c, causa: e.target.value }))} placeholder="Por qué pasó. Ej.: falta de lubricación" maxLength={4000} />
                </div>
                <div className="form-group full">
                  <label htmlFor={`${uid}-so`}>Trabajo realizado *</label>
                  <Textarea id={`${uid}-so`} rows={4} value={cierre.solucion} onChange={e => setCierre(c => ({ ...c, solucion: e.target.value }))} placeholder="Contá qué hiciste para arreglarlo" maxLength={4000} />
                </div>
              </>
            )}
            <div className="form-group full">
              <label>Repuestos que se usaron</label>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Poné 0 en lo que no se cambió: eso no se descuenta del stock. Podés agregar repuestos que no estaban previstos. El precio suma a los costos del equipo.</div>
              <RepuestosEditor lineas={lineas} onChange={setLineas} componentes={componentes} modo="cierre" conPrecio />
            </div>
            <div className="form-group full">
              <label htmlFor={`${uid}-o`}>{esCorrectiva ? 'Observaciones (si quedó algo pendiente)' : 'Observaciones'}</label>
              <Textarea id={`${uid}-o`} value={cierre.obs} onChange={e => setCierre(c => ({ ...c, obs: e.target.value }))} placeholder="Qué se encontró, por qué quedó algo en NO..." maxLength={4000} />
            </div>
            {liberacion && (
              <div className="form-group full">
                <label id={`${uid}-lib`}>Liberación del equipo — verificación de entrega</label>
                <div className="mt-liberacion" role="group" aria-labelledby={`${uid}-lib`}>
                  {liberacion.controles.map((c, i) => (
                    <label key={i}>
                      <input type="checkbox" checked={c.ok} onChange={e => setLiberacion(l => l && { ...l, controles: l.controles.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)) })} />
                      {c.texto}
                    </label>
                  ))}
                </div>
                <div className="mt-rep-campo" style={{ marginTop: 8, maxWidth: 360 }}>
                  <label htmlFor={`${uid}-rec`}>{s.config.recibeLiberacion || 'Recibió'}</label>
                  <Input id={`${uid}-rec`} value={liberacion.recibio} onChange={e => setLiberacion(l => l && { ...l, recibio: e.target.value })} placeholder="Nombre de quien recibe el equipo" maxLength={120} />
                </div>
                {liberacion.controles.some(c => !c.ok) && <div style={{ fontSize: 12, color: '#8a5a00', fontWeight: 700, marginTop: 4 }}>Quedan controles sin tildar.</div>}
              </div>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-mid)', margin: '10px 0 0' }}>
            Al confirmar, le llega al jefe de taller para revisar; va al historial y descuenta los repuestos cuando la aprueba el responsable.
            {rutina && ` La próxima de esta rutina se programa sola ${frecuenciaEnPalabras(rutina.frecuenciaDias)}, contando desde la fecha en que se hizo.`}
          </p>
          <div className="mt-acciones" style={{ marginTop: 12, marginBottom: 0 }}>
            <Button type="button" variant="ghost" onClick={() => setModo('ver')}>Volver</Button>
            <Button type="submit" variant="success" disabled={ocupado}><Icono n="exito" /> {ocupado ? 'Guardando...' : 'Confirmar'}</Button>
          </div>
        </form>
      )}

      {modo === 'mover' && (
        <form onSubmit={e => { e.preventDefault(); if (nuevaFecha) void hacer(() => s.reprogramarOt(ot.id, nuevaFecha), `OT movida al ${formatearFechaSola(nuevaFecha)}`).then(ok => ok && setModo('ver')); }} className="mt-bloque">
          <div className="mt-bloque-titulo"><span><Icono n="fecha" /> Cambiar la fecha</span></div>
          <Input type="date" value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)} required aria-label="Nueva fecha" />
          {rutina && <p style={{ fontSize: 12, color: 'var(--text-mid)', margin: '8px 0 0' }}>También se mueve la rutina: las siguientes se cuentan desde la fecha en que se haga.</p>}
          <div className="mt-acciones" style={{ marginTop: 12, marginBottom: 0 }}>
            <Button type="button" variant="ghost" onClick={() => setModo('ver')}>Volver</Button>
            <Button type="submit" variant="primary" disabled={ocupado}><Icono n="guardar" /> Guardar</Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Casillero para anotar el valor de una medición (del diseño del socio). Se guarda al salir del campo o con Enter. */
function CampoValor({ medicion, valor, editable, etiqueta, onCambiar }: { medicion: Medicion; valor: number | null; editable: boolean; etiqueta: string; onCambiar: (v: number | null) => void }) {
  const toast = useToast();
  const [texto, setTexto] = useState(valor != null ? String(valor).replace('.', ',') : '');
  const fuera = fueraDeRango(medicion, valor);
  const rango = textoRango(medicion);

  function guardar() {
    const n = leerNumero(texto);
    if (Number.isNaN(n)) { toast(`"${texto}" no es un número.`, 'error'); setTexto(valor != null ? String(valor).replace('.', ',') : ''); return; }
    if (n !== valor) onCambiar(n);
  }

  return (
    <div className={`mt-valor${fuera ? ' fuera' : ''}`}>
      {editable ? (
        <Input
          type="text" inputMode="decimal" aria-label={`Valor de: ${etiqueta}`} value={texto} placeholder="Valor"
          onChange={e => setTexto(e.target.value)} onBlur={guardar}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        />
      ) : (
        <strong className="mt-valor-fijo">{valor != null ? numeroCorto(valor) : '—'}</strong>
      )}
      <span className="mt-valor-unidad">{medicion.unidad}</span>
      {rango && rango !== medicion.unidad && <span className="mt-valor-rango">{rango}</span>}
      {fuera && <span className="mt-tag falta"><Icono n="alerta" /> Fuera de rango</span>}
    </div>
  );
}

/** La liberación de una OT terminada: los controles de entrega y quién recibió el equipo. */
function DetalleLiberacion({ liberacion, recibe }: { liberacion: Liberacion; recibe: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div className="mt-dato-label">Liberación del equipo</div>
      <ul className="mt-hist-tareas">
        {liberacion.controles.map((c, i) => <li key={i} className={c.ok ? '' : 'no'}><Icono n={c.ok ? 'ok' : 'cerrar'} /> {c.texto}{!c.ok && ' (sin verificar)'}</li>)}
      </ul>
      <div style={{ fontSize: 13, marginTop: 4 }}>{recibe || 'Recibió'}: <strong>{liberacion.recibio || '—'}</strong></div>
    </div>
  );
}
