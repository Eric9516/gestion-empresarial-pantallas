import { clicConTeclado } from '@/lib/clicConTeclado';
import { useMemo, useState } from 'react';
import { useAlCambiar } from '../../lib/useAlCambiar';
import { useToast } from '../../components/ToastProvider';
import BotonSubir from '../../components/BotonSubir';
import ResponsiveList, { type Column } from '../../components/ResponsiveList';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { useFamiliasQuery, useSubfamiliasQuery } from '../familias/useFamilias';
import { useRetiroCart } from '../retiros/RetiroCartContext';
import { LIMITE_DE_BUSQUEDA, useBuscarRepuestos, useHayRepuestos, useRepuestoPorId, type Item, type RepuestoDeLista } from './useItems';
import ItemForm from './ItemForm';
import ItemDetail from './ItemDetail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Icono } from '@/components/Icono';

// La búsqueda se hace en la base (el catálogo nunca se descarga entero) y trae de a tandas: el botón "Ver más" pide otra tanda, hasta el tope de la base.
// Con más resultados que eso, se afina la búsqueda (texto, familia o subfamilia).
const TANDA = 100;

// Botón "Retirar" de cada fila. Está afuera de la lista (no adentro) para que no se rehaga entera cada vez que cambia el carrito.
function RetirarBtn({ enCarrito, onRetirar }: { enCarrito: boolean; onRetirar: () => void }) {
  return (
    <Button variant="primary" size="sm" onClick={onRetirar}>
      {enCarrito ? <><Icono n="ok" /> Agregado</> : <><Icono n="retirar" /> Retirar</>}
    </Button>
  );
}

export default function ItemsList() {
  const { data: familias } = useFamiliasQuery();
  const { data: subfamilias } = useSubfamiliasQuery();
  const { data: hayRepuestos } = useHayRepuestos();
  const { cart, addItem } = useRetiroCart();
  const toast = useToast();

  const [search, setSearch] = useState('');
  // El cuadro de texto se actualiza al instante; la búsqueda en la base espera a que la persona haga una pausa.
  const searchDebounced = useDebouncedValue(search, 250);
  const buscando = search.trim() !== searchDebounced.trim();
  const [familiaId, setFamiliaId] = useState('');
  const [subfamiliaId, setSubfamiliaId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  // Se guarda solo el id: el detalle se pide a la base y, si algo cambia (una foto, una edición), se renueva solo con datos frescos.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const { data: viewing } = useRepuestoPorId(viewingId);
  const [mostrarStock, setMostrarStock] = useState(false);
  // Cuántos resultados se piden, y para qué búsqueda: si la búsqueda o un filtro cambian, la cuenta vuelve a la primera tanda (se ajusta al dibujar,
  // sin efectos, y también si más tarde se vuelve a la misma búsqueda).
  const claveDeBusqueda = `${searchDebounced}|${familiaId}|${subfamiliaId}`;
  const [pedido, setPedido] = useState({ clave: claveDeBusqueda, cantidad: TANDA });
  if (pedido.clave !== claveDeBusqueda) setPedido({ clave: claveDeBusqueda, cantidad: TANDA });
  const pedidos = pedido.clave === claveDeBusqueda ? pedido.cantidad : TANDA;

  // El botón "Stock" es puntual a la tanda de resultados actual: si cambia la
  // búsqueda o los filtros (incluido borrarlos), la columna se oculta y hay
  // que volver a pedirla explícitamente.
  useAlCambiar([search, familiaId, subfamiliaId], () => { setMostrarStock(false); });

  // Ids de lo que ya está en el carrito, para saber de un vistazo si una fila dice "Retirar" o "Agregado".
  const idsEnCarrito = useMemo(() => new Set(cart.map(c => c.item_id)), [cart]);

  const subfamiliasDeLaFamilia = useMemo(
    () => (subfamilias ?? []).filter(s => !familiaId || s.familia_id === familiaId),
    [subfamilias, familiaId]
  );

  const sinFiltro = !search.trim() && !familiaId && !subfamiliaId;
  const { data: encontrados, isLoading, isError, isFetching } = useBuscarRepuestos({ texto: searchDebounced, familiaId, subfamiliaId, limite: pedidos });
  const filtrados = useMemo(() => (sinFiltro ? [] : (encontrados ?? [])), [encontrados, sinFiltro]);
  // Si vinieron tantos como se pidieron, puede haber más: se ofrece otra tanda hasta el tope; en el tope, se pide afinar.
  const puedeHaberMas = filtrados.length >= pedidos;
  const hayOtraTanda = puedeHaberMas && pedidos < LIMITE_DE_BUSQUEDA;
  const enElTope = puedeHaberMas && pedidos >= LIMITE_DE_BUSQUEDA;

  function handleRetirar(item: RepuestoDeLista) {
    addItem(item);
    toast(`${item.codigo} agregado al carrito`, 'success');
  }

  // El estado "Agregado" se lee directo del carrito: se mantiene mientras el ítem siga ahí, y solo desaparece cuando se saca del carrito o se confirma
  // el retiro (que lo vacía).
  const botonRetirar = (item: RepuestoDeLista) => <RetirarBtn enCarrito={idsEnCarrito.has(item.id)} onRetirar={() => handleRetirar(item)} />;

  const columns: Column<RepuestoDeLista>[] = [
    {
      header: 'Código', render: it => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer' }} {...clicConTeclado(() => setViewingId(it.id))}>
          <strong>{it.codigo}</strong>
          {it.foto_url && <img src={it.foto_url} alt="" loading="lazy" decoding="async" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />}
        </div>
      ),
    },
    { header: 'Descripción', render: it => <span style={{ cursor: 'pointer' }} onClick={() => setViewingId(it.id)}>{it.descripcion}</span> },
    ...(mostrarStock ? [{ header: 'Stock', render: (it: RepuestoDeLista) => <span>{it.stock ?? '-'}</span> } as Column<RepuestoDeLista>] : []),
    { header: '', render: it => <div className="td-actions" style={{ flexWrap: 'nowrap' }}>{botonRetirar(it)}</div> },
  ];

  function renderCard(it: RepuestoDeLista) {
    return (
      <div className="prov-card">
        <div className="prov-card-header" {...clicConTeclado(() => setViewingId(it.id))} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, width: '100%' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="prov-card-name">{it.codigo}</div>
              <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2, lineHeight: '16px', minHeight: 32 }}>{it.descripcion}</div>
            </div>
            {it.foto_url && <img src={it.foto_url} alt="" loading="lazy" decoding="async" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
          </div>
          {mostrarStock && <span className="badge badge-rubro">Stock: {it.stock ?? '-'}</span>}
        </div>
        <div className="prov-card-actions">
          {botonRetirar(it)}
        </div>
      </div>
    );
  }

  const catalogoVacio = hayRepuestos === false;

  return (
    <div>
      <div className="section-header">
        <div className="section-title"><Icono n="buscar" /> Buscar repuestos</div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Input type="text" placeholder="Código, número o descripción..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select className="filter-select" aria-label="Familia" value={familiaId} onChange={e => { setFamiliaId(e.target.value); setSubfamiliaId(''); }}>
          <option value="">Todas las familias</option>
          {familias?.map(f => <option key={f.id} value={f.id}>{f.nombre} ({f.codigo})</option>)}
        </Select>
        <Select className="filter-select" aria-label="Subfamilia" value={subfamiliaId} onChange={e => setSubfamiliaId(e.target.value)}>
          <option value="">Todas las subfamilias</option>
          {subfamiliasDeLaFamilia.map(s => <option key={s.id} value={s.id}>{s.nombre} ({s.codigo})</option>)}
        </Select>
        {!sinFiltro && (
          <Button variant="ghost" size="sm" onClick={() => setMostrarStock(v => !v)}>
            <Icono n="paquete" /> {mostrarStock ? 'Ocultar stock' : 'Stock'}
          </Button>
        )}
      </div>

      {isError && <p style={{ color: 'var(--danger)' }}>Error al buscar en el catálogo.</p>}
      {!sinFiltro && !isError && (buscando || isFetching) && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}><Icono n="buscar" /> Buscando...</p>}
      {!sinFiltro && !isError && !buscando && !isFetching && enElTope && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          Se muestran los primeros {LIMITE_DE_BUSQUEDA}: afiná la búsqueda (más palabras, familia o subfamilia) para llegar a lo que buscás.
        </p>
      )}

      {sinFiltro && !catalogoVacio && (
        <div className="empty-state">
          <div className="empty-icon"><Icono n="buscar" /></div>
          <h2>Buscá un repuesto</h2>
          <p>Escribí un código, número o descripción, o elegí una familia para ver resultados.</p>
        </div>
      )}

      {(!sinFiltro || catalogoVacio) && !isLoading && !isError && (
        <ResponsiveList
          columns={columns}
          data={filtrados}
          renderCard={renderCard}
          keyField={it => it.id}
          emptyIcon={<Icono n="herramienta" />}
          emptyTitle={catalogoVacio ? 'Todavía no hay repuestos cargados' : 'Sin resultados'}
          emptyDescription={catalogoVacio ? 'Cargá el primer repuesto del depósito.' : 'Probá con otro código, número o filtro.'}
        />
      )}
      {!sinFiltro && isLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}

      {!sinFiltro && !buscando && !isFetching && hayOtraTanda && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, margin: '16px 0 8px' }}>
          <Button variant="ghost" onClick={() => setPedido({ clave: claveDeBusqueda, cantidad: Math.min(pedidos + TANDA, LIMITE_DE_BUSQUEDA) })}>
            <Icono n="abajo" /> Ver {TANDA} más
          </Button>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Mostrando {filtrados.length} · puede haber más</span>
        </div>
      )}
      <BotonSubir />

      <ItemForm open={formOpen} onClose={() => setFormOpen(false)} item={editing} />
      {viewing && (
        <ItemDetail
          item={viewing}
          onClose={() => setViewingId(null)}
          onEdit={() => { setEditing(viewing); setViewingId(null); setFormOpen(true); }}
        />
      )}
    </div>
  );
}
