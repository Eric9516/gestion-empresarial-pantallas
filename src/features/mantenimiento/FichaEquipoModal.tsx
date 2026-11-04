import { useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { fechaHoyISO, formatearFechaSola } from '../../lib/fechaHoy';
import { generarQRPDF } from '../../lib/generarQrPdf';
import { frecuenciaEnPalabras } from './fechas';
import { avanceTareas, diasDeAviso, estadoAviso, fueraDeRango, numeroCorto, resumenTareas, textoRango } from './preventivo';
import {
  useAgregarManual, useEliminarEquipo, useEliminarIntervencion, useFichaEquipo, usePersonasSugeridas, useQuitarManual, useQuitarRepuestoCritico,
} from './useEquipos';
import { useStockRepuestos } from './useStockRepuestos';
import { usePlanillasQuery } from './usePreventivo';
import ListaRepuestos from './ListaRepuestos';
import DetalleCierre from './DetalleCierre';
import { normalizar } from './buscador';
import EquipoForm from './EquipoForm';
import IntervencionForm from './IntervencionForm';
import RepuestoCriticoForm from './RepuestoCriticoForm';
import RutinaForm from './RutinaForm';
import OrdenDetalleModal from './OrdenDetalleModal';
import OrdenCorrectivaForm from './OrdenCorrectivaForm';
import EstadoOT from './EstadoOT';
import { DuplicarEquipoModal, SolapaSubEquipos } from './SubEquipos';
import type { Equipo, Intervencion, Medicion, RepuestoCritico, RutinaPreventiva, TipoMantenimiento } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Icono } from '@/components/Icono';

type Solapa = 'datos' | 'sub' | 'historial' | 'repuestos' | 'manuales' | 'preventivo';

interface Props {
  equipoId: string | null;
  onClose: () => void;
  /** Abrir la ficha de otro equipo (un sub-equipo o el principal). */
  onAbrir: (equipoId: string) => void;
  esAdmin: boolean;
}

function qrComoImagen(texto: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  return qr.createDataURL(4, 2);
}

function tamanio(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Ficha completa de un equipo: datos y QR, historial, repuestos críticos, manuales y preventivo.
export default function FichaEquipoModal({ equipoId, onClose, onAbrir, esAdmin }: Props) {
  const ficha = useFichaEquipo(equipoId);
  const [solapa, setSolapa] = useState<Solapa>('datos');

  function cerrar() {
    setSolapa('datos');
    onClose();
  }

  return (
    <Modal
      open={!!ficha}
      onClose={cerrar}
      large
      title={ficha ? <><Icono n="herramienta" /> {ficha.equipo.nombre} <span className="mt-card-codigo" style={{ marginLeft: 6 }}>{ficha.equipo.codigo}</span></> : ''}
    >
      {ficha && <Contenido ficha={ficha} solapa={solapa} setSolapa={setSolapa} esAdmin={esAdmin} onEliminado={cerrar} onAbrir={id => { setSolapa('datos'); onAbrir(id); }} />}
    </Modal>
  );
}

type Ficha = NonNullable<ReturnType<typeof useFichaEquipo>>;

function Contenido({ ficha, solapa, setSolapa, esAdmin, onEliminado, onAbrir }: { ficha: Ficha; solapa: Solapa; setSolapa: (s: Solapa) => void; esAdmin: boolean; onEliminado: () => void; onAbrir: (id: string) => void }) {
  const { equipo, intervenciones, repuestos, manuales, rutinas, ordenes, padre, subEquipos, intervencionesSub } = ficha;
  const abiertas = ordenes.filter(o => o.estado !== 'terminada');
  const esPrincipal = !equipo.padreId;
  const solapas: { id: Solapa; icono: Parameters<typeof Icono>[0]['n']; label: string; num?: number }[] = [
    { id: 'datos', icono: 'documento', label: 'Datos' },
    ...(esPrincipal ? [{ id: 'sub' as const, icono: 'herramienta' as const, label: 'Sub-equipos', num: subEquipos.length }] : []),
    { id: 'historial', icono: 'historial', label: 'Historial', num: intervenciones.length + intervencionesSub.length },
    { id: 'repuestos', icono: 'paquete', label: 'Repuestos críticos', num: repuestos.length },
    { id: 'manuales', icono: 'carpeta', label: 'Manuales', num: manuales.length },
    { id: 'preventivo', icono: 'calendario', label: 'Preventivo', num: abiertas.length },
  ];

  return (
    <div>
      {padre && (
        <button type="button" className="mt-padre" onClick={() => onAbrir(padre.id)}>
          <Icono n="volver" /> Parte de <strong>{padre.codigo}</strong> — {padre.nombre}
        </button>
      )}
      <div className="mt-solapas" role="tablist">
        {solapas.map(s => (
          <button key={s.id} type="button" role="tab" aria-selected={solapa === s.id} className={`mt-solapa${solapa === s.id ? ' activa' : ''}`} onClick={() => setSolapa(s.id)}>
            <Icono n={s.icono} /> {s.label}{s.num ? ` (${s.num})` : ''}
          </button>
        ))}
      </div>
      {solapa === 'datos' && <SolapaDatos ficha={ficha} esAdmin={esAdmin} onEliminado={onEliminado} onAbrir={onAbrir} />}
      {solapa === 'sub' && <SolapaSubEquipos padre={equipo} subEquipos={subEquipos} esAdmin={esAdmin} onAbrir={onAbrir} />}
      {solapa === 'historial' && <SolapaHistorial equipoId={equipo.id} intervenciones={intervenciones} intervencionesSub={intervencionesSub} subEquipos={subEquipos} esAdmin={esAdmin} />}
      {solapa === 'repuestos' && <SolapaRepuestos equipoId={equipo.id} repuestos={repuestos} esAdmin={esAdmin} />}
      {solapa === 'manuales' && <SolapaManuales equipoId={equipo.id} manuales={manuales} esAdmin={esAdmin} />}
      {solapa === 'preventivo' && <SolapaPreventivo equipoId={equipo.id} rutinas={rutinas} ordenes={ordenes} esAdmin={esAdmin} />}
    </div>
  );
}

function Dato({ label, valor, ancho }: { label: string; valor: string; ancho?: boolean }) {
  return (
    <div style={ancho ? { gridColumn: '1 / -1' } : undefined}>
      <div className="mt-dato-label">{label}</div>
      <div className="mt-dato-valor">{valor || '—'}</div>
    </div>
  );
}

function SolapaDatos({ ficha, esAdmin, onEliminado, onAbrir }: { ficha: Ficha; esAdmin: boolean; onEliminado: () => void; onAbrir: (id: string) => void }) {
  const { equipo: e, intervenciones } = ficha;
  const toast = useToast();
  const confirmar = useConfirm();
  const eliminar = useEliminarEquipo();
  const [editando, setEditando] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const cantSub = ficha.subEquipos.length;
  const qr = useMemo(() => qrComoImagen(e.codigo), [e.codigo]);
  const correctivos = intervenciones.filter(i => i.tipo === 'correctivo').length;
  const horas = intervenciones.reduce((acc, i) => acc + (i.horas ?? 0), 0);

  async function borrar() {
    const subs = cantSub ? ` y sus ${cantSub} sub-equipos` : '';
    if (!(await confirmar(`¿Eliminar el equipo ${e.codigo}${subs}, con todo su historial, repuestos, manuales y rutinas?`, { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    await eliminar.mutateAsync(e.id);
    toast('Equipo eliminado', 'success');
    onEliminado();
  }

  return (
    <div>
      <div className="mt-tags" style={{ marginBottom: 12 }}>
        {e.sector && <span className="mt-tag sector">{e.sector}{e.subsector && ` · ${e.subsector}`}</span>}
        {e.critico && <span className="mt-tag critico">Crítico</span>}
        {e.etiquetas.map(t => <span key={t} className="mt-tag">{t}</span>)}
      </div>
      <div className="mt-datos">
        <Dato label="Marca" valor={e.marca} />
        <Dato label="Modelo" valor={e.modelo} />
        <Dato label="N.º de serie" valor={e.numeroSerie} />
        <Dato label="Ubicación" valor={e.ubicacion} />
        <Dato label="Correctivos registrados" valor={String(correctivos)} />
        <Dato label="Horas de mantenimiento" valor={horas ? String(horas) : '0'} />
        <Dato label="Notas" valor={e.notas} ancho />
      </div>
      <div className="mt-qr">
        <img src={qr} alt={`Código QR del equipo ${e.codigo}`} />
        <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>
          Pegá esta etiqueta en el equipo: al escanearla se abre esta ficha.
          <div style={{ marginTop: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => void generarQRPDF([{ codigo: e.codigo, descripcion: e.nombre }], `QR-${e.codigo}.pdf`, 'qr_codigo_nombre')}>
              <Icono n="imprimir" /> Etiqueta QR
            </Button>
          </div>
        </div>
      </div>
      {esAdmin && (
        <div className="modal-footer" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <Button variant="dangerGhost" onClick={() => void borrar()} style={{ marginRight: 'auto' }}><Icono n="borrar" /> Eliminar equipo</Button>
          {!e.padreId && <Button variant="ghost" onClick={() => setDuplicando(true)} title="Crear otro equipo igual, con sus sub-equipos"><Icono n="repetir" /> Duplicar</Button>}
          <Button variant="primary" onClick={() => setEditando(true)}><Icono n="editar" /> Editar datos</Button>
        </div>
      )}
      <EquipoForm open={editando} onClose={() => setEditando(false)} equipo={e} />
      <DuplicarEquipoModal equipo={duplicando ? e : null} onClose={() => setDuplicando(false)} onCreado={onAbrir} />
    </div>
  );
}

function SolapaHistorial({ equipoId, intervenciones: propias, intervencionesSub, subEquipos, esAdmin }: { equipoId: string; intervenciones: Intervencion[]; intervencionesSub: Intervencion[]; subEquipos: Equipo[]; esAdmin: boolean }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const quitar = useEliminarIntervencion();
  const personas = usePersonasSugeridas();
  const [tipo, setTipo] = useState<TipoMantenimiento | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<Intervencion | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [texto, setTexto] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [componente, setComponente] = useState('');
  // En un equipo principal, el historial junta lo suyo y lo de sus sub-equipos (se puede ver solo lo propio).
  const [conSub, setConSub] = useState(true);
  const sub = useMemo(() => new Map(subEquipos.map(e => [e.id, e])), [subEquipos]);
  const intervenciones = useMemo(
    () => (conSub && intervencionesSub.length ? [...propias, ...intervencionesSub] : [...propias]).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [conSub, propias, intervencionesSub],
  );
  const componentes = useMemo(
    () => [...new Set(intervenciones.flatMap(i => i.repuestos.map(r => r.componente.trim())).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [intervenciones],
  );
  const lista = useMemo(() => {
    const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
    return intervenciones.filter(i => {
      if (tipo && i.tipo !== tipo) return false;
      if (desde && i.fecha < desde) return false;
      if (hasta && i.fecha > hasta) return false;
      if (componente && !i.repuestos.some(r => r.componente.trim() === componente)) return false;
      if (palabras.length) {
        const todo = normalizar([
          i.descripcion, i.realizadoPor, i.repuestosUsados, i.otNumero ?? '', sub.get(i.equipoId)?.nombre ?? '',
          i.correctivo?.falla ?? '', i.correctivo?.causa ?? '', i.correctivo?.solucion ?? '',
          ...i.repuestos.flatMap(r => [r.componente, r.codigo, r.descripcion]), ...i.tareas.map(t => t.texto),
        ].join(' '));
        if (!palabras.every(p => todo.includes(p))) return false;
      }
      return true;
    });
  }, [intervenciones, tipo, desde, hasta, componente, texto, sub]);
  const filtrando = !!(texto || desde || hasta || componente);
  const horas = lista.reduce((t, i) => t + (i.horas ?? 0), 0);
  const parada = lista.reduce((t, i) => t + (i.correctivo?.horasParada ?? 0), 0);
  const repuestos = lista.reduce((t, i) => t + i.repuestos.reduce((u, r) => u + r.cantidad, 0), 0);

  function alternar(id: string) {
    setAbiertos(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  async function borrar(i: Intervencion) {
    if (!(await confirmar('¿Borrar este registro del historial? (El stock que se descontó no vuelve solo.)', { textoConfirmar: 'Borrar', peligroso: true }))) return;
    await quitar.mutateAsync(i.id);
    toast('Registro borrado', 'success');
  }

  return (
    <div>
      <div className="mt-acciones">
        <Button variant="primary" size="sm" onClick={() => setFormOpen(true)}><Icono n="mas" /> Registrar mantenimiento</Button>
      </div>
      <div className="mt-chips">
        <button type="button" className={`mt-chip${!tipo ? ' activo' : ''}`} onClick={() => setTipo(null)}>Todos ({intervenciones.length})</button>
        <button type="button" className={`mt-chip${tipo === 'correctivo' ? ' activo' : ''}`} onClick={() => setTipo('correctivo')}>Correctivos ({intervenciones.filter(i => i.tipo === 'correctivo').length})</button>
        <button type="button" className={`mt-chip${tipo === 'preventivo' ? ' activo' : ''}`} onClick={() => setTipo('preventivo')}>Preventivos ({intervenciones.filter(i => i.tipo === 'preventivo').length})</button>
        {intervencionesSub.length > 0 && (
          <button type="button" className={`mt-chip${conSub ? ' activo' : ''}`} aria-pressed={conSub} onClick={() => setConSub(v => !v)}>
            Incluir sub-equipos ({intervencionesSub.length})
          </button>
        )}
      </div>
      <div className="mt-filtros">
        <Input type="text" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar en el historial (falla, repuesto, técnico...)" aria-label="Buscar en el historial" style={{ flexBasis: '100%' }} />
        <label className="mt-rep-campo"><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>DESDE</span><Input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></label>
        <label className="mt-rep-campo"><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>HASTA</span><Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></label>
        {componentes.length > 0 && (
          <label className="mt-rep-campo"><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>COMPONENTE</span>
            <Select value={componente} onChange={e => setComponente(e.target.value)}>
              <option value="">Todos</option>
              {componentes.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </label>
        )}
      </div>
      <MedicionesEquipo intervenciones={intervenciones} sub={sub} />
      {lista.length > 0 && (
        <div className="mt-resumen" style={{ marginBottom: 6 }}>
          {[`${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}`, horas > 0 && `${horas} h de trabajo`, parada > 0 && `${parada} h de equipo parado`, repuestos > 0 && `${repuestos} repuestos usados`].filter(Boolean).join(' · ')}
          {filtrando && <> · <button type="button" className="mt-link" onClick={() => { setTexto(''); setDesde(''); setHasta(''); setComponente(''); }}>Sacar filtros</button></>}
        </div>
      )}
      {!lista.length && <div className="mt-vacio">{filtrando ? 'Nada coincide con los filtros.' : 'Sin registros todavía.'}</div>}
      {lista.map(i => {
        const abierto = abiertos.has(i.id);
        const c = i.correctivo;
        const hechas = i.tareas.filter(t => t.hecha).length;
        const titulo = c?.falla || i.descripcion;
        return (
          <div key={i.id} className="mt-hist">
            <button type="button" className="mt-hist-cabeza" aria-expanded={abierto} onClick={() => alternar(i.id)}>
              <div className="mt-fila-cuerpo">
                <div className="mt-tags" style={{ marginBottom: 4, alignItems: 'center' }}>
                  <span className={`mt-tag ${i.tipo === 'preventivo' ? 'prev' : 'corr'}`}>{i.tipo === 'preventivo' ? 'Preventivo' : 'Correctivo'}</span>
                  {c?.prioridad === 'urgente' && <span className="mt-tag urgente">Urgente</span>}
                  {i.otNumero && <span className="mt-tag">{i.otNumero}</span>}
                  {sub.get(i.equipoId) && <span className="mt-tag sector">{sub.get(i.equipoId)!.codigo} · {sub.get(i.equipoId)!.nombre}</span>}
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-mid)' }}>{formatearFechaSola(i.fecha)}</span>
                </div>
                <div className="mt-fila-titulo" style={{ fontWeight: 600 }}>{titulo}</div>
                <div className="mt-fila-sub">
                  {[
                    i.realizadoPor && `Por ${i.realizadoPor}`, i.horas != null && `${i.horas} h`,
                    c?.horasParada != null && `${c.horasParada} h parado`,
                    i.tareas.length > 1 && `${hechas} de ${i.tareas.length} tareas`,
                    i.repuestos.length > 0 && `${i.repuestos.length} ${i.repuestos.length === 1 ? 'repuesto' : 'repuestos'}`,
                  ].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{ color: 'var(--text-muted)', display: 'inline-flex', transform: abierto ? 'rotate(180deg)' : undefined }}><Icono n="abajo" /></span>
            </button>
            {abierto && (
              <div className="mt-hist-detalle">
                {titulo !== i.descripcion && <div><h4>Qué se hizo</h4>{i.descripcion}</div>}
                {c && (
                  <>
                    <div><h4>Causa</h4>{c.causa || '—'}</div>
                    <div><h4>Solución</h4>{c.solucion || '—'}</div>
                  </>
                )}
                {i.tareas.length > 0 && (
                  <div>
                    <h4>Tareas</h4>
                    <ul className="mt-hist-tareas">
                      {i.tareas.map((t, k) => (
                        <li key={k} className={t.hecha ? (fueraDeRango(t.medicion, t.valor) ? 'no' : '') : 'no'}>
                          <Icono n={t.hecha ? 'ok' : 'cerrar'} /> {t.texto}{!t.hecha && ' (no se hizo)'}
                          {t.medicion && t.valor != null && <strong>: {numeroCorto(t.valor)} {t.medicion.unidad}{fueraDeRango(t.medicion, t.valor) && ` (fuera de rango: ${textoRango(t.medicion)})`}</strong>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <DetalleCierre tecnicos={i.tecnicos ?? []} liberacion={i.liberacion ?? null} />
                {(i.repuestos.length > 0 || i.repuestosUsados) && (
                  <div>
                    <h4>Repuestos usados</h4>
                    <ListaRepuestos lineas={i.repuestos} modo="usado" />
                    {i.repuestosUsados && <div style={{ marginTop: 4 }}>{i.repuestosUsados}</div>}
                  </div>
                )}
                <div className="mt-acciones" style={{ marginBottom: 0 }}>
                  <Button variant="ghost" size="sm" onClick={() => setEditando(i)}><Icono n="editar" /> Editar</Button>
                  {esAdmin && <Button variant="dangerGhost" size="sm" onClick={() => void borrar(i)}><Icono n="borrar" /> Borrar</Button>}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <IntervencionForm open={formOpen || !!editando} onClose={() => { setFormOpen(false); setEditando(null); }} equipoId={equipoId} intervencion={editando} personas={personas} />
    </div>
  );
}

interface SerieMedicion { clave: string; texto: string; equipo: string | null; medicion: Medicion; puntos: { fecha: string; valor: number; ot: string | null }[] }

/** Las mediciones anotadas en el historial, agrupadas por tarea: los últimos valores y cómo vienen cambiando. */
function MedicionesEquipo({ intervenciones, sub }: { intervenciones: Intervencion[]; sub: Map<string, Equipo> }) {
  const [abierto, setAbierto] = useState(false);
  const series = useMemo(() => {
    const m = new Map<string, SerieMedicion>();
    for (const i of [...intervenciones].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      for (const t of i.tareas) {
        if (!t.medicion || t.valor == null) continue;
        const clave = `${i.equipoId}|${normalizar(t.texto)}`;
        const serie = m.get(clave) ?? { clave, texto: t.texto, equipo: sub.get(i.equipoId)?.codigo ?? null, medicion: t.medicion, puntos: [] };
        serie.medicion = t.medicion; // el rango más reciente
        serie.puntos.push({ fecha: i.fecha, valor: t.valor, ot: i.otNumero });
        m.set(clave, serie);
      }
    }
    return [...m.values()];
  }, [intervenciones, sub]);
  if (!series.length) return null;
  const conAlerta = series.filter(x => fueraDeRango(x.medicion, x.puntos.at(-1)!.valor)).length;

  return (
    <div className="mt-bloque" style={{ padding: '10px 12px' }}>
      <button type="button" className="mt-hist-cabeza" aria-expanded={abierto} onClick={() => setAbierto(v => !v)}>
        <span className="mt-bloque-titulo" style={{ flex: 1, margin: 0 }}>
          <span><Icono n="balanza" /> Mediciones ({series.length})</span>
          {conAlerta > 0 && <span className="mt-tag falta"><Icono n="alerta" /> {conAlerta} fuera de rango en la última</span>}
        </span>
        <span style={{ color: 'var(--text-muted)', display: 'inline-flex', transform: abierto ? 'rotate(180deg)' : undefined }}><Icono n="abajo" /></span>
      </button>
      {abierto && series.map(x => {
        const ultimo = x.puntos.at(-1)!;
        return (
          <div key={x.clave} className="mt-medicion">
            <div className="mt-medicion-cab">
              <span style={{ fontWeight: 700, fontSize: 14 }}>{x.equipo && <span className="mt-tag sector" style={{ marginRight: 6 }}>{x.equipo}</span>}{x.texto}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{textoRango(x.medicion)}</span>
            </div>
            <div style={{ fontSize: 13, marginTop: 2 }}>
              Último: <strong style={{ color: fueraDeRango(x.medicion, ultimo.valor) ? 'var(--danger)' : undefined }}>{numeroCorto(ultimo.valor)} {x.medicion.unidad}</strong> el {formatearFechaSola(ultimo.fecha)}
            </div>
            {x.puntos.length > 1 && <Sparkline puntos={x.puntos.map(p => p.valor)} medicion={x.medicion} />}
            <div className="mt-medicion-valores">
              {x.puntos.slice(-8).reverse().map((p, k) => (
                <span key={k} className={fueraDeRango(x.medicion, p.valor) ? 'fuera' : ''} title={p.ot ?? undefined}>{formatearFechaSola(p.fecha)}: {numeroCorto(p.valor)}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Línea chica con la evolución de una medición; la franja verde es el rango normal. */
function Sparkline({ puntos, medicion }: { puntos: number[]; medicion: Medicion }) {
  const W = 260;
  const H = 46;
  const P = 5;
  const todos = [...puntos, ...(medicion.minimo != null ? [medicion.minimo] : []), ...(medicion.maximo != null ? [medicion.maximo] : [])];
  let lo = Math.min(...todos);
  let hi = Math.max(...todos);
  if (hi === lo) { hi += 1; lo -= 1; }
  const y = (v: number) => H - P - ((v - lo) / (hi - lo)) * (H - P * 2);
  const x = (i: number) => P + (i / Math.max(1, puntos.length - 1)) * (W - P * 2);
  const yMin = medicion.minimo != null ? y(medicion.minimo) : H - P;
  const yMax = medicion.maximo != null ? y(medicion.maximo) : P;
  return (
    <svg className="mt-sparkline" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolución de la medición">
      {(medicion.minimo != null || medicion.maximo != null) && <rect x={0} y={yMax} width={W} height={Math.max(0, yMin - yMax)} fill="var(--success-bg)" />}
      <polyline points={puntos.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--blue)" strokeWidth={2} />
      {puntos.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={fueraDeRango(medicion, v) ? 'var(--danger)' : 'var(--blue)'} />)}
    </svg>
  );
}

function SolapaRepuestos({ equipoId, repuestos, esAdmin }: { equipoId: string; repuestos: RepuestoCritico[]; esAdmin: boolean }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const quitar = useQuitarRepuestoCritico();
  const { stockDe, cargando } = useStockRepuestos();
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<RepuestoCritico | null>(null);

  async function borrar(r: RepuestoCritico) {
    if (!(await confirmar(`¿Quitar ${r.codigo} de los repuestos críticos de este equipo? (No se borra del Depósito.)`, { textoConfirmar: 'Quitar', peligroso: true }))) return;
    await quitar.mutateAsync(r.id);
    toast('Repuesto quitado', 'success');
  }

  return (
    <div>
      {esAdmin && (
        <div className="mt-acciones">
          <Button variant="primary" size="sm" onClick={() => setFormOpen(true)}><Icono n="mas" /> Agregar repuesto crítico</Button>
        </div>
      )}
      {!repuestos.length && <div className="mt-vacio">Este equipo no tiene repuestos críticos cargados.</div>}
      {repuestos.map(r => {
        const s = stockDe(r);
        return (
          <div key={r.id} className="mt-fila">
            <div className="mt-fila-cuerpo">
              <div className="mt-fila-titulo">{r.codigo} — {r.descripcion || 'Sin descripción'}</div>
              <div className="mt-fila-sub">
                Tener: {r.cantidad}
                {cargando ? ' · consultando stock...' : s.enDeposito ? <> · En Depósito: <strong>{s.stock}</strong>{s.ubicacion && <> · Ubic. {s.ubicacion}</>}</> : ' · No está cargado en el Depósito'}
                {r.nota && <> · {r.nota}</>}
              </div>
              {s.falta && <div className="mt-tags" style={{ marginTop: 4 }}><span className="mt-tag critico"><Icono n="alerta" /> Falta stock</span></div>}
            </div>
            {esAdmin && (
              <div className="mt-fila-acciones">
                <Button variant="ghost" size="icon" title="Editar" onClick={() => setEditando(r)}><Icono n="editar" /></Button>
                <Button variant="dangerGhost" size="icon" title="Quitar" onClick={() => void borrar(r)}><Icono n="borrar" /></Button>
              </div>
            )}
          </div>
        );
      })}
      <RepuestoCriticoForm open={formOpen || !!editando} onClose={() => { setFormOpen(false); setEditando(null); }} equipoId={equipoId} repuesto={editando} />
    </div>
  );
}

function SolapaManuales({ equipoId, manuales, esAdmin }: { equipoId: string; manuales: Ficha['manuales']; esAdmin: boolean }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const agregar = useAgregarManual();
  const quitar = useQuitarManual();
  const inputRef = useRef<HTMLInputElement>(null);

  async function subir(ev: React.ChangeEvent<HTMLInputElement>) {
    const archivos = [...(ev.target.files ?? [])];
    for (const archivo of archivos) await agregar.mutateAsync({ equipoId, archivo, hoy: fechaHoyISO() });
    if (archivos.length) toast(archivos.length === 1 ? 'Manual agregado' : `${archivos.length} manuales agregados`, 'success');
    ev.target.value = '';
  }

  async function borrar(id: string, nombre: string) {
    if (!(await confirmar(`¿Quitar el manual "${nombre}"?`, { textoConfirmar: 'Quitar', peligroso: true }))) return;
    await quitar.mutateAsync(id);
  }

  return (
    <div>
      {esAdmin && (
        <div className="mt-acciones">
          <Button variant="primary" size="sm" onClick={() => inputRef.current?.click()}><Icono n="importar" /> Subir manual (PDF)</Button>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={e => void subir(e)} />
        </div>
      )}
      {!manuales.length && <div className="mt-vacio">No hay manuales cargados para este equipo.</div>}
      {manuales.map(m => (
        <div key={m.id} className="mt-fila">
          <div style={{ fontSize: 22, color: 'var(--danger)' }}><Icono n="documento" /></div>
          <div className="mt-fila-cuerpo">
            <div className="mt-fila-titulo" style={{ wordBreak: 'break-word' }}>{m.nombre}</div>
            <div className="mt-fila-sub">
              {[tamanio(m.tamanioBytes), `subido el ${formatearFechaSola(m.subidoEl)}`].filter(Boolean).join(' · ')}
              {!m.url && ' · (modo de ejemplo: el archivo no se guarda al recargar la página)'}
            </div>
          </div>
          <div className="mt-fila-acciones">
            {m.url && <Button variant="primary" size="sm" onClick={() => window.open(m.url!, '_blank', 'noopener')}><Icono n="ver" /> Abrir</Button>}
            {esAdmin && <Button variant="dangerGhost" size="icon" title="Quitar" onClick={() => void borrar(m.id, m.nombre)}><Icono n="borrar" /></Button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function SolapaPreventivo({ equipoId, rutinas, ordenes, esAdmin }: { equipoId: string; rutinas: RutinaPreventiva[]; ordenes: Ficha['ordenes']; esAdmin: boolean }) {
  const { data: planillas } = usePlanillasQuery();
  const personas = usePersonasSugeridas();
  const hoy = fechaHoyISO();
  const [rutinaForm, setRutinaForm] = useState<RutinaPreventiva | 'nueva' | null>(null);
  const [otAbierta, setOtAbierta] = useState<string | null>(null);
  const [correctivaOpen, setCorrectivaOpen] = useState(false);
  const abiertas = ordenes.filter(o => o.estado !== 'terminada').sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada));

  return (
    <div>
      <div className="mt-acciones">
        {esAdmin && <Button variant="primary" size="sm" onClick={() => setRutinaForm('nueva')}><Icono n="mas" /> Nueva rutina</Button>}
        <Button variant="ghost" size="sm" onClick={() => setCorrectivaOpen(true)}><Icono n="herramienta" /> Nueva OT correctiva</Button>
      </div>

      <div className="mt-bloque-titulo" style={{ marginTop: 4 }}>Órdenes de trabajo abiertas</div>
      {!abiertas.length && <div className="mt-vacio">No hay órdenes abiertas.</div>}
      {abiertas.map(o => (
        <div key={o.id} className="mt-fila" style={{ cursor: 'pointer' }} onClick={() => setOtAbierta(o.id)}>
          <div className="mt-fila-cuerpo">
            <div className="mt-tags" style={{ marginBottom: 4 }}>
              <strong style={{ fontSize: 13 }}>{o.numero}</strong>
              <EstadoOT ot={o} estado={estadoAviso(o, hoy, diasDeAviso(o, rutinas))} conFecha />
            </div>
            <div className="mt-fila-sub">{resumenTareas(o.tareas)}{avanceTareas(o) && ` · ${avanceTareas(o)}`}{o.asignadoA && ` · ${o.asignadoA}`}</div>
          </div>
          <Button variant="primary" size="sm" onClick={ev => { ev.stopPropagation(); setOtAbierta(o.id); }}>Ver</Button>
        </div>
      ))}

      <div className="mt-bloque-titulo" style={{ marginTop: 16 }}>Rutinas preventivas</div>
      {!rutinas.length && <div className="mt-vacio">Este equipo no tiene rutinas. Con una rutina, las órdenes preventivas se generan solas.</div>}
      {rutinas.map(r => (
        <div key={r.id} className="mt-fila">
          <div className="mt-fila-cuerpo">
            <div className="mt-fila-titulo">{resumenTareas(r.tarea)}</div>
            <div className="mt-fila-sub">
              {r.activa ? <>{frecuenciaEnPalabras(r.frecuenciaDias)} · próxima {formatearFechaSola(r.proximaFecha)} · aviso {r.avisoDiasAntes} días antes</> : 'Desactivada'}
              {r.responsable && ` · ${r.responsable}`}
              {r.repuestos.length > 0 && ` · ${r.repuestos.length} ${r.repuestos.length === 1 ? 'repuesto' : 'repuestos'}`}
              {r.planillaId && planillas.find(p => p.id === r.planillaId) && ` · planilla "${planillas.find(p => p.id === r.planillaId)!.nombre}"`}
            </div>
          </div>
          {esAdmin && <Button variant="ghost" size="icon" title="Editar rutina" onClick={() => setRutinaForm(r)}><Icono n="editar" /></Button>}
        </div>
      ))}

      <RutinaForm open={!!rutinaForm} onClose={() => setRutinaForm(null)} rutina={rutinaForm === 'nueva' ? null : rutinaForm} equipoId={equipoId} personas={personas} />
      <OrdenCorrectivaForm open={correctivaOpen} onClose={() => setCorrectivaOpen(false)} equipoId={equipoId} personas={personas} />
      <OrdenDetalleModal ordenId={otAbierta} onClose={() => setOtAbierta(null)} esAdmin={esAdmin} personas={personas} />
    </div>
  );
}
