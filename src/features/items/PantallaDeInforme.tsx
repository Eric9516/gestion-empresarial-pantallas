import { useMemo, useState } from 'react';
import ResponsiveList, { type Column } from '../../components/ResponsiveList';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { descargarPdfBlob } from '../../lib/pdfBlob';
import { generarTablaPdf, type ColumnaPdf, type SeccionPdf } from '../../lib/tablaPdf';
import { LETRAS_PDF, type LetraPdf } from '../../lib/preferencias';
import MasAcciones from '../../components/MasAcciones';
import type { Familia, Subfamilia } from '../familias/tipos';
import PedidoModal, { type DatosDelPedido } from './PedidoModal';
import { cantidadAComprar, estadoDe, ETIQUETA_ESTADO, LIMITE_DEL_INFORME_PDF, type EstadoReposicion } from './reposicion';
import type { FiltrosDeReposicion, InformeDeReposicion, RepuestoAReponer } from './tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';
import Copiable from '../../components/Copiable';

const stockDe = (it: RepuestoAReponer) => it.stock ?? 0;

// Agrupa sin alterar el orden en que vienen los repuestos dentro de cada grupo
// (los sin stock primero); los grupos se ordenan por nombre.
function agrupar(items: RepuestoAReponer[], clave: (it: RepuestoAReponer) => string, nombre: (it: RepuestoAReponer) => string) {
  const mapa = new Map<string, { id: string; nombre: string; items: RepuestoAReponer[] }>();
  for (const it of items) {
    const id = clave(it);
    const grupo = mapa.get(id) ?? { id, nombre: nombre(it), items: [] };
    grupo.items.push(it);
    mapa.set(id, grupo);
  }
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// Los sin stock primero, después los de mayor cantidad a comprar (el mismo orden con el que los trae la base).
const porUrgencia = (a: RepuestoAReponer, b: RepuestoAReponer) => {
  const cero = Number(stockDe(a) > 0) - Number(stockDe(b) > 0);
  return cero || cantidadAComprar(b) - cantidadAComprar(a) || a.codigo.localeCompare(b.codigo);
};

function Titulo({ nivel, nombre, cantidad, todosMarcados, onToggle }: {
  nivel: 1 | 2; nombre: string; cantidad: number; todosMarcados: boolean; onToggle: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8, margin: nivel === 1 ? '20px 0 8px' : '12px 0 6px',
      paddingBottom: 4, borderBottom: nivel === 1 ? '2px solid var(--border)' : '1px solid var(--border)',
      fontWeight: 800, fontSize: nivel === 1 ? 15 : 13, color: nivel === 1 ? 'var(--blue)' : 'var(--text-mid)',
    }}>
      {nombre}
      <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)' }}>{cantidad}</span>
      <Button type="button" variant="ghost" size="sm" style={{ marginLeft: 'auto', fontWeight: 600 }} onClick={onToggle}>
        {todosMarcados ? 'Quitar selección' : 'Seleccionar todos'}
      </Button>
    </div>
  );
}

function ChipSinStock() {
  return (
    <span style={{ display: 'inline-flex', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'var(--danger-bg, #fbe4e4)', color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
      Sin stock
    </span>
  );
}

const ESTILO_ESTADO: Record<EstadoReposicion, { color: string }> = {
  presupuesto: { color: '#d99a1e' },
  compras: { color: 'var(--blue)' },
};

// El estado de cada repuesto se cambia ahí mismo, con una lista en su fila (no hace falta tildarlo y subir a la barra de arriba). El borde de color
// dice de un vistazo en qué está: sin color = todavía no se pidió. Está afuera de la pantalla para que no se rehaga entero con cada cambio.
function EstadoSelect({ it, guardando, onCambiar }: { it: RepuestoAReponer; guardando: boolean; onCambiar: (id: string, estado: EstadoReposicion | null) => void }) {
  const estado = estadoDe(it);
  return (
    <Select
      aria-label={`Estado de ${it.codigo}`}
      value={estado ?? ''}
      disabled={guardando}
      onChange={e => onCambiar(it.id, (e.target.value || null) as EstadoReposicion | null)}
      style={{ minWidth: 150, padding: '4px 8px', fontSize: 12, borderLeft: `4px solid ${estado ? ESTILO_ESTADO[estado].color : 'var(--border)'}` }}
    >
      <option value="">Sin marcar</option>
      <option value="presupuesto">{ETIQUETA_ESTADO.presupuesto}</option>
      <option value="compras">{ETIQUETA_ESTADO.compras}</option>
    </Select>
  );
}

type FiltroEstado = '' | 'sin' | EstadoReposicion;

/** Los filtros que se ven; los guarda quien usa la pantalla, que busca con ellos (el texto, cuando la persona hace una pausa). */
export interface FiltrosDelInforme { texto: string; familiaId: string; estado: string }

/** Lo que la pantalla puede hacer; cada app lo hace a su manera (Supabase en la de Vite, el servidor en la de Next). */
export interface AccionesDelInforme {
  /** El informe con estos filtros, hasta `limite` filas (para el PDF, que lleva todo). */
  pedir: (f: FiltrosDeReposicion) => Promise<InformeDeReposicion>;
  /** Marca (o desmarca, con null) el estado de reposición de varios repuestos. */
  marcar: (ids: string[], estado: EstadoReposicion | null) => Promise<void>;
  registrarError: (descripcion: string, err: unknown) => Promise<void>;
}

interface Props {
  familias: Familia[];
  subfamilias: Subfamilia[];
  filtros: FiltrosDelInforme;
  onFiltros: (f: FiltrosDelInforme) => void;
  /** El texto ya con la pausa (el que se usó para buscar): el PDF sale con el mismo. */
  textoBuscado: string;
  datos: { informe: InformeDeReposicion | undefined; isLoading: boolean; isError: boolean };
  acciones: AccionesDelInforme;
  letraPdf: LetraPdf;
  onLetraPdf: (l: LetraPdf) => void;
  /** Lo que necesita la solicitud de presupuesto (empresa, proveedores, búsqueda de repuestos). */
  pedido: Omit<DatosDelPedido, 'letraPdf'>;
}

// Depósito → Informe. Solo dibuja y pide: los datos y las acciones los pone cada app (la de Vite con Supabase, la de Next con el servidor).
// Lo que hay que comprar: repuestos con stock_minimo cargado cuyo stock llegó al punto de pedido (o bajó de él). La base los filtra, los ordena por urgencia
// y trae los primeros (con el total y cuántos están sin stock): la pantalla nunca descarga el catálogo.
export default function PantallaDeInforme({ familias, subfamilias, filtros, onFiltros, textoBuscado, datos, acciones, letraPdf, onLetraPdf, pedido }: Props) {
  const toast = useToast();
  const confirmar = useConfirm();
  const { texto: busqueda, familiaId } = filtros;
  const filtroEstado = filtros.estado as FiltroEstado;
  const [marcando, setMarcando] = useState(false);
  // Repuestos cuyo estado se está guardando en este momento (cada fila se bloquea sola mientras tanto; las demás siguen disponibles).
  const [guardandoIds, setGuardandoIds] = useState<Set<string>>(() => new Set());
  const [porFamilia, setPorFamilia] = useState(false);
  const [porSubfamilia, setPorSubfamilia] = useState(false);
  // La selección guarda los repuestos mismos (no solo su id): se mantiene aunque cambien la búsqueda o los filtros, y el pedido lleva todo lo seleccionado.
  const [seleccion, setSeleccion] = useState<Map<string, RepuestoAReponer>>(() => new Map());
  const [pedidoAbierto, setPedidoAbierto] = useState(false);
  const busquedaDebounced = textoBuscado;
  const { informe, isLoading, isError } = datos;
  const filas = useMemo(() => informe?.filas ?? [], [informe]);
  const total = informe?.total ?? 0;
  const sinStock = informe?.totalSinStock ?? 0;

  const familiaPorId = useMemo(() => new Map(familias.map(f => [f.id, f.nombre])), [familias]);
  const subfamiliaPorId = useMemo(() => new Map(subfamilias.map(s => [s.id, s.nombre])), [subfamilias]);
  const nombreFamilia = (it: RepuestoAReponer) => familiaPorId.get(it.familia_id) ?? 'Sin familia';
  const nombreSubfamilia = (it: RepuestoAReponer) => subfamiliaPorId.get(it.subfamilia_id) ?? 'Sin subfamilia';

  const seleccionados = useMemo(() => [...seleccion.values()].sort(porUrgencia), [seleccion]);

  function toggleUno(it: RepuestoAReponer) {
    setSeleccion(prev => {
      const s = new Map(prev);
      if (!s.delete(it.id)) s.set(it.id, it);
      return s;
    });
  }

  const todosMarcados = (lista: RepuestoAReponer[]) => lista.length > 0 && lista.every(it => seleccion.has(it.id));

  function toggleVarios(lista: RepuestoAReponer[]) {
    setSeleccion(prev => {
      const s = new Map(prev);
      if (todosMarcados(lista)) lista.forEach(it => s.delete(it.id));
      else lista.forEach(it => s.set(it.id, it));
      return s;
    });
  }

  async function marcarEstado(ids: string[], estado: EstadoReposicion | null) {
    setMarcando(true);
    try {
      await acciones.marcar(ids, estado);
      const cuantos = ids.length === 1 ? '1 artículo' : `${ids.length} artículos`;
      toast(estado ? `${cuantos}: ${ETIQUETA_ESTADO[estado].toLowerCase()}` : `${cuantos} sin marcar`, 'success');
    } catch (err) {
      await acciones.registrarError('Error al marcar el estado de reposición', err);
      toast('No se pudo actualizar el estado.', 'error');
    } finally {
      setMarcando(false);
    }
  }

  async function cambiarEstadoDeUno(id: string, estado: EstadoReposicion | null) {
    setGuardandoIds(prev => new Set(prev).add(id));
    await marcarEstado([id], estado);
    setGuardandoIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  }

  async function marcarSeleccionados(estado: EstadoReposicion | null) {
    await marcarEstado(seleccionados.map(it => it.id), estado);
    setSeleccion(new Map());
  }

  // Al bajar un pedido se ofrece marcarlo como pendiente de presupuesto; solo los
  // que todavía no tienen estado (uno que ya pasó a compras no vuelve atrás).
  async function handlePedidoDescargado(ids: string[]) {
    const enElPedido = new Set(ids);
    const sinMarcar = seleccionados.filter(it => enElPedido.has(it.id) && !it.estado_reposicion).map(it => it.id);
    if (!sinMarcar.length) return;
    const cuales = sinMarcar.length === 1 ? 'este artículo' : `estos ${sinMarcar.length} artículos`;
    if (!(await confirmar(`¿Marcar ${cuales} como "${ETIQUETA_ESTADO.presupuesto}"?`, { textoConfirmar: 'Marcar' }))) return;
    await marcarEstado(sinMarcar, 'presupuesto');
  }

  // Separar por subfamilia se apoya en separar por familia (es "además"): si se
  // destilda la familia, también se quita la subfamilia.
  const armarGrupos = (lista: RepuestoAReponer[]) => {
    if (!porFamilia) return null;
    const porFam = agrupar(lista, it => it.familia_id, nombreFamilia);
    return porFam.map(g => ({ ...g, subgrupos: porSubfamilia ? agrupar(g.items, it => it.subfamilia_id, nombreSubfamilia) : null }));
  };
  const grupos = armarGrupos(filas); // como mucho 500 filas: se arma en el momento

  // El PDF sale con lo que se ve en pantalla (mismos filtros, mismo orden y, si están tildados los checks, separado por familia y subfamilia), pero con TODO lo que
  // cumple, no solo con las primeras filas de la pantalla (hasta el tope del PDF).
  async function handleExportarPdf() {
    try {
      const completo = await acciones.pedir({ texto: busquedaDebounced, familiaId, estado: filtroEstado, limite: LIMITE_DEL_INFORME_PDF });
      const todas = completo.filas;
      const gruposPdf = armarGrupos(todas);
      const columnasPdf: ColumnaPdf[] = [
        { header: 'CÓDIGO', ancho: 27 },
        { header: 'DESCRIPCIÓN' },
        { header: 'STOCK', ancho: 15, align: 'right' },
        { header: 'PTO. PED.', ancho: 19, align: 'right' },
        { header: 'MÍN.', ancho: 15, align: 'right' },
        { header: 'COMPRAR', ancho: 19, align: 'right' },
      ];
      const filaPdf = (it: RepuestoAReponer) => [it.codigo, it.descripcion, String(stockDe(it)), String(it.punto_pedido), String(it.stock_minimo), String(cantidadAComprar(it))];

      const secciones: SeccionPdf[] = !gruposPdf
        ? [{ filas: todas.map(filaPdf) }]
        : gruposPdf.flatMap(g => {
          const tituloFamilia = { texto: `${g.nombre} (${g.items.length})`, nivel: 1 as const };
          if (!g.subgrupos) return [{ titulos: [tituloFamilia], filas: g.items.map(filaPdf) }];
          return g.subgrupos.map((s, i) => ({
            titulos: [...(i === 0 ? [tituloFamilia] : []), { texto: `${s.nombre} (${s.items.length})`, nivel: 2 as const }],
            filas: s.items.map(filaPdf),
          }));
        });

      const familiaFiltrada = familias.find(f => f.id === familiaId)?.nombre;
      const filtros = [
        familiaFiltrada && `Familia: ${familiaFiltrada}`,
        filtroEstado && `Estado: ${filtroEstado === 'sin' ? 'sin marcar' : ETIQUETA_ESTADO[filtroEstado].toLowerCase()}`,
        busquedaDebounced.trim() && `Búsqueda: "${busquedaDebounced.trim()}"`,
        porFamilia && (porSubfamilia ? 'Separado por familia y subfamilia' : 'Separado por familia'),
        completo.total > todas.length && `Se incluyen los primeros ${todas.length} de ${completo.total}`,
      ].filter(Boolean).join(' · ');

      const blob = await generarTablaPdf({
        letra: letraPdf,
        empresa: pedido.empresa.nombre,
        logo: pedido.empresa.logo,
        titulo: 'Informe de reposición',
        fecha: fechaHoyISO(),
        datos: [
          { etiqueta: 'Filtros', texto: filtros || 'ninguno (todos los artículos a reponer)' },
          { etiqueta: 'Artículos', texto: `${todas.length}${completo.totalSinStock > 0 ? ` (${completo.totalSinStock} sin stock)` : ''}` },
        ],
        columnas: columnasPdf,
        secciones,
      });
      descargarPdfBlob(blob, `informe_reposicion_${fechaHoyISO()}.pdf`);
    } catch (err) {
      await acciones.registrarError('Error al exportar el informe de reposición a PDF', err);
      toast('No se pudo generar el PDF: ' + mensajeDeError(err), 'error');
    }
  }

  const columns: Column<RepuestoAReponer>[] = [
    { header: '', render: it => <input type="checkbox" aria-label={`Seleccionar ${it.codigo}`} checked={seleccion.has(it.id)} onChange={() => toggleUno(it)} /> },
    { header: 'Código', render: it => <Copiable texto={it.codigo} que="código"><strong>{it.codigo}</strong></Copiable> },
    { header: 'Descripción', render: it => <Copiable texto={it.descripcion} que="descripción" /> },
    ...(porFamilia ? [] : [{ header: 'Familia', render: (it: RepuestoAReponer) => familiaPorId.get(it.familia_id) ?? '—' }]),
    { header: 'Stock', render: it => (stockDe(it) === 0 ? <ChipSinStock /> : <span>{stockDe(it)}</span>) },
    { header: 'Pto. pedido', render: it => <span>{it.punto_pedido}</span> },
    { header: 'Stock mín.', render: it => <span>{it.stock_minimo}</span> },
    { header: 'A comprar', render: it => <strong>{cantidadAComprar(it)}</strong> },
    { header: 'Estado', render: it => <EstadoSelect it={it} guardando={guardandoIds.has(it.id)} onCambiar={(id, e) => void cambiarEstadoDeUno(id, e)} /> },
  ];

  function renderCard(it: RepuestoAReponer) {
    return (
      <div className="prov-card">
        <div className="prov-card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={seleccion.has(it.id)} onChange={() => toggleUno(it)} />
              <Copiable texto={it.codigo} que="código"><span className="prov-card-name">{it.codigo}</span></Copiable>
            </label>
            {stockDe(it) === 0 && <ChipSinStock />}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-mid)' }}><Copiable texto={it.descripcion} que="descripción" /></div>
        </div>
        <div className="prov-card-body">
          <div className="prov-card-row">Stock: <strong>{stockDe(it)}</strong> · Pto. pedido: {it.punto_pedido} · Mínimo: {it.stock_minimo}</div>
          <div className="prov-card-row">A comprar: <strong>{cantidadAComprar(it)}</strong></div>
          <div className="prov-card-row"><EstadoSelect it={it} guardando={guardandoIds.has(it.id)} onCambiar={(id, e) => void cambiarEstadoDeUno(id, e)} /></div>
        </div>
      </div>
    );
  }

  const hayFiltros = !!(busquedaDebounced.trim() || familiaId || filtroEstado);
  const lista = (data: RepuestoAReponer[]) => (
    <ResponsiveList
      columns={columns}
      data={data}
      renderCard={renderCard}
      keyField={it => it.id}
      emptyIcon={<Icono n="exito" />}
      emptyTitle={!hayFiltros ? 'No hay nada para reponer' : 'Sin resultados'}
      emptyDescription={!hayFiltros ? 'Ningún artículo llegó a su punto de pedido.' : 'Probá con otra búsqueda, familia o estado.'}
    />
  );

  return (
    <div>
      <div className="section-header">
        <div className="section-title"><Icono n="informe" /> Informe de reposición</div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 12 }}>
        Artículos cuyo stock llegó al punto de pedido. Se compra hasta volver al stock mínimo.
        {!isLoading && !isError && <> <strong>{total}</strong> a reponer{sinStock > 0 && <>, {sinStock} sin stock</>}.</>}
        {!isLoading && !isError && total > filas.length && <> Se muestran los {filas.length} más urgentes: filtrá por familia, estado o búsqueda para ver el resto (el PDF incluye todos).</>}
      </p>

      <div className="toolbar">
        <div className="search-wrap">
          <Input type="text" placeholder="Buscar por código o descripción..." value={busqueda} onChange={e => onFiltros({ ...filtros, texto: e.target.value })} />
        </div>
        <Select className="filter-select" aria-label="Familia" value={familiaId} onChange={e => onFiltros({ ...filtros, familiaId: e.target.value })}>
          <option value="">Todas las familias</option>
          {familias.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
        </Select>
        <Select className="filter-select" aria-label="Filtrar por estado" value={filtroEstado} onChange={e => onFiltros({ ...filtros, estado: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="sin">Sin marcar</option>
          <option value="presupuesto">{ETIQUETA_ESTADO.presupuesto}</option>
          <option value="compras">{ETIQUETA_ESTADO.compras}</option>
        </Select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={porFamilia} onChange={e => { setPorFamilia(e.target.checked); if (!e.target.checked) setPorSubfamilia(false); }} />
          Separar por familia
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: porFamilia ? 'pointer' : 'not-allowed', opacity: porFamilia ? 1 : 0.5, whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={porSubfamilia} disabled={!porFamilia} onChange={e => setPorSubfamilia(e.target.checked)} />
          y por subfamilia
        </label>
      </div>

      <div className="toolbar" style={{ marginTop: 0 }}>
        <Button variant="ghost" size="sm" disabled={filas.length === 0} onClick={() => toggleVarios(filas)}>
          {todosMarcados(filas) ? 'Quitar selección de lo visible' : `Seleccionar todo lo visible (${filas.length})`}
        </Button>
        {seleccionados.length > 0 && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setSeleccion(new Map())}>Limpiar selección</Button>
            <Select
              className="filter-select"
              aria-label="Marcar los seleccionados como"
              value=""
              disabled={marcando}
              onChange={e => void marcarSeleccionados(e.target.value === 'sin' ? null : e.target.value as EstadoReposicion)}
            >
              <option value="" disabled>Marcar como...</option>
              <option value="presupuesto">{ETIQUETA_ESTADO.presupuesto}</option>
              <option value="compras">{ETIQUETA_ESTADO.compras}</option>
              <option value="sin">Sin marcar</option>
            </Select>
          </>
        )}
        <Button variant="primary" size="sm" disabled={seleccionados.length === 0} onClick={() => setPedidoAbierto(true)}>
          <Icono n="documento" /> Armar solicitud de presupuesto ({seleccionados.length})
        </Button>
        <MasAcciones
          acciones={[{ clave: 'pdf', texto: 'Exportar informe PDF', icono: <Icono n="exportar" />, deshabilitada: filas.length === 0, onClick: () => void handleExportarPdf() }]}
          grupos={[{ titulo: 'Letra del PDF', opciones: LETRAS_PDF, elegida: letraPdf, onElegir: id => onLetraPdf(id as LetraPdf) }]}
        />
      </div>

      {isLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {isError && <p style={{ color: 'var(--danger)' }}>Error al cargar los artículos.</p>}

      {!isLoading && !isError && (!grupos || filas.length === 0) && lista(filas)}
      {!isLoading && !isError && grupos && filas.length > 0 && grupos.map(g => (
        <section key={g.id}>
          <Titulo nivel={1} nombre={g.nombre} cantidad={g.items.length} todosMarcados={todosMarcados(g.items)} onToggle={() => toggleVarios(g.items)} />
          {g.subgrupos
            ? g.subgrupos.map(s => (
              <div key={s.id}>
                <Titulo nivel={2} nombre={s.nombre} cantidad={s.items.length} todosMarcados={todosMarcados(s.items)} onToggle={() => toggleVarios(s.items)} />
                {lista(s.items)}
              </div>
            ))
            : lista(g.items)}
        </section>
      ))}

      {pedidoAbierto && <PedidoModal items={seleccionados} onClose={() => setPedidoAbierto(false)} onDescargado={ids => void handlePedidoDescargado(ids)} datos={{ ...pedido, letraPdf }} />}
    </div>
  );
}
