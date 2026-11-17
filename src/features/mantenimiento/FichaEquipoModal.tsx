import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { fechaHoyISO, formatearFechaSola } from '../../lib/fechaHoy';
import { generarQRPDF } from '../../lib/generarQrPdf';
import { mensajeDeError } from '../../lib/errores';
import { usePedido } from '../../lib/usePedido';
import { normalizar } from './buscador';
import { useMantenimiento } from './servicio';
import EquipoForm from './EquipoForm';
import IntervencionForm from './IntervencionForm';
import RepuestoCriticoForm from './RepuestoCriticoForm';
import { DuplicarEquipoModal, SolapaSubEquipos } from './SubEquipos';
import { DetalleTecnicos } from './TecnicosEditor';
import EstadoOT from './EstadoOT';
import OrdenDetalleModal from './OrdenDetalleModal';
import OrdenCorrectivaForm from './OrdenCorrectivaForm';
import CargarCorrectivaForm from './CargarCorrectivaForm';
import RutinaForm from './RutinaForm';
import MedicionesEquipo from './MedicionesEquipo';
import CostosEquipo from './CostosEquipo';
import { frecuenciaEnPalabras } from './fechas';
import { avanceTareas, estadoAviso, numeroOT, resumenTareas } from './preventivo';
import type { Equipo, FichaDeEquipo, Intervencion, RepuestoCritico, Rutina, TipoMantenimiento } from './tipos';
import { Button } from '@/components/ui/button';
import { botonVariantes } from '@/components/ui/botonVariantes';
import { Input } from '@/components/ui/input';
import { Icono, type NombreIcono } from '@/components/Icono';

// Ficha completa de un equipo (del diseño del socio): datos y QR, sub-equipos, historial, repuestos críticos y manuales.
// "Preventivo": sus rutinas y sus órdenes de trabajo abiertas. Se abre como pantalla (FichaEquipoPantalla, en lugar de la lista, con
// "Volver"; del socio, 05/11/2026); la ventana (FichaEquipoModal) queda para quien la necesite.

type Solapa = 'datos' | 'sub' | 'historial' | 'repuestos' | 'manuales' | 'preventivo';

interface Props {
  equipoId: string | null;
  onClose: () => void;
  /** Abrir la ficha de otro equipo (un sub-equipo o el principal). */
  onAbrir: (equipoId: string) => void;
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

export default function FichaEquipoModal({ equipoId, onClose, onAbrir }: Props) {
  const s = useMantenimiento();
  // la ficha se pide al abrirla, y de nuevo después de cada cambio guardado
  const pedido = usePedido(equipoId ? `ficha|${equipoId}|${s.revision}` : null, () => s.ficha(equipoId!), true);
  const ficha = equipoId && pedido.data?.equipo.id === equipoId ? pedido.data : null;
  const [solapa, setSolapa] = useState<Solapa>('datos');

  function cerrar() {
    setSolapa('datos');
    onClose();
  }

  return (
    <Modal
      open={!!equipoId}
      onClose={cerrar}
      large
      title={ficha ? <><Icono n="fabrica" /> {ficha.equipo.nombre} <span className="mt-card-codigo" style={{ marginLeft: 6 }}>{ficha.equipo.codigo}</span></> : <><Icono n="fabrica" /> Equipo</>}
    >
      {ficha
        ? <Contenido ficha={ficha} solapa={solapa} setSolapa={setSolapa} onEliminado={cerrar} onAbrir={id => { setSolapa('datos'); onAbrir(id); }} />
        : <div className="mt-vacio">{pedido.error ? 'No se pudo abrir el equipo. Probá de nuevo.' : pedido.data === null && !pedido.cargando ? 'Este equipo ya no existe.' : 'Cargando...'}</div>}
    </Modal>
  );
}

/** La ficha como pantalla (en lugar de la lista de equipos), con "Volver" arriba. Cada equipo se abre desde arriba y en la solapa Datos. */
export function FichaEquipoPantalla({ equipoId, onVolver, textoVolver, onAbrir }: { equipoId: string; onVolver: () => void; textoVolver: string; onAbrir: (id: string) => void }) {
  const s = useMantenimiento();
  const pedido = usePedido(`ficha|${equipoId}|${s.revision}`, () => s.ficha(equipoId), true);
  const ficha = pedido.data?.equipo.id === equipoId ? pedido.data : null;
  const [solapa, setSolapa] = useState<Solapa>('datos');
  useEffect(() => { window.scrollTo({ top: 0 }); }, [equipoId]);
  return (
    <div className="mt-pantalla-equipo">
      <button type="button" className="mt-volver" onClick={onVolver}><Icono n="volver" /> {textoVolver}</button>
      <div className="section-header">
        <h1 className="section-title"><Icono n="fabrica" /> {ficha ? <>{ficha.equipo.nombre} <span className="mt-card-codigo">{ficha.equipo.codigo}</span></> : 'Equipo'}</h1>
      </div>
      {ficha
        ? <Contenido ficha={ficha} solapa={solapa} setSolapa={setSolapa} onEliminado={onVolver} onAbrir={id => { setSolapa('datos'); onAbrir(id); }} />
        : <div className="mt-vacio">{pedido.error ? 'No se pudo abrir el equipo. Probá de nuevo.' : pedido.data === null && !pedido.cargando ? 'Este equipo ya no existe.' : 'Cargando...'}</div>}
    </div>
  );
}

function Contenido({ ficha, solapa, setSolapa, onEliminado, onAbrir }: { ficha: FichaDeEquipo; solapa: Solapa; setSolapa: (s: Solapa) => void; onEliminado: () => void; onAbrir: (id: string) => void }) {
  const { equipo, intervenciones, repuestos, manuales, padre, subEquipos, intervencionesSub } = ficha;
  const esPrincipal = !equipo.padreId;
  const solapas: { id: Solapa; icono: NombreIcono; label: string; num?: number }[] = [
    { id: 'datos', icono: 'documento', label: 'Datos' },
    ...(esPrincipal ? [{ id: 'sub' as const, icono: 'herramienta' as const, label: 'Sub-equipos', num: subEquipos.length }] : []),
    { id: 'historial', icono: 'historial', label: 'Historial', num: intervenciones.length + intervencionesSub.length },
    { id: 'repuestos', icono: 'paquete', label: 'Repuestos críticos', num: repuestos.length },
    { id: 'manuales', icono: 'carpeta', label: 'Manuales', num: manuales.length },
    { id: 'preventivo', icono: 'calendario', label: 'Preventivo', num: ficha.ordenes.length },
  ];

  return (
    <div>
      {padre && (
        <button type="button" className="mt-padre" onClick={() => onAbrir(padre.id)}>
          <Icono n="volver" /> Parte de <strong>{padre.codigo}</strong> — {padre.nombre}
        </button>
      )}
      <div className="mt-solapas" role="tablist">
        {solapas.map(x => (
          <button key={x.id} type="button" role="tab" aria-selected={solapa === x.id} className={`mt-solapa${solapa === x.id ? ' activa' : ''}`} onClick={() => setSolapa(x.id)}>
            <Icono n={x.icono} /> {x.label}{x.num ? ` (${x.num})` : ''}
          </button>
        ))}
      </div>
      {solapa === 'datos' && <SolapaDatos ficha={ficha} onEliminado={onEliminado} onAbrir={onAbrir} />}
      {solapa === 'sub' && <SolapaSubEquipos padre={equipo} subEquipos={subEquipos} onAbrir={onAbrir} />}
      {solapa === 'historial' && <><MedicionesEquipo mediciones={ficha.mediciones} /><SolapaHistorial equipoId={equipo.id} intervenciones={intervenciones} intervencionesSub={intervencionesSub} subEquipos={subEquipos} /></>}
      {solapa === 'repuestos' && <SolapaRepuestos equipoId={equipo.id} repuestos={repuestos} />}
      {solapa === 'manuales' && <SolapaManuales equipoId={equipo.id} manuales={manuales} />}
      {solapa === 'preventivo' && <SolapaPreventivo ficha={ficha} />}
    </div>
  );
}

function Dato({ label, valor, ancho }: { label: string; valor: string; ancho?: boolean }) {
  return (
    <div style={ancho ? { gridColumn: '1 / -1' } : undefined}>
      <div className="mt-dato-label">{label}</div>
      <div className="mt-dato-valor" style={ancho ? { whiteSpace: 'pre-wrap' } : undefined}>{valor || '—'}</div>
    </div>
  );
}

function SolapaDatos({ ficha, onEliminado, onAbrir }: { ficha: FichaDeEquipo; onEliminado: () => void; onAbrir: (id: string) => void }) {
  const { equipo: e, intervenciones } = ficha;
  const s = useMantenimiento();
  const toast = useToast();
  const confirmar = useConfirm();
  const [editando, setEditando] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const cantSub = ficha.subEquipos.length;
  const qr = useMemo(() => qrComoImagen(e.codigo), [e.codigo]);
  const correctivos = intervenciones.filter(i => i.tipo === 'correctivo').length;
  const horas = intervenciones.reduce((acc, i) => acc + (i.horas ?? 0), 0);

  async function borrar() {
    const subs = cantSub ? ` y sus ${cantSub} sub-equipos` : '';
    if (!(await confirmar(`¿Eliminar el equipo ${e.codigo}${subs}, con todo su historial, repuestos críticos y manuales?`, { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    try {
      await s.eliminarEquipo(e.id);
      toast('Equipo eliminado', 'success');
      onEliminado();
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    }
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
          Pegá esta etiqueta en el equipo: al escanearla desde Mantenimiento se abre esta ficha.
          <div style={{ marginTop: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => void generarQRPDF([{ codigo: e.codigo, descripcion: e.nombre }], `QR-${e.codigo}.pdf`, 'qr_codigo_nombre')}>
              <Icono n="imprimir" /> Etiqueta QR
            </Button>
          </div>
        </div>
      </div>
      <CostosEquipo equipo={e} subEquipos={ficha.subEquipos} intervenciones={[...intervenciones, ...ficha.intervencionesSub]} gastos={ficha.gastos} />
      {s.esAdmin && (
        <div className="modal-footer" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <Button variant="dangerGhost" onClick={() => void borrar()} style={{ marginRight: 'auto' }}><Icono n="borrar" /> Eliminar equipo</Button>
          {!e.padreId && <Button variant="ghost" onClick={() => setDuplicando(true)} title="Crear otro equipo igual, con sus sub-equipos"><Icono n="repetir" /> Duplicar</Button>}
          <Button variant="primary" onClick={() => setEditando(true)}><Icono n="editar" /> Editar datos</Button>
        </div>
      )}
      <EquipoForm open={editando} onClose={() => setEditando(false)} equipo={e} tieneSubEquipos={cantSub > 0} />
      <DuplicarEquipoModal equipo={duplicando ? e : null} subEquipos={ficha.subEquipos} cantRepuestos={ficha.repuestos.length} onClose={() => setDuplicando(false)} onCreado={onAbrir} />
    </div>
  );
}

function SolapaHistorial({ equipoId, intervenciones: propias, intervencionesSub, subEquipos }: { equipoId: string; intervenciones: Intervencion[]; intervencionesSub: Intervencion[]; subEquipos: Equipo[] }) {
  const s = useMantenimiento();
  const toast = useToast();
  const confirmar = useConfirm();
  const [tipo, setTipo] = useState<TipoMantenimiento | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<Intervencion | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [texto, setTexto] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  // En un equipo principal, el historial junta lo suyo y lo de sus sub-equipos (se puede ver solo lo propio).
  const [conSub, setConSub] = useState(true);
  const sub = useMemo(() => new Map(subEquipos.map(e => [e.id, e])), [subEquipos]);
  const intervenciones = useMemo(
    () => (conSub && intervencionesSub.length ? [...propias, ...intervencionesSub] : [...propias]).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [conSub, propias, intervencionesSub],
  );
  const lista = useMemo(() => {
    const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
    return intervenciones.filter(i => {
      if (tipo && i.tipo !== tipo) return false;
      if (desde && i.fecha < desde) return false;
      if (hasta && i.fecha > hasta) return false;
      if (palabras.length) {
        const todo = normalizar([
          i.descripcion, ...i.tecnicos.map(t => t.nombre), i.repuestosUsados, sub.get(i.equipoId)?.nombre ?? '',
          i.correctivo?.falla ?? '', i.correctivo?.causa ?? '', i.correctivo?.solucion ?? '',
        ].join(' '));
        if (!palabras.every(p => todo.includes(p))) return false;
      }
      return true;
    });
  }, [intervenciones, tipo, desde, hasta, texto, sub]);
  const filtrando = !!(texto || desde || hasta);
  const horas = lista.reduce((t, i) => t + (i.horas ?? 0), 0);
  const parada = lista.reduce((t, i) => t + (i.horasParada ?? 0), 0);

  function alternar(id: string) {
    setAbiertos(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function borrar(i: Intervencion) {
    if (!(await confirmar('¿Borrar este registro del historial?', { textoConfirmar: 'Borrar', peligroso: true }))) return;
    try {
      await s.eliminarIntervencion(i.id);
      toast('Registro borrado', 'success');
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    }
  }

  return (
    <div>
      {s.trabaja && (
        <div className="mt-acciones">
          <Button variant="primary" size="sm" onClick={() => setFormOpen(true)}><Icono n="mas" /> Registrar mantenimiento</Button>
        </div>
      )}
      <div className="mt-chips">
        <button type="button" className={`mt-chip${!tipo ? ' activo' : ''}`} aria-pressed={!tipo} onClick={() => setTipo(null)}>Todos ({intervenciones.length})</button>
        <button type="button" className={`mt-chip${tipo === 'correctivo' ? ' activo' : ''}`} aria-pressed={tipo === 'correctivo'} onClick={() => setTipo('correctivo')}>Correctivos ({intervenciones.filter(i => i.tipo === 'correctivo').length})</button>
        <button type="button" className={`mt-chip${tipo === 'preventivo' ? ' activo' : ''}`} aria-pressed={tipo === 'preventivo'} onClick={() => setTipo('preventivo')}>Preventivos ({intervenciones.filter(i => i.tipo === 'preventivo').length})</button>
        {intervencionesSub.length > 0 && (
          <button type="button" className={`mt-chip${conSub ? ' activo' : ''}`} aria-pressed={conSub} onClick={() => setConSub(v => !v)}>
            Incluir sub-equipos ({intervencionesSub.length})
          </button>
        )}
      </div>
      {intervenciones.length > 0 && (
        <div className="mt-filtros">
          <Input type="text" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar en el historial (falla, repuesto, técnico...)" aria-label="Buscar en el historial" style={{ flexBasis: '100%' }} />
          <label className="mt-rep-campo"><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>DESDE</span><Input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></label>
          <label className="mt-rep-campo"><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>HASTA</span><Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></label>
        </div>
      )}
      {lista.length > 0 && (
        <div className="mt-resumen" style={{ marginBottom: 6 }}>
          {[`${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}`, horas > 0 && `${horas} h de trabajo`, parada > 0 && `${parada} h de equipo parado`].filter(Boolean).join(' · ')}
          {filtrando && <> · <button type="button" className="mt-link" onClick={() => { setTexto(''); setDesde(''); setHasta(''); }}>Sacar filtros</button></>}
        </div>
      )}
      {!lista.length && <div className="mt-vacio">{filtrando ? 'Nada coincide con los filtros.' : 'Sin registros todavía.'}</div>}
      {lista.map(i => {
        const abierto = abiertos.has(i.id);
        const c = i.correctivo;
        const titulo = c?.falla || i.descripcion;
        const tecnicos = i.tecnicos.map(t => t.nombre).join(', ');
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
                  {[tecnicos && `Por ${tecnicos}`, i.horas != null && `${i.horas} h`, i.horasParada != null && `${i.horasParada} h parado`].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{ color: 'var(--text-muted)', display: 'inline-flex', transform: abierto ? 'rotate(180deg)' : undefined }}><Icono n="abajo" /></span>
            </button>
            {abierto && (
              <div className="mt-hist-detalle">
                {titulo !== i.descripcion && <div><h4>Qué se hizo</h4><span style={{ whiteSpace: 'pre-wrap' }}>{i.descripcion}</span></div>}
                {c && (
                  <>
                    <div><h4>Causa</h4>{c.causa || '—'}</div>
                    <div><h4>Trabajo realizado</h4><span style={{ whiteSpace: 'pre-wrap' }}>{c.solucion || '—'}</span></div>
                  </>
                )}
                {(i.revisadoPor || i.aprobadoPor) && <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>{[i.revisadoPor && `Revisó: ${i.revisadoPor}`, i.aprobadoPor && `Aprobó: ${i.aprobadoPor}`].filter(Boolean).join(' · ')}</div>}
                <DetalleTecnicos tecnicos={i.tecnicos.map(t => ({ nombre: t.nombre, fecha: t.fecha ?? '', inicio: t.inicio ?? '', fin: t.fin ?? '' }))} />
                {i.repuestosUsados && <div><h4>Repuestos usados</h4>{i.repuestosUsados}</div>}
                {(s.trabaja || s.esAdmin) && (
                  <div className="mt-acciones" style={{ marginBottom: 0 }}>
                    {s.trabaja && !i.otNumero && <Button variant="ghost" size="sm" onClick={() => setEditando(i)}><Icono n="editar" /> Editar</Button>}
                    {s.esAdmin && <Button variant="dangerGhost" size="sm" onClick={() => void borrar(i)}><Icono n="borrar" /> Borrar</Button>}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <IntervencionForm open={formOpen || !!editando} onClose={() => { setFormOpen(false); setEditando(null); }} equipoId={equipoId} intervencion={editando} />
    </div>
  );
}

function SolapaRepuestos({ equipoId, repuestos }: { equipoId: string; repuestos: RepuestoCritico[] }) {
  const s = useMantenimiento();
  const toast = useToast();
  const confirmar = useConfirm();
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<RepuestoCritico | null>(null);

  async function borrar(r: RepuestoCritico) {
    if (!(await confirmar(`¿Quitar ${r.codigo} de los repuestos críticos de este equipo? (No se borra del Depósito.)`, { textoConfirmar: 'Quitar', peligroso: true }))) return;
    try {
      await s.quitarRepuesto(r.equipoId, r.itemId);
      toast('Repuesto quitado', 'success');
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    }
  }

  return (
    <div>
      {s.esAdmin && (
        <div className="mt-acciones">
          <Button variant="primary" size="sm" onClick={() => setFormOpen(true)}><Icono n="mas" /> Agregar repuesto crítico</Button>
        </div>
      )}
      {!repuestos.length && <div className="mt-vacio">Este equipo no tiene repuestos críticos cargados.</div>}
      {repuestos.map(r => {
        const falta = (r.stock ?? 0) < Math.max(1, r.cantidad);
        return (
          <div key={r.itemId} className="mt-fila">
            <div className="mt-fila-cuerpo">
              <div className="mt-fila-titulo">{r.codigo} — {r.descripcion || 'Sin descripción'}</div>
              <div className="mt-fila-sub">
                Tener: {r.cantidad} · En {r.deposito ?? 'el Depósito'}: <strong>{r.stock ?? 0}</strong>{r.ubicacion && <> · Ubic. {r.ubicacion}</>}
                {r.nota && <> · {r.nota}</>}
              </div>
              {falta && <div className="mt-tags" style={{ marginTop: 4 }}><span className="mt-tag critico"><Icono n="alerta" /> Falta stock</span></div>}
            </div>
            {s.esAdmin && (
              <div className="mt-fila-acciones">
                <Button variant="ghost" size="icon" title="Editar" aria-label={`Editar ${r.codigo}`} onClick={() => setEditando(r)}><Icono n="editar" /></Button>
                <Button variant="dangerGhost" size="icon" title="Quitar" aria-label={`Quitar ${r.codigo}`} onClick={() => void borrar(r)}><Icono n="borrar" /></Button>
              </div>
            )}
          </div>
        );
      })}
      <RepuestoCriticoForm open={formOpen || !!editando} onClose={() => { setFormOpen(false); setEditando(null); }} equipoId={equipoId} repuesto={editando} />
    </div>
  );
}

function SolapaManuales({ equipoId, manuales }: { equipoId: string; manuales: FichaDeEquipo['manuales'] }) {
  const s = useMantenimiento();
  const toast = useToast();
  const confirmar = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  // la barra: qué manual va (de cuántos), su nombre y cuánto lleva
  const [avance, setAvance] = useState<{ nombre: string; n: number; de: number; p: number | 'optimizando' } | null>(null);

  async function subir(ev: React.ChangeEvent<HTMLInputElement>) {
    const archivos = [...(ev.target.files ?? [])];
    ev.target.value = '';
    if (!archivos.length) return;
    setSubiendo(true);
    let subidos = 0;
    for (const [i, archivo] of archivos.entries()) {
      setAvance({ nombre: archivo.name, n: i + 1, de: archivos.length, p: 0 });
      try {
        await s.subirManual(equipoId, archivo, p => setAvance(a => a && { ...a, p }));
        subidos += 1;
      } catch (err) {
        toast(mensajeDeError(err), 'error');
      }
    }
    setSubiendo(false);
    setAvance(null);
    if (subidos) toast(subidos === 1 ? 'Manual agregado' : `${subidos} manuales agregados`, 'success');
  }

  async function borrar(id: string, nombre: string) {
    if (!(await confirmar(`¿Quitar el manual "${nombre}"?`, { textoConfirmar: 'Quitar', peligroso: true }))) return;
    try {
      await s.quitarManual(id);
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    }
  }

  return (
    <div>
      {s.esAdmin && (
        <div className="mt-acciones">
          <Button variant="primary" size="sm" disabled={subiendo} onClick={() => inputRef.current?.click()}><Icono n="importar" /> {subiendo ? 'Subiendo...' : 'Subir manual (PDF)'}</Button>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={e => void subir(e)} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>Hasta 200 MB cada uno. Se abren por partes: la primera página aparece enseguida.</span>
        </div>
      )}
      {avance && (
        <div className="mt-subida" aria-live="polite">
          <div className="mt-subida-texto">
            <span>{avance.de > 1 && `${avance.n} de ${avance.de} · `}{avance.nombre}</span>
            <strong>{avance.p === 'optimizando' ? 'Preparando para verlo rápido…' : `Subiendo… ${avance.p} %`}</strong>
          </div>
          <div className={`mt-subida-barra${avance.p === 'optimizando' ? ' optimizando' : ''}`} role="progressbar" aria-label={`Subiendo ${avance.nombre}`}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={avance.p === 'optimizando' ? 100 : avance.p}>
            <div style={{ width: `${avance.p === 'optimizando' ? 100 : avance.p}%` }} />
          </div>
        </div>
      )}
      {!manuales.length && <div className="mt-vacio">No hay manuales cargados para este equipo.</div>}
      {manuales.map(m => (
        <div key={m.id} className="mt-fila">
          <div style={{ fontSize: 22, color: 'var(--danger)' }}><Icono n="documento" /></div>
          <div className="mt-fila-cuerpo">
            <div className="mt-fila-titulo" style={{ wordBreak: 'break-word' }}>{m.nombre}</div>
            <div className="mt-fila-sub">{[tamanio(m.tamanioBytes), `subido el ${formatearFechaSola(m.subidoEl)}`].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="mt-fila-acciones">
            <a className={botonVariantes({ variant: 'primary', size: 'sm' })} href={m.url} target="_blank" rel="noopener"><Icono n="ver" /> Abrir</a>
            {s.esAdmin && <Button variant="dangerGhost" size="icon" title="Quitar" aria-label={`Quitar ${m.nombre}`} onClick={() => void borrar(m.id, m.nombre)}><Icono n="borrar" /></Button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function SolapaPreventivo({ ficha }: { ficha: FichaDeEquipo }) {
  const s = useMantenimiento();
  const hoy = fechaHoyISO();
  const [rutinaForm, setRutinaForm] = useState<Rutina | 'nueva' | null>(null);
  const [otAbierta, setOtAbierta] = useState<string | null>(null);
  const [correctivaOpen, setCorrectivaOpen] = useState(false);
  const [cargarOpen, setCargarOpen] = useState(false);
  const abiertas = [...ficha.ordenes].sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada));

  return (
    <div>
      {(s.esAdmin || s.trabaja) && (
        <div className="mt-acciones">
          {s.esAdmin && <Button variant="primary" size="sm" onClick={() => setRutinaForm('nueva')}><Icono n="mas" /> Nueva rutina</Button>}
          {(s.esAdmin || s.jefe) && <Button variant="ghost" size="sm" onClick={() => setCorrectivaOpen(true)}><Icono n="fecha" /> Programar correctiva</Button>}
          {s.trabaja && <Button variant="ghost" size="sm" onClick={() => setCargarOpen(true)}><Icono n="herramienta" /> Cargar OT correctiva</Button>}
        </div>
      )}

      <div className="mt-bloque-titulo" style={{ marginTop: 4 }}>Órdenes de trabajo abiertas</div>
      {!abiertas.length && <div className="mt-vacio">No hay órdenes abiertas.</div>}
      {abiertas.map(o => (
        <div key={o.id} className="mt-fila">
          <div className="mt-fila-cuerpo">
            <div className="mt-tags" style={{ marginBottom: 4 }}>
              <strong style={{ fontSize: 13 }}>{numeroOT(o.numero)}</strong>
              <EstadoOT ot={o} estado={estadoAviso(o, hoy)} conFecha />
            </div>
            <div className="mt-fila-sub">{resumenTareas(o.tareas)}{avanceTareas(o) && ` · ${avanceTareas(o)}`}{o.asignado && ` · ${o.asignado}`}</div>
          </div>
          <Button variant="primary" size="sm" onClick={() => setOtAbierta(o.id)}>Ver</Button>
        </div>
      ))}

      <div className="mt-bloque-titulo" style={{ marginTop: 16 }}>Rutinas preventivas</div>
      {!ficha.rutinas.length && <div className="mt-vacio">Este equipo no tiene rutinas. Con una rutina, las órdenes preventivas se generan solas.</div>}
      {ficha.rutinas.map(r => (
        <div key={r.id} className="mt-fila">
          <div className="mt-fila-cuerpo">
            <div className="mt-fila-titulo">{resumenTareas(r.tareas)}</div>
            <div className="mt-fila-sub">
              {r.activa ? <>{frecuenciaEnPalabras(r.frecuenciaDias)} · próxima {formatearFechaSola(r.proximaFecha)} · aviso {r.avisoDias} días antes</> : 'Desactivada'}
              {r.responsable && ` · ${r.responsable}`}
              {r.repuestos.length > 0 && ` · ${r.repuestos.length} ${r.repuestos.length === 1 ? 'repuesto' : 'repuestos'}`}
            </div>
          </div>
          {s.esAdmin && <Button variant="ghost" size="icon" title="Editar rutina" aria-label="Editar rutina" onClick={() => setRutinaForm(r)}><Icono n="editar" /></Button>}
        </div>
      ))}

      <RutinaForm open={!!rutinaForm} onClose={() => setRutinaForm(null)} rutina={rutinaForm === 'nueva' ? null : rutinaForm} equipoId={ficha.equipo.id} />
      <OrdenCorrectivaForm open={correctivaOpen} onClose={() => setCorrectivaOpen(false)} equipoId={ficha.equipo.id} />
      <CargarCorrectivaForm open={cargarOpen} onClose={() => setCargarOpen(false)} equipoId={ficha.equipo.id} />
      <OrdenDetalleModal ordenId={otAbierta} onClose={() => setOtAbierta(null)} />
    </div>
  );
}
