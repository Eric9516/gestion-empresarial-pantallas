import { useId, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { fechaHoyISO, formatearFechaSola } from '../../lib/fechaHoy';
import { mensajeDeError } from '../../lib/errores';
import { frecuenciaEnPalabras } from './fechas';
import { diasDeAviso, estadoAviso, fueraDeRango, liberacionInicial, totalHorasHombre, listaDeTareas, marcasDe, medicionesDe, numeroCorto, textoRango, valoresDe } from './preventivo';
import { useComponentesDeEquipo, useEquiposQuery } from './useEquipos';
import { useFaltantes } from './useStockRepuestos';
import RepuestosEditor from './RepuestosEditor';
import ListaRepuestos from './ListaRepuestos';
import { limpiarLineas, lineasParaCierre } from './repuestos';
import type { Liberacion, Medicion, Prioridad, RepuestoLinea, TrabajoTecnico } from './tipos';
import TecnicosEditor from './TecnicosEditor';
import DetalleCierre from './DetalleCierre';
import { nuevoId } from './almacenDemo';
import {
  useAnotarValor, useCambiarEstadoOrden, useConfigMantenimiento, useCerrarOrden, useEliminarOrden, useGuardarDetalleCorrectivo, useGuardarRepuestosOrden, useMarcarTareas, useOrdenesQuery, useReprogramarOrden, useRutinasQuery,
} from './usePreventivo';
import { useImprimirOrdenes } from './useImprimirOrdenes';
import EstadoOT from './EstadoOT';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Icono } from '@/components/Icono';

interface Props {
  ordenId: string | null;
  onClose: () => void;
  onVerEquipo?: (equipoId: string) => void;
  esAdmin: boolean;
  personas: string[];
}

// Detalle de una orden de trabajo: lista de tareas para tildar, imprimirla, empezarla, terminarla
// (queda en el historial del equipo con lo que se hizo y lo que no), moverla de fecha o eliminarla.
export default function OrdenDetalleModal({ ordenId, onClose, onVerEquipo, esAdmin, personas }: Props) {
  const uid = useId();
  const toast = useToast();
  const confirmar = useConfirm();
  const { data: ordenes } = useOrdenesQuery();
  const { data: rutinas } = useRutinasQuery();
  const { data: equipos } = useEquiposQuery();
  const cambiarEstado = useCambiarEstadoOrden();
  const marcar = useMarcarTareas();
  const anotar = useAnotarValor();
  const config = useConfigMantenimiento();
  const cerrar = useCerrarOrden();
  const reprogramar = useReprogramarOrden();
  const eliminar = useEliminarOrden();
  const imprimir = useImprimirOrdenes();
  const guardarRepuestos = useGuardarRepuestosOrden();
  const guardarCorrectivo = useGuardarDetalleCorrectivo();
  const faltantes = useFaltantes();

  const ot = ordenes.find(o => o.id === ordenId) ?? null;
  const equipo = equipos.find(e => e.id === ot?.equipoId);
  const rutina = rutinas.find(r => r.id === ot?.rutinaId);
  const hoy = fechaHoyISO();

  const componentes = useComponentesDeEquipo(ot?.equipoId ?? null);
  const [modo, setModo] = useState<'ver' | 'terminar' | 'mover' | 'repuestos' | 'falla'>('ver');
  const [cierre, setCierre] = useState({ fecha: hoy, por: '', horas: '', obs: '', otNueva: true, otValores: true, causa: '', solucion: '', parada: '' });
  const [lineas, setLineas] = useState<RepuestoLinea[]>([]);
  const [tecnicos, setTecnicos] = useState<TrabajoTecnico[]>([]);
  const [liberacion, setLiberacion] = useState<Liberacion | null>(null);
  const [falla, setFalla] = useState({ prioridad: 'normal' as Prioridad, texto: '' });
  const [nuevaFecha, setNuevaFecha] = useState('');

  const tareas = ot ? listaDeTareas(ot.tareas) : [];
  const marcas = ot ? marcasDe(ot) : [];
  const mediciones = ot ? medicionesDe(ot) : [];
  const valores = ot ? valoresDe(ot) : [];
  const hechas = marcas.filter(Boolean).length;
  const abierta = !!ot && ot.estado !== 'terminada';

  function cerrarModal() {
    setModo('ver');
    onClose();
  }

  function tildar(i: number) {
    if (!ot || !abierta) return;
    const nuevas = [...marcas];
    nuevas[i] = !nuevas[i];
    void marcar.mutateAsync({ id: ot.id, tareasHechas: nuevas });
    siTodoListo(nuevas);
  }

  function tildarTodas(valor: boolean) {
    if (!ot || !abierta) return;
    const nuevas = tareas.map(() => valor);
    void marcar.mutateAsync({ id: ot.id, tareasHechas: nuevas });
    siTodoListo(nuevas);
  }

  function anotarValor(i: number, valor: number | null) {
    if (!ot || !abierta) return;
    void anotar.mutateAsync({ id: ot.id, indice: i, valor });
    if (valor != null) {
      const nuevas = [...marcas];
      nuevas[i] = true;
      siTodoListo(nuevas);
    }
  }

  // Al quedar todas las tareas tildadas, se abre el cierre ya completo: solo falta revisar y confirmar.
  function siTodoListo(nuevas: boolean[]) {
    if (modo === 'ver' && nuevas.length > 0 && nuevas.every(Boolean)) abrirTerminar();
  }

  function abrirTerminar() {
    setCierre({ fecha: hoy, por: ot?.asignadoA ?? '', horas: '', obs: '', otNueva: true, otValores: true, causa: '', solucion: '', parada: '' });
    // Ya completo: el técnico asignado (con hora de término = ahora), la liberación sin tildar.
    const fin = horaActual();
    setTecnicos((ot?.asignadoA ?? '').split(/[,;]/).map(n => n.trim()).filter(Boolean).map(nombre => ({ id: nuevoId(), nombre, fecha: hoy, inicio: '', fin })));
    setLiberacion(liberacionInicial(config));
    setLineas(lineasParaCierre(ot?.repuestos ?? []));
    setModo('terminar');
  }

  function abrirRepuestos() {
    setLineas(ot?.repuestos ?? []);
    setModo('repuestos');
  }

  async function guardarLineas(e: React.FormEvent) {
    e.preventDefault();
    if (!ot) return;
    const limpias = limpiarLineas(lineas);
    await guardarRepuestos.mutateAsync({ id: ot.id, repuestos: limpias });
    const faltan = faltantes(limpias);
    toast(faltan.length ? `Repuestos guardados. Falta stock de ${faltan.map(l => l.descripcion || l.codigo).join(', ')}` : 'Repuestos guardados', faltan.length ? 'error' : 'success');
    setModo('ver');
  }

  function abrirFalla() {
    setFalla({ prioridad: ot?.correctivo?.prioridad ?? 'normal', texto: ot?.correctivo?.falla ?? '' });
    setModo('falla');
  }

  async function guardarFalla(e: React.FormEvent) {
    e.preventDefault();
    if (!ot) return;
    await guardarCorrectivo.mutateAsync({ id: ot.id, cambios: { prioridad: falla.prioridad, falla: falla.texto.trim() } });
    toast('Guardado', 'success');
    setModo('ver');
  }

  async function confirmarCierre(e: React.FormEvent) {
    e.preventDefault();
    if (!ot) return;
    const conNombre = tecnicos.filter(t => t.nombre.trim()).map(t => ({ ...t, nombre: t.nombre.trim() }));
    const hh = totalHorasHombre(conNombre);
    const h = hh ?? (cierre.horas.trim() ? Number(cierre.horas.replace(',', '.')) : null);
    if (h != null && (!Number.isFinite(h) || h < 0)) { toast('Las horas tienen que ser un número.', 'error'); return; }
    const hp = cierre.parada.trim() ? Number(cierre.parada.replace(',', '.')) : null;
    if (hp != null && (!Number.isFinite(hp) || hp < 0)) { toast('Las horas de parada tienen que ser un número.', 'error'); return; }
    const usados = limpiarLineas(lineas);
    try {
      const nuevas = await cerrar.mutateAsync({
        id: ot.id,
        pendientesEnOtNueva: cierre.otNueva,
        correctivaPorValores: cierre.otValores,
        datos: {
          fechaCierre: cierre.fecha, tareasHechas: marcas, realizadoPor: conNombre.map(t => t.nombre).join(', '), horas: h, tecnicos: conNombre,
          liberacion: liberacion ? { ...liberacion, recibio: liberacion.recibio.trim() } : null, repuestosUsados: '', observaciones: cierre.obs.trim(),
          repuestos: usados,
          correctivo: ot.correctivo ? { causa: cierre.causa.trim(), solucion: cierre.solucion.trim(), horasParada: hp } : undefined,
        },
      });
      const partes = ['OT terminada y anotada en el historial.'];
      const descontados = usados.filter(l => (l.usado ?? 0) > 0 && l.codigo).length;
      if (descontados) partes.push(`Se descontaron del stock ${descontados === 1 ? '1 repuesto' : `${descontados} repuestos`}.`);
      if (rutina) partes.push('Se programó la siguiente.');
      if (nuevas.pendientes) partes.push(`Lo que faltó quedó en la ${nuevas.pendientes}.`);
      if (nuevas.valores) partes.push(`Los valores fuera de rango se revisan en la ${nuevas.valores}.`);
      toast(partes.join(' '), 'success');
      setModo('ver');
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    }
  }

  async function mover(e: React.FormEvent) {
    e.preventDefault();
    if (!ot || !nuevaFecha) return;
    await reprogramar.mutateAsync({ id: ot.id, fecha: nuevaFecha });
    toast(`OT movida al ${formatearFechaSola(nuevaFecha)}`, 'success');
    setModo('ver');
  }

  async function borrar() {
    if (!ot) return;
    if (!(await confirmar(`¿Eliminar la ${ot.numero}?`, { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    await eliminar.mutateAsync(ot.id);
    toast('OT eliminada', 'success');
    cerrarModal();
  }

  const estado = ot ? estadoAviso(ot, hoy, diasDeAviso(ot, rutinas)) : 'programada';
  const pendientes = tareas.length - hechas;
  const sinValor = tareas.filter((_, i) => mediciones[i] && valores[i] == null).length;
  const fuera = tareas.flatMap((t, i) => (fueraDeRango(mediciones[i], valores[i]) ? [{ t, v: valores[i]!, m: mediciones[i]! }] : []));
  const faltan = ot && abierta ? faltantes(ot.repuestos) : [];

  return (
    <Modal open={!!ot} onClose={cerrarModal} title={<><Icono n="lista" /> {ot?.numero} · OT {ot?.tipo}</>}>
      {ot && (
        <div>
          <div className="mt-tags" style={{ marginBottom: 12, alignItems: 'center' }}>
            <EstadoOT ot={ot} estado={estado} />
            <span className={`mt-tag ${ot.tipo === 'preventiva' ? 'prev' : 'corr'}`}>{ot.tipo === 'preventiva' ? 'Preventiva' : 'Correctiva'}</span>
            <Button variant="ghost" size="sm" style={{ marginLeft: 'auto' }} onClick={() => void imprimir([ot])}><Icono n="imprimir" /> Imprimir OT</Button>
          </div>

          <div className="mt-datos" style={{ marginBottom: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="mt-dato-label">Equipo</div>
              <div className="mt-dato-valor">
                {equipo ? <>{equipo.codigo} — {equipo.nombre}</> : 'Equipo eliminado'}
                {equipo && onVerEquipo && (
                  <button type="button" onClick={() => { cerrarModal(); onVerEquipo(equipo.id); }} style={{ marginLeft: 8, background: 'none', border: 'none', padding: 0, color: 'var(--blue)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', fontSize: 13 }}>ver ficha</button>
                )}
              </div>
            </div>
            <div>
              <div className="mt-dato-label">Fecha</div>
              <div className="mt-dato-valor">{formatearFechaSola(ot.fechaProgramada)}</div>
            </div>
            <div>
              <div className="mt-dato-label">Asignada a</div>
              <div className="mt-dato-valor">{ot.asignadoA || '—'}</div>
            </div>
            {rutina && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div className="mt-dato-label">Rutina</div>
                <div className="mt-dato-valor">Se repite {frecuenciaEnPalabras(rutina.frecuenciaDias)} · aviso {rutina.avisoDiasAntes} días antes</div>
              </div>
            )}
          </div>

          {ot.correctivo && modo !== 'falla' && (
            <div className="mt-bloque" style={{ padding: '10px 12px' }}>
              <div className="mt-bloque-titulo">
                <span><Icono n="alerta" /> Falla reportada</span>
                {abierta && <button type="button" className="mt-link" style={{ fontSize: 12 }} onClick={abrirFalla}>Cambiar</button>}
              </div>
              <div style={{ fontSize: 14 }}>{ot.correctivo.falla || <span style={{ color: 'var(--text-muted)' }}>Sin detalle.</span>}</div>
              {ot.estado === 'terminada' && (
                <div className="mt-datos" style={{ marginTop: 10 }}>
                  <div style={{ gridColumn: '1 / -1' }}><div className="mt-dato-label">Causa</div><div className="mt-dato-valor">{ot.correctivo.causa || '—'}</div></div>
                  <div style={{ gridColumn: '1 / -1' }}><div className="mt-dato-label">Solución</div><div className="mt-dato-valor">{ot.correctivo.solucion || '—'}</div></div>
                  <div><div className="mt-dato-label">Horas de parada</div><div className="mt-dato-valor">{ot.correctivo.horasParada ?? '—'}</div></div>
                </div>
              )}
            </div>
          )}

          {modo === 'falla' && (
            <form onSubmit={guardarFalla} className="mt-bloque">
              <div className="mt-bloque-titulo"><span><Icono n="alerta" /> Falla reportada</span></div>
              <div className="mt-chips" role="radiogroup" aria-label="Prioridad">
                {(['normal', 'urgente'] as const).map(p => (
                  <button key={p} type="button" role="radio" aria-checked={falla.prioridad === p} className={`mt-chip${falla.prioridad === p ? ' activo' : ''}${p === 'urgente' ? ' alerta' : ''}`} onClick={() => setFalla(f => ({ ...f, prioridad: p }))}>
                    {p === 'urgente' ? 'Urgente' : 'Normal'}
                  </button>
                ))}
              </div>
              <Textarea value={falla.texto} onChange={e => setFalla(f => ({ ...f, texto: e.target.value }))} rows={3} aria-label="Falla reportada" data-autofocus />
              <div className="mt-acciones" style={{ marginTop: 12, marginBottom: 0 }}>
                <Button type="button" variant="ghost" onClick={() => setModo('ver')}>Volver</Button>
                <Button type="submit" variant="primary"><Icono n="guardar" /> Guardar</Button>
              </div>
            </form>
          )}

          {modo !== 'repuestos' && modo !== 'terminar' && (ot.repuestos.length > 0 || abierta) && (
            <div className="mt-bloque" style={{ padding: '10px 12px' }}>
              <div className="mt-bloque-titulo">
                <span><Icono n="paquete" /> Repuestos{ot.estado === 'terminada' ? ' usados' : ''}</span>
                {abierta && <button type="button" className="mt-link" style={{ fontSize: 12 }} onClick={abrirRepuestos}>{ot.repuestos.length ? 'Cambiar' : 'Agregar'}</button>}
              </div>
              {ot.repuestos.length
                ? <ListaRepuestos lineas={ot.repuestos} modo={abierta ? 'previsto' : 'usado'} />
                : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sin repuestos previstos.</div>}
              {faltan.length > 0 && <p style={{ fontSize: 12, color: 'var(--danger)', margin: '6px 0 0', fontWeight: 700 }}>No hay stock suficiente de {faltan.length === 1 ? 'un repuesto' : `${faltan.length} repuestos`}. La OT sigue igual; conviene pedirlo.</p>}
              {abierta && ot.repuestos.length > 0 && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>Se descuentan del stock al terminar la OT, solo los que se usaron.</p>}
            </div>
          )}

          {modo === 'repuestos' && (
            <form onSubmit={guardarLineas} className="mt-bloque">
              <div className="mt-bloque-titulo"><span><Icono n="paquete" /> Repuestos previstos</span></div>
              <RepuestosEditor lineas={lineas} onChange={setLineas} componentes={componentes} />
              <div className="mt-acciones" style={{ marginTop: 12, marginBottom: 0 }}>
                <Button type="button" variant="ghost" onClick={() => setModo('ver')}>Volver</Button>
                <Button type="submit" variant="primary"><Icono n="guardar" /> Guardar</Button>
              </div>
            </form>
          )}

          {/* Lista de tareas para tildar */}
          <div className="mt-bloque" style={{ padding: '10px 12px' }}>
            <div className="mt-bloque-titulo">
              <span><Icono n="exito" /> Tareas · {hechas} de {tareas.length} hechas</span>
              {abierta && tareas.length > 1 && (
                <span style={{ display: 'flex', gap: 10, fontSize: 12, fontWeight: 700 }}>
                  <button type="button" className="mt-link" onClick={() => tildarTodas(true)}>Marcar todas</button>
                  <button type="button" className="mt-link" onClick={() => tildarTodas(false)}>Desmarcar</button>
                </span>
              )}
            </div>
            {tareas.length > 1 && (
              <div className="mt-progreso" aria-hidden="true"><div style={{ width: `${(hechas / tareas.length) * 100}%` }} /></div>
            )}
            <ul className="mt-checklist">
              {tareas.map((t, i) => (
                <li key={i}>
                  <label className={`mt-check${marcas[i] ? ' hecha' : ''}${!abierta ? ' fija' : ''}`}>
                    <input type="checkbox" checked={marcas[i]} disabled={!abierta} onChange={() => tildar(i)} />
                    <span className="mt-check-caja" aria-hidden="true">{marcas[i] ? <Icono n="ok" trazo={3} /> : !abierta ? <Icono n="cerrar" trazo={3} /> : null}</span>
                    <span className="mt-check-texto">{t}</span>
                  </label>
                  {mediciones[i] && (
                    <CampoValor
                      key={`${ot.id}-${i}-${valores[i] ?? ''}`} medicion={mediciones[i]!} valor={valores[i]} editable={abierta}
                      etiqueta={t} onCambiar={v => anotarValor(i, v)}
                    />
                  )}
                </li>
              ))}
            </ul>
            {abierta && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>Lo que tildás y los valores que anotás se guardan en el momento. Al tildar la última tarea se abre el cierre de la OT, ya completo.</p>}
          </div>

          {ot.estado === 'terminada' && (
            <div className="mt-datos" style={{ marginBottom: 14 }}>
              <div>
                <div className="mt-dato-label">Terminada el</div>
                <div className="mt-dato-valor">{ot.fechaCierre ? formatearFechaSola(ot.fechaCierre) : '—'}</div>
              </div>
              <div>
                <div className="mt-dato-label">Horas</div>
                <div className="mt-dato-valor">{ot.horas ?? '—'}</div>
              </div>
              {ot.repuestosUsados && <div style={{ gridColumn: '1 / -1' }}><div className="mt-dato-label">Otros repuestos (texto)</div><div className="mt-dato-valor">{ot.repuestosUsados}</div></div>}
              {ot.observaciones && <div style={{ gridColumn: '1 / -1' }}><div className="mt-dato-label">Observaciones</div><div className="mt-dato-valor">{ot.observaciones}</div></div>}
            </div>
          )}
          {ot.estado === 'terminada' && (ot.tecnicos.length > 0 || ot.liberacion) && (
            <div className="mt-hist-detalle" style={{ margin: '0 0 14px', borderLeft: 'none', paddingLeft: 0 }}>
              <DetalleCierre tecnicos={ot.tecnicos} liberacion={ot.liberacion} />
            </div>
          )}
          {ot.estado !== 'terminada' && ot.observaciones && (
            <p style={{ fontSize: 12, color: 'var(--text-mid)', margin: '0 0 12px' }}><Icono n="nota" /> {ot.observaciones}</p>
          )}

          {modo === 'ver' && abierta && (
            <div className="mt-acciones">
              {ot.estado === 'pendiente' && <Button variant="primary" onClick={() => void cambiarEstado.mutateAsync({ id: ot.id, estado: 'en_curso' }).then(() => toast('OT en curso', 'success'))}><Icono n="cohete" /> Empezar</Button>}
              <Button variant="success" onClick={abrirTerminar}><Icono n="exito" /> Terminar</Button>
              <Button variant="ghost" onClick={() => { setNuevaFecha(ot.fechaProgramada); setModo('mover'); }}><Icono n="fecha" /> Cambiar fecha</Button>
              {esAdmin && ot.tipo === 'correctiva' && <Button variant="dangerGhost" onClick={() => void borrar()}><Icono n="borrar" /> Eliminar</Button>}
            </div>
          )}

          {modo === 'terminar' && (
            <form onSubmit={confirmarCierre} className="mt-bloque">
              <div className="mt-bloque-titulo"><span><Icono n="exito" /> Terminar la OT</span></div>
              <p style={{ fontSize: 13, margin: '0 0 10px', color: pendientes ? '#8a5a00' : 'var(--success)', fontWeight: 700 }}>
                {pendientes === 0 ? `Se hicieron las ${tareas.length === 1 ? 'tarea' : `${tareas.length} tareas`}.` : `Se hicieron ${hechas} de ${tareas.length} tareas. Quedan ${pendientes} sin hacer.`}
                {hechas === 0 && tareas.length > 0 && ' (Tildá arriba las que se hicieron.)'}
              </p>
              {mediciones.some(Boolean) && (
                <div className="mt-valores-cierre">
                  {tareas.map((t, i) => mediciones[i] && (
                    <div key={i} className={fueraDeRango(mediciones[i], valores[i]) ? 'fuera' : valores[i] == null ? 'falta' : ''}>
                      <span>{t}:</span>{' '}
                      <strong>{valores[i] != null ? `${numeroCorto(valores[i]!)} ${mediciones[i]!.unidad}` : 'sin anotar'}</strong>
                      {fueraDeRango(mediciones[i], valores[i]) && <> — fuera de rango ({textoRango(mediciones[i]!)})</>}
                    </div>
                  ))}
                  {sinValor > 0 && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#8a5a00', fontWeight: 700 }}>{sinValor === 1 ? 'Falta anotar 1 valor' : `Faltan anotar ${sinValor} valores`} (podés anotarlos arriba antes de confirmar).</p>}
                </div>
              )}
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor={`${uid}-f`}>Fecha en que se hizo</label>
                  <Input id={`${uid}-f`} type="date" value={cierre.fecha} onChange={e => setCierre(c => ({ ...c, fecha: e.target.value }))} required />
                </div>
                <div className="form-group full">
                  <label>Técnicos</label>
                  <TecnicosEditor tecnicos={tecnicos} onChange={setTecnicos} personas={personas} fecha={cierre.fecha} />
                  {totalHorasHombre(tecnicos) == null && (
                    <div className="mt-rep-campo" style={{ marginTop: 8, maxWidth: 220 }}>
                      <label htmlFor={`${uid}-h`}>O las horas de trabajo en total</label>
                      <Input id={`${uid}-h`} inputMode="decimal" value={cierre.horas} onChange={e => setCierre(c => ({ ...c, horas: e.target.value }))} />
                    </div>
                  )}
                </div>
                {ot.correctivo && (
                  <>
                    <div className="form-group">
                      <label htmlFor={`${uid}-hp`}>Horas de equipo parado</label>
                      <Input id={`${uid}-hp`} inputMode="decimal" value={cierre.parada} onChange={e => setCierre(c => ({ ...c, parada: e.target.value }))} placeholder="Ej.: 3,5" />
                    </div>
                    <div className="form-group full">
                      <label htmlFor={`${uid}-ca`}>Causa de la falla</label>
                      <Textarea id={`${uid}-ca`} rows={2} value={cierre.causa} onChange={e => setCierre(c => ({ ...c, causa: e.target.value }))} placeholder="Por qué pasó. Ej.: falta de lubricación" />
                    </div>
                    <div className="form-group full">
                      <label htmlFor={`${uid}-so`}>Solución</label>
                      <Textarea id={`${uid}-so`} rows={2} value={cierre.solucion} onChange={e => setCierre(c => ({ ...c, solucion: e.target.value }))} placeholder="Qué se hizo para arreglarlo" />
                    </div>
                  </>
                )}
                <div className="form-group full">
                  <label>Repuestos que se usaron</label>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Poné 0 en lo que no se cambió: eso no se descuenta del stock. Podés agregar repuestos que no estaban previstos.</div>
                  <RepuestosEditor lineas={lineas} onChange={setLineas} componentes={componentes} modo="cierre" />
                </div>
                <div className="form-group full">
                  <label htmlFor={`${uid}-o`}>Observaciones</label>
                  <Textarea id={`${uid}-o`} value={cierre.obs} onChange={e => setCierre(c => ({ ...c, obs: e.target.value }))} placeholder="Qué se encontró, por qué quedó algo sin hacer..." />
                </div>
                {liberacion && (
                  <div className="form-group full">
                    <label>Liberación del equipo — verificación de entrega</label>
                    <div className="mt-liberacion">
                      {liberacion.controles.map((c, i) => (
                        <label key={i}>
                          <input type="checkbox" checked={c.ok} onChange={e => setLiberacion(l => l && { ...l, controles: l.controles.map((x, j) => (j === i ? { ...x, ok: e.target.checked } : x)) })} />
                          {c.texto}
                        </label>
                      ))}
                    </div>
                    <div className="mt-rep-campo" style={{ marginTop: 8 }}>
                      <label htmlFor={`${uid}-rec`}>{config.recibeLiberacion || 'Recibió'}</label>
                      <Input id={`${uid}-rec`} value={liberacion.recibio} onChange={e => setLiberacion(l => l && { ...l, recibio: e.target.value })} placeholder="Nombre de quien recibe el equipo" />
                    </div>
                    {liberacion.controles.some(c => !c.ok) && <div style={{ fontSize: 12, color: '#8a5a00', fontWeight: 700, marginTop: 4 }}>Quedan controles sin tildar.</div>}
                  </div>
                )}
                {fuera.length > 0 && (
                  <div className="form-group full">
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontWeight: 700, color: 'var(--danger)' }}>
                      <input type="checkbox" checked={cierre.otValores} onChange={e => setCierre(c => ({ ...c, otValores: e.target.checked }))} style={{ width: 18, height: 18 }} />
                      Crear una OT correctiva para revisar {fuera.length === 1 ? 'el valor fuera de rango' : `los ${fuera.length} valores fuera de rango`}
                    </label>
                  </div>
                )}
                {pendientes > 0 && (
                  <div className="form-group full">
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontWeight: 700 }}>
                      <input type="checkbox" checked={cierre.otNueva} onChange={e => setCierre(c => ({ ...c, otNueva: e.target.checked }))} style={{ width: 18, height: 18 }} />
                      Crear una OT nueva con {pendientes === 1 ? 'la tarea que faltó' : `las ${pendientes} tareas que faltaron`}
                    </label>
                  </div>
                )}
              </div>
              {rutina && <p style={{ fontSize: 12, color: 'var(--text-mid)', margin: '10px 0 0' }}>La próxima de esta rutina se programa sola {frecuenciaEnPalabras(rutina.frecuenciaDias)}, contando desde la fecha en que se hizo.</p>}
              <div className="mt-acciones" style={{ marginTop: 12, marginBottom: 0 }}>
                <Button type="button" variant="ghost" onClick={() => setModo('ver')}>Volver</Button>
                <Button type="submit" variant="success"><Icono n="exito" /> Confirmar</Button>
              </div>
            </form>
          )}

          {modo === 'mover' && (
            <form onSubmit={mover} className="mt-bloque">
              <div className="mt-bloque-titulo"><span><Icono n="fecha" /> Cambiar la fecha</span></div>
              <Input type="date" value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)} required aria-label="Nueva fecha" />
              {rutina && <p style={{ fontSize: 12, color: 'var(--text-mid)', margin: '8px 0 0' }}>También se mueve la rutina: las siguientes se cuentan desde la fecha en que se haga.</p>}
              <div className="mt-acciones" style={{ marginTop: 12, marginBottom: 0 }}>
                <Button type="button" variant="ghost" onClick={() => setModo('ver')}>Volver</Button>
                <Button type="submit" variant="primary"><Icono n="guardar" /> Guardar</Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}

/** "HH:MM" de ahora (para la hora de término del técnico al abrir el cierre). */
function horaActual(): string {
  const ahora = new Date();
  return `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
}

/** Casillero para anotar el valor de una medición. Se guarda al salir del campo o con Enter. */
function CampoValor({ medicion, valor, editable, etiqueta, onCambiar }: { medicion: Medicion; valor: number | null; editable: boolean; etiqueta: string; onCambiar: (v: number | null) => void }) {
  const [texto, setTexto] = useState(valor != null ? String(valor).replace('.', ',') : '');
  const fuera = fueraDeRango(medicion, valor);
  const rango = textoRango(medicion);

  function guardar() {
    const t = texto.trim().replace(',', '.');
    if (!t) { if (valor != null) onCambiar(null); return; }
    const n = Number(t);
    if (!Number.isFinite(n)) { setTexto(valor != null ? String(valor).replace('.', ',') : ''); return; }
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
