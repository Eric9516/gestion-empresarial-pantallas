import { useMemo, useState } from 'react';
import ResponsiveList, { type Column } from '../../components/ResponsiveList';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { descargarPdfBlob } from '../../lib/pdfBlob';
import { generarTablaPdf, type ColumnaPdf, type SeccionPdf } from '../../lib/tablaPdf';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { useConfiguracionQuery } from '../config/useConfiguracion';
import { NOMBRE_EMPRESA_POR_DEFECTO } from '../../lib/empresa';
import { useFamiliasQuery } from '../familias/useFamilias';
import PedidoModal from './PedidoModal';
import { cantidadAComprar, estadoDe, ETIQUETA_ESTADO, necesitaReposicion, type EstadoReposicion } from './reposicion';
import { prepararBusqueda, puntajeConBusquedaPreparada, useItemsQuery, useMarcarEstadoReposicion, type Item } from './useItems';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

const stockDe = (it: Item) => it.stock ?? 0;

// Agrupa sin alterar el orden en que vienen los repuestos dentro de cada grupo
// (los sin stock primero); los grupos se ordenan por nombre.
function agrupar(items: Item[], clave: (it: Item) => string, nombre: (it: Item) => string) {
  const mapa = new Map<string, { id: string; nombre: string; items: Item[] }>();
  for (const it of items) {
    const id = clave(it);
    const grupo = mapa.get(id) ?? { id, nombre: nombre(it), items: [] };
    grupo.items.push(it);
    mapa.set(id, grupo);
  }
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// Los sin stock primero, después los de mayor cantidad a comprar.
const porUrgencia = (a: Item, b: Item) => {
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

const ESTILO_ESTADO: Record<EstadoReposicion, { corto: string; color: string }> = {
  presupuesto: { corto: 'Presupuesto', color: '#d99a1e' },
  compras: { corto: 'Compras', color: 'var(--blue)' },
};

// Una sola línea, sin relleno ni saltos: marcar un repuesto no cambia el alto
// de su fila. El nombre completo va en el tooltip.
// Sin estado no muestra nada (el caso normal: todavía no se pidió).
function EstadoReposicionChip({ it }: { it: Item }) {
  const estado = estadoDe(it);
  if (!estado) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const { corto, color } = ESTILO_ESTADO[estado];
  return (
    <span title={ETIQUETA_ESTADO[estado]} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-mid)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {corto}
    </span>
  );
}

type FiltroEstado = '' | 'sin' | EstadoReposicion;

// Lo que hay que comprar: repuestos con stock_minimo cargado cuyo stock llegó
// al punto de pedido (o bajó de él). Se calcula sobre la misma lista que usa
// Buscar (ya está en caché), sin pedir nada nuevo a la base.
export default function InformeReposicion() {
  const { data: items, isLoading, isError } = useItemsQuery();
  const { data: familias } = useFamiliasQuery();
  const { data: config } = useConfiguracionQuery();
  const toast = useToast();
  const confirmar = useConfirm();
  const [busqueda, setBusqueda] = useState('');
  const [familiaId, setFamiliaId] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('');
  const marcar = useMarcarEstadoReposicion();
  const [porFamilia, setPorFamilia] = useState(false);
  const [porSubfamilia, setPorSubfamilia] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
  const [pedidoAbierto, setPedidoAbierto] = useState(false);
  const busquedaDebounced = useDebouncedValue(busqueda);

  const aReponer = useMemo(() => (items ?? []).filter(necesitaReposicion), [items]);

  const filas = useMemo(() => {
    const terminos = prepararBusqueda(busquedaDebounced);
    return aReponer
      .filter(it => (!familiaId || it.familia_id === familiaId)
        && (!filtroEstado || (filtroEstado === 'sin' ? !it.estado_reposicion : it.estado_reposicion === filtroEstado))
        && (!busquedaDebounced.trim() || puntajeConBusquedaPreparada(it, terminos) > 0))
      .sort(porUrgencia);
  }, [aReponer, busquedaDebounced, familiaId, filtroEstado]);

  // La selección se mantiene aunque cambien la búsqueda o los filtros; el
  // pedido lleva todo lo seleccionado, se vea o no en pantalla en ese momento.
  const seleccionados = useMemo(() => aReponer.filter(it => seleccion.has(it.id)).sort(porUrgencia), [aReponer, seleccion]);

  function toggleUno(id: string) {
    setSeleccion(prev => {
      const s = new Set(prev);
      if (!s.delete(id)) s.add(id);
      return s;
    });
  }

  const todosMarcados = (lista: Item[]) => lista.length > 0 && lista.every(it => seleccion.has(it.id));

  function toggleVarios(lista: Item[]) {
    setSeleccion(prev => {
      const s = new Set(prev);
      if (todosMarcados(lista)) lista.forEach(it => s.delete(it.id));
      else lista.forEach(it => s.add(it.id));
      return s;
    });
  }

  async function marcarEstado(ids: string[], estado: EstadoReposicion | null) {
    try {
      await marcar.mutateAsync({ ids, estado });
      const cuantos = ids.length === 1 ? '1 artículo' : `${ids.length} artículos`;
      toast(estado ? `${cuantos}: ${ETIQUETA_ESTADO[estado].toLowerCase()}` : `${cuantos} sin marcar`, 'success');
    } catch (err) {
      await registrarErrorAccion('Error al marcar el estado de reposición', err);
      toast('No se pudo actualizar el estado.', 'error');
    }
  }

  async function marcarSeleccionados(estado: EstadoReposicion | null) {
    await marcarEstado(seleccionados.map(it => it.id), estado);
    setSeleccion(new Set());
  }

  // Al bajar un pedido se ofrece marcarlo como pendiente de presupuesto; solo los
  // que todavía no tienen estado (uno que ya pasó a compras no vuelve atrás).
  async function handlePedidoDescargado(ids: string[]) {
    const enElPedido = new Set(ids);
    const sinMarcar = aReponer.filter(it => enElPedido.has(it.id) && !it.estado_reposicion).map(it => it.id);
    if (!sinMarcar.length) return;
    const cuales = sinMarcar.length === 1 ? 'este artículo' : `estos ${sinMarcar.length} artículos`;
    if (!(await confirmar(`¿Marcar ${cuales} como "${ETIQUETA_ESTADO.presupuesto}"?`, { textoConfirmar: 'Marcar' }))) return;
    await marcarEstado(sinMarcar, 'presupuesto');
  }

  const sinStock = useMemo(() => aReponer.filter(it => stockDe(it) === 0).length, [aReponer]);

  // Separar por subfamilia se apoya en separar por familia (es "además"): si se
  // destilda la familia, también se quita la subfamilia.
  const grupos = useMemo(() => {
    if (!porFamilia) return null;
    const porFam = agrupar(filas, it => it.familia_id, it => it.familias?.nombre ?? 'Sin familia');
    return porFam.map(g => ({ ...g, subgrupos: porSubfamilia ? agrupar(g.items, it => it.subfamilia_id, it => it.subfamilias?.nombre ?? 'Sin subfamilia') : null }));
  }, [filas, porFamilia, porSubfamilia]);

  // El PDF sale con lo que se ve en pantalla: mismos filtros, mismo orden y,
  // si están tildados los checks, separado por familia y subfamilia.
  async function handleExportarPdf() {
    try {
      const columnasPdf: ColumnaPdf[] = [
        { header: 'CÓDIGO', ancho: 27 },
        { header: 'DESCRIPCIÓN' },
        { header: 'STOCK', ancho: 15, align: 'right' },
        { header: 'PTO. PED.', ancho: 19, align: 'right' },
        { header: 'MÍN.', ancho: 15, align: 'right' },
        { header: 'COMPRAR', ancho: 19, align: 'right' },
      ];
      const filaPdf = (it: Item) => [it.codigo, it.descripcion, String(stockDe(it)), String(it.punto_pedido), String(it.stock_minimo), String(cantidadAComprar(it))];

      const secciones: SeccionPdf[] = !grupos
        ? [{ filas: filas.map(filaPdf) }]
        : grupos.flatMap(g => {
          const tituloFamilia = { texto: `${g.nombre} (${g.items.length})`, nivel: 1 as const };
          if (!g.subgrupos) return [{ titulos: [tituloFamilia], filas: g.items.map(filaPdf) }];
          return g.subgrupos.map((s, i) => ({
            titulos: [...(i === 0 ? [tituloFamilia] : []), { texto: `${s.nombre} (${s.items.length})`, nivel: 2 as const }],
            filas: s.items.map(filaPdf),
          }));
        });

      const familiaFiltrada = familias?.find(f => f.id === familiaId)?.nombre;
      const filtros = [
        familiaFiltrada && `Familia: ${familiaFiltrada}`,
        filtroEstado && `Estado: ${filtroEstado === 'sin' ? 'sin marcar' : ETIQUETA_ESTADO[filtroEstado].toLowerCase()}`,
        busquedaDebounced.trim() && `Búsqueda: "${busquedaDebounced.trim()}"`,
        porFamilia && (porSubfamilia ? 'Separado por familia y subfamilia' : 'Separado por familia'),
      ].filter(Boolean).join(' · ');
      const sinStockVisibles = filas.filter(it => stockDe(it) === 0).length;

      const blob = await generarTablaPdf({
        empresa: config?.empresa_nombre || NOMBRE_EMPRESA_POR_DEFECTO,
        logo: config?.logo_base64 || '',
        titulo: 'Informe de reposición',
        fecha: fechaHoyISO(),
        datos: [
          { etiqueta: 'Filtros', texto: filtros || 'ninguno (todos los artículos a reponer)' },
          { etiqueta: 'Artículos', texto: `${filas.length}${sinStockVisibles > 0 ? ` (${sinStockVisibles} sin stock)` : ''}` },
        ],
        columnas: columnasPdf,
        secciones,
      });
      descargarPdfBlob(blob, `informe_reposicion_${fechaHoyISO()}.pdf`);
    } catch (err) {
      await registrarErrorAccion('Error al exportar el informe de reposición a PDF', err);
      toast('No se pudo generar el PDF: ' + mensajeDeError(err), 'error');
    }
  }

  const columns: Column<Item>[] = [
    { header: '', render: it => <input type="checkbox" aria-label={`Seleccionar ${it.codigo}`} checked={seleccion.has(it.id)} onChange={() => toggleUno(it.id)} /> },
    { header: 'Código', render: it => <strong>{it.codigo}</strong> },
    { header: 'Descripción', render: it => it.descripcion },
    ...(porFamilia ? [] : [{ header: 'Familia', render: (it: Item) => it.familias?.nombre ?? '—' }]),
    { header: 'Stock', render: it => (stockDe(it) === 0 ? <ChipSinStock /> : <span>{stockDe(it)}</span>) },
    { header: 'Pto. pedido', render: it => <span>{it.punto_pedido}</span> },
    { header: 'Stock mín.', render: it => <span>{it.stock_minimo}</span> },
    { header: 'A comprar', render: it => <strong>{cantidadAComprar(it)}</strong> },
    { header: 'Estado', render: it => <EstadoReposicionChip it={it} /> },
  ];

  function renderCard(it: Item) {
    return (
      <div className="prov-card">
        <div className="prov-card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={seleccion.has(it.id)} onChange={() => toggleUno(it.id)} />
              <span className="prov-card-name">{it.codigo}</span>
            </label>
            {stockDe(it) === 0 && <ChipSinStock />}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>{it.descripcion}</div>
        </div>
        <div className="prov-card-body">
          <div className="prov-card-row">Stock: <strong>{stockDe(it)}</strong> · Pto. pedido: {it.punto_pedido} · Mínimo: {it.stock_minimo}</div>
          <div className="prov-card-row">A comprar: <strong>{cantidadAComprar(it)}</strong></div>
          {estadoDe(it) && <div className="prov-card-row"><EstadoReposicionChip it={it} /></div>}
        </div>
      </div>
    );
  }

  const lista = (data: Item[]) => (
    <ResponsiveList
      columns={columns}
      data={data}
      renderCard={renderCard}
      keyField={it => it.id}
      emptyIcon={<Icono n="exito" />}
      emptyTitle={aReponer.length === 0 ? 'No hay nada para reponer' : 'Sin resultados'}
      emptyDescription={aReponer.length === 0 ? 'Ningún repuesto llegó a su punto de pedido.' : 'Probá con otra búsqueda o familia.'}
    />
  );

  return (
    <div>
      <div className="section-header">
        <div className="section-title"><Icono n="informe" /> Informe de reposición</div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 12 }}>
        Repuestos cuyo stock llegó al punto de pedido. Se compra hasta volver al stock mínimo.
        {!isLoading && !isError && <> <strong>{aReponer.length}</strong> a reponer{sinStock > 0 && <>, {sinStock} sin stock</>}.</>}
      </p>

      <div className="toolbar">
        <div className="search-wrap">
          <Input type="text" placeholder="Buscar por código o descripción..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <Select className="filter-select" value={familiaId} onChange={e => setFamiliaId(e.target.value)}>
          <option value="">Todas las familias</option>
          {familias?.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
        </Select>
        <Select className="filter-select" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as FiltroEstado)}>
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
            <Button variant="ghost" size="sm" onClick={() => setSeleccion(new Set())}>Limpiar selección</Button>
            <Select
              className="filter-select"
              value=""
              disabled={marcar.isPending}
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
        <Button variant="ghost" size="sm" disabled={filas.length === 0} onClick={() => void handleExportarPdf()}>
          
          <Icono n="exportar" /> Exportar informe PDF
        </Button>
      </div>

      {isLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {isError && <p style={{ color: 'var(--danger)' }}>Error al cargar los repuestos.</p>}

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

      {pedidoAbierto && <PedidoModal items={seleccionados} onClose={() => setPedidoAbierto(false)} onDescargado={ids => void handlePedidoDescargado(ids)} />}
    </div>
  );
}
