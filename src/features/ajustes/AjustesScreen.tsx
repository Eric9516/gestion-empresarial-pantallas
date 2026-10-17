import { useMemo, useState } from 'react';
import ResponsiveList, { type Column } from '../../components/ResponsiveList';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useAuth } from '../../auth/AuthContext';
import { isOwner } from '../../lib/types';
import { fechaLocalDe } from '../../lib/fechaHoy';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import BotonVerMas from '../../components/BotonVerMas';
import { comprobanteTexto, formatoCantidad, NOMBRE_DE_LA_CLASE } from '../../lib/ajustes';
import { exportarExcel, type FilaExcel } from '../../lib/exportExcel';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { useAjustesQuery, useAnularAjuste, type Ajuste } from './useAjustes';
import NuevoMovimientoModal from './NuevoMovimientoModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

type Filtro = 'todos' | 'cargas' | 'ajustes' | 'restas' | 'sumas' | 'anulados';

const comprobanteDe = (a: Ajuste) => comprobanteTexto(a.clase, a.punto_venta, a.numero);
const soloDia = (f: string) => f.split('-').reverse().join('/');

const cuando = (ts: string) => new Date(ts).toLocaleString('es-AR');

function totales(a: Ajuste) {
  let sumado = 0, restado = 0;
  for (const l of a.ajuste_items) { if (l.tipo === 'suma') sumado += Number(l.cantidad); else restado += Number(l.cantidad); }
  return { sumado, restado };
}

function Estado({ a }: { a: Ajuste }) {
  const anulado = a.anulado;
  return (
    <span style={{ display: 'inline-flex', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap', background: anulado ? 'var(--danger-bg)' : 'var(--success-bg)', color: anulado ? 'var(--danger)' : 'var(--success)' }}>
      {anulado ? 'Anulado' : 'Vigente'}
    </span>
  );
}

function Movimiento({ a }: { a: Ajuste }) {
  const t = totales(a);
  return (
    <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontWeight: 700, opacity: a.anulado ? 0.55 : 1 }}>
      {t.sumado > 0 && <span style={{ color: 'var(--success)' }}><Icono n="mas" /> {formatoCantidad(t.sumado)}</span>}
      {t.restado > 0 && <span style={{ color: 'var(--danger)' }}><Icono n="menos" /> {formatoCantidad(t.restado)}</span>}
    </span>
  );
}

function resumenArticulos(a: Ajuste) {
  const [primera, ...resto] = a.ajuste_items;
  if (!primera) return <>—</>;
  const detalle = a.ajuste_items.map(l => `${l.items?.codigo} — ${l.items?.descripcion}`).join('\n');
  return (
    <span title={detalle} style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 280 }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><strong>{primera.items?.codigo}</strong> — {primera.items?.descripcion}</span>
      {resto.length > 0 && <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#eaf0fb', color: 'var(--blue)', whiteSpace: 'nowrap' }}>+{resto.length} más</span>}
    </span>
  );
}

function DetalleAjuste({ ajuste, onClose, onAnular, puedeAnular }: { ajuste: Ajuste | null; onClose: () => void; onAnular: (a: Ajuste) => void; puedeAnular: boolean }) {
  return (
    <Modal open={!!ajuste} onClose={onClose} large title={<><Icono n="balanza" /> {ajuste ? comprobanteDe(ajuste) : 'Detalle'}</>} footer={
      <>
        {ajuste && !ajuste.anulado && puedeAnular && <Button variant="dangerGhost" onClick={() => onAnular(ajuste)}>Anular este comprobante</Button>}
        <Button variant="ghost" onClick={onClose}>Cerrar</Button>
      </>
    }>
      {ajuste && (
        <div>
          <div style={{ fontSize: 13, display: 'grid', gap: 4, marginBottom: 12 }}>
            <div><strong>Tipo:</strong> {NOMBRE_DE_LA_CLASE[ajuste.clase]} <span style={{ color: 'var(--text-muted)' }}>({comprobanteDe(ajuste)})</span></div>
            <div><strong>Fecha:</strong> {soloDia(ajuste.fecha)} <span style={{ color: 'var(--text-muted)' }}>(registrado el {cuando(ajuste.created_at)})</span></div>
            <div><strong>Lo hizo:</strong> {ajuste.usuarioNombre}</div>
            <div><strong>Motivo:</strong> {ajuste.motivo}</div>
            {ajuste.referencia && <div><strong>Referencia:</strong> {ajuste.referencia}</div>}
            {ajuste.observaciones && <div><strong>Observaciones:</strong> {ajuste.observaciones}</div>}
            <div><strong>Estado:</strong> <Estado a={ajuste} /></div>
            {ajuste.anulado && (
              <div style={{ padding: '8px 10px', background: 'var(--danger-bg)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)' }}>
                Anulado por <strong>{ajuste.anuladoPorNombre}</strong> el {ajuste.anulado_at ? cuando(ajuste.anulado_at) : ''}. Motivo: {ajuste.motivo_anulacion}. El stock volvió a como estaba antes de este comprobante.
              </div>
            )}
          </div>
          <div className="table-wrap" style={{ display: 'block' }}>
            <table>
              <thead><tr><th>Artículo</th><th>UM</th><th>Movimiento</th><th>Stock</th></tr></thead>
              <tbody>
                {ajuste.ajuste_items.map(l => (
                  <tr key={l.id}>
                    <td><strong>{l.items?.codigo}</strong> — {l.items?.descripcion}</td>
                    <td>{l.items?.unidad ?? 'Uni'}</td>
                    <td style={{ fontWeight: 700, color: l.tipo === 'suma' ? 'var(--success)' : 'var(--danger)', whiteSpace: 'nowrap' }}>{l.tipo === 'suma' ? <><Icono n="mas" /> Suma</> : <><Icono n="menos" /> Resta</>} {formatoCantidad(l.cantidad)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatoCantidad(l.stock_antes)} → {formatoCantidad(l.stock_despues)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

function AnularModal({ ajuste, onClose }: { ajuste: Ajuste | null; onClose: () => void }) {
  const anular = useAnularAjuste();
  const toast = useToast();
  const [motivo, setMotivo] = useState('');

  function cerrar() { setMotivo(''); onClose(); }

  async function confirmar() {
    if (!ajuste) return;
    if (!motivo.trim()) { toast('Indicá el motivo de la anulación', 'error'); return; }
    try {
      await anular.mutateAsync({ id: ajuste.id, motivo: motivo.trim() });
      toast('Comprobante anulado: el stock volvió a como estaba', 'success');
      cerrar();
    } catch (err) {
      await registrarErrorAccion('Error al anular un ajuste de inventario', err);
      toast('No se pudo anular: ' + mensajeDeError(err), 'error');
    }
  }

  return (
    <Modal open={!!ajuste} onClose={cerrar} title={ajuste ? `Anular ${comprobanteDe(ajuste)}` : 'Anular'} footer={
      <>
        <Button variant="ghost" onClick={cerrar}>Cancelar</Button>
        <Button variant="red" disabled={anular.isPending} onClick={() => void confirmar()}>{anular.isPending ? 'Anulando...' : 'Sí, anular'}</Button>
      </>
    }>
      {ajuste && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 12 }}>
            El comprobante {comprobanteDe(ajuste)} del {cuando(ajuste.created_at)} ({ajuste.motivo}) se anula: el stock de sus {ajuste.ajuste_items.length} artículo{ajuste.ajuste_items.length === 1 ? '' : 's'} vuelve a como estaba antes.
            El comprobante <strong>no se borra</strong>: queda en la lista marcado como anulado, con tu nombre y este motivo.
          </p>
          <div className="form-group full">
            <label htmlFor="anular-motivo">Motivo de la anulación (obligatorio)</label>
            <Textarea id="anular-motivo" rows={2} maxLength={500} placeholder="Ej: cargué mal las cantidades" value={motivo} onChange={e => setMotivo(e.target.value)} />
          </div>
        </>
      )}
    </Modal>
  );
}

export default function AjustesScreen() {
  const { profile } = useAuth();
  const toast = useToast();
  const puedeAnular = isOwner(profile);

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [anulando, setAnulando] = useState<Ajuste | null>(null);

  // La búsqueda, el tipo y las fechas los filtra la base (de a páginas): acá llegan ya filtrados.
  const busquedaConPausa = useDebouncedValue(busqueda, 300);
  const { ajustes, isLoading, isError, hayMas, cargandoMas, verMas, buscando } = useAjustesQuery({ texto: busquedaConPausa, filtro, desde, hasta });
  const detalle = useMemo(() => (ajustes ?? []).find(a => a.id === detalleId) ?? null, [ajustes, detalleId]);

  const filas = ajustes;

  // Lo que importa del control: cuánto salió sin anotarse (restas vigentes) en lo que se está viendo.
  const resumen = useMemo(() => {
    let restado = 0, sumado = 0;
    for (const a of filas) if (!a.anulado) { const t = totales(a); restado += t.restado; sumado += t.sumado; }
    return { restado, sumado, vigentes: filas.filter(a => !a.anulado).length };
  }, [filas]);

  async function exportar() {
    if (!filas.length) { toast('No hay movimientos para exportar con esos filtros', 'error'); return; }
    const rows: FilaExcel[] = filas.flatMap(a => a.ajuste_items.map(l => ({
      Comprobante: comprobanteDe(a),
      Tipo: NOMBRE_DE_LA_CLASE[a.clase],
      Fecha: soloDia(a.fecha),
      Registrado: cuando(a.created_at),
      'Lo hizo': a.usuarioNombre,
      Motivo: a.motivo,
      Referencia: a.referencia ?? '',
      Observaciones: a.observaciones ?? '',
      Código: l.items?.codigo ?? '',
      Descripción: l.items?.descripcion ?? '',
      UM: l.items?.unidad ?? '',
      Movimiento: l.tipo === 'suma' ? 'Suma' : 'Resta',
      Cantidad: Number(l.cantidad),
      'Stock antes': l.stock_antes === null ? '' : Number(l.stock_antes),
      'Stock después': l.stock_despues === null ? '' : Number(l.stock_despues),
      Estado: a.anulado ? 'Anulado' : 'Vigente',
      'Anulado por': a.anuladoPorNombre ?? '',
      'Fecha de anulación': a.anulado_at ? cuando(a.anulado_at) : '',
      'Motivo de la anulación': a.motivo_anulacion ?? '',
    })));
    await exportarExcel(rows, 'Movimientos', `movimientos_de_stock_${fechaLocalDe(new Date().toISOString())}.xlsx`);
    toast('Excel exportado', 'success');
  }

  const columns: Column<Ajuste>[] = [
    { header: 'Comprobante', render: a => <strong style={{ whiteSpace: 'nowrap' }}>{comprobanteDe(a)}</strong> },
    { header: 'Fecha', render: a => soloDia(a.fecha) },
    { header: 'Lo hizo', render: a => a.usuarioNombre },
    { header: 'Motivo', render: a => a.motivo },
    { header: 'Artículos', render: a => resumenArticulos(a) },
    { header: 'Movimiento', render: a => <Movimiento a={a} /> },
    { header: 'Estado', render: a => <Estado a={a} /> },
    {
      header: '', render: a => (
        <div className="td-actions">
          <Button variant="primary" size="sm" onClick={() => setDetalleId(a.id)}>Ver</Button>
          {puedeAnular && !a.anulado && <Button variant="dangerGhost" size="sm" onClick={() => setAnulando(a)}>Anular</Button>}
        </div>
      ),
    },
  ];

  function renderCard(a: Ajuste) {
    return (
      <div className="prov-card">
        <div className="prov-card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span className="prov-card-name">{comprobanteDe(a)} · {a.motivo}</span>
            <Estado a={a} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{soloDia(a.fecha)} · {a.usuarioNombre}</div>
        </div>
        <div className="prov-card-body">
          <div className="prov-card-row">{resumenArticulos(a)}</div>
          <div className="prov-card-row"><Movimiento a={a} /></div>
        </div>
        <div className="prov-card-actions">
          <Button variant="primary" size="sm" onClick={() => setDetalleId(a.id)}>Ver</Button>
          {puedeAnular && !a.anulado && <Button variant="dangerGhost" size="sm" onClick={() => setAnulando(a)}>Anular</Button>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title"><Icono n="balanza" /> Movimientos de stock</div>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 12 }}>
        Acá se carga y se corrige el stock: una <strong>carga</strong> hace entrar mercadería, un <strong>ajuste</strong> suma o resta lo que no se anotó. Cada uno es un comprobante con su número. Todo queda registrado y no se puede borrar{puedeAnular ? '; vos podés anular un comprobante si hubo un error' : '; solo un dueño puede anular un comprobante si hubo un error'}.
      </p>

      <div className="toolbar">
        <div className="search-wrap">
          <Input type="text" placeholder="Número, artículo, motivo o quién lo hizo..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <Select className="filter-select" aria-label="Filtrar movimientos" value={filtro} onChange={e => setFiltro(e.target.value as Filtro)}>
          <option value="todos">Todos</option>
          <option value="cargas">Cargas de stock</option>
          <option value="ajustes">Ajustes</option>
          <option value="restas">Con restas (salió sin anotar)</option>
          <option value="sumas">Con sumas</option>
          <option value="anulados">Anulados</option>
        </Select>
        <Input type="date" aria-label="Desde" title="Desde" value={desde} onChange={e => setDesde(e.target.value)} style={{ width: 150 }} />
        <Input type="date" aria-label="Hasta" title="Hasta" value={hasta} onChange={e => setHasta(e.target.value)} style={{ width: 150 }} />
        <Button variant="ghost" size="sm" onClick={() => void exportar()}>Excel</Button>
        <Button variant="primary" size="sm" onClick={() => setNuevoOpen(true)}>+ Nuevo movimiento</Button>
      </div>

      {!isLoading && !isError && filas.length > 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: '8px 0 12px' }}>
          En lo que ves ({resumen.vigentes} comprobante{resumen.vigentes === 1 ? '' : 's'} vigente{resumen.vigentes === 1 ? '' : 's'}):
          {' '}<strong style={{ color: 'var(--danger)' }}><Icono n="menos" /> {formatoCantidad(resumen.restado)} unidades restadas</strong>
          {' · '}<strong style={{ color: 'var(--success)' }}><Icono n="mas" /> {formatoCantidad(resumen.sumado)} sumadas</strong>. Los anulados no se cuentan.
        </p>
      )}

      {isLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {isError && <p style={{ color: 'var(--danger)' }}>Error al cargar los ajustes.</p>}
      {!isLoading && !isError && buscando && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}><Icono n="buscar" /> Buscando...</p>}
      {!isLoading && !isError && (
        <ResponsiveList
          columns={columns}
          data={filas}
          renderCard={renderCard}
          keyField={a => a.id}
          emptyIcon={<Icono n="balanza" />}
          emptyTitle="No hay movimientos"
          emptyDescription={busqueda.trim() || desde || hasta || filtro !== 'todos' ? 'Probá con otros filtros o con otra búsqueda.' : 'Todavía no se cargó ni se ajustó stock.'}
        />
      )}
      {!isLoading && !isError && <BotonVerMas hayMas={hayMas} cargando={cargandoMas} mostrando={filas.length} onClick={verMas} />}

      <NuevoMovimientoModal open={nuevoOpen} onClose={() => setNuevoOpen(false)} />
      <DetalleAjuste ajuste={detalle} onClose={() => setDetalleId(null)} onAnular={a => { setDetalleId(null); setAnulando(a); }} puedeAnular={puedeAnular} />
      <AnularModal ajuste={anulando} onClose={() => setAnulando(null)} />
    </div>
  );
}
