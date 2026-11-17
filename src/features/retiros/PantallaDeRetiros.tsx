import { clicConTeclado } from '@/lib/clicConTeclado';
import { Fragment, useMemo, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import BotonVerMas from '../../components/BotonVerMas';
import ResponsiveList, { type Column } from '../../components/ResponsiveList';
import type { UsuarioBasico } from '../../lib/nombreUsuario';
import type { RetiroHistorial } from './tipos';
import ExportarPeriodoModal from './ExportarPeriodoModal';
import NuevoMovimientoModal, { type AccionesDeMovimiento, type RepuestoParaMovimiento } from '../ajustes/NuevoMovimientoModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { mensajeDeError } from '@/lib/errores';
import { fechaHoyISO, fechaLocalDe } from '../../lib/fechaHoy';
import { Icono } from '@/components/Icono';

// Un retiro no se corrige ni se borra (lo hace cumplir la base): si algo vuelve al depósito, entra como una carga de stock con este motivo.
const MOTIVO_DEVOLUCION = 'Devolución de un sector';

type Vista = 'tabla' | 'dias';

/** Lo que la pantalla necesita leer: los retiros filtrados (de a páginas) y, para quien ve los de todos, la lista de usuarios. */
export interface DatosDeRetiros {
  retiros: RetiroHistorial[];
  admin: boolean;
  usuarios: UsuarioBasico[];
  isLoading: boolean;
  isError: boolean;
  hayMas: boolean;
  cargandoMas: boolean;
  verMas: () => void;
  buscando: boolean;
}

/** Lo que la pantalla puede hacer. Las exportaciones devuelven cuántos retiros salieron. */
export interface AccionesDeRetiros {
  exportarPendientes: () => Promise<number>;
  exportarPeriodo: (desde: string, hasta: string) => Promise<number>;
}

/** Los filtros que se ven en pantalla. Los guarda quien usa la pantalla, que busca con ellos (el texto, cuando la persona hace una pausa). */
export interface FiltrosDeRetiros { fecha: string; usuario: string; texto: string }

interface Props {
  filtros: FiltrosDeRetiros;
  onFiltros: (f: FiltrosDeRetiros) => void;
  datos: DatosDeRetiros;
  acciones: AccionesDeRetiros;
  /** Para quien puede hacer movimientos de stock: registrar que algo de un retiro volvió al depósito (sin esto, no se ofrece). */
  devolucion?: AccionesDeMovimiento;
}

interface FilaHistorial {
  key: string;
  itemId: string | null;
  fechaHora: string;
  hora: string;
  usuarioNombre: string;
  sector: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  observacion: string;
}

// Lo que se abre al registrar una devolución: el artículo como está ahora y de qué retiro vuelve.
interface Devolucion { repuesto: RepuestoParaMovimiento; referencia: string }

function groupByDay(retiros: RetiroHistorial[]) {
  const groups: Record<string, RetiroHistorial[]> = {};
  for (const r of retiros) {
    const day = fechaLocalDe(r.created_at);
    (groups[day] ??= []).push(r);
  }
  return groups;
}

// Depósito → Retiros: el historial (tabla o por día), con filtros, exportar y registrar devoluciones. Solo dibuja: los datos y las acciones los pone
// cada app (la de Vite con Supabase, la de Next con el servidor).
export default function PantallaDeRetiros({ filtros, onFiltros, datos, acciones, devolucion }: Props) {
  const { fecha: fechaFiltro, usuario: usuarioFiltro, texto: busqueda } = filtros;
  const [vista, setVista] = useState<Vista>('tabla');
  const hoy = fechaHoyISO();
  const [diasAbiertos, setDiasAbiertos] = useState<Set<string>>(() => new Set([hoy]));
  const [retirosAbiertos, setRetirosAbiertos] = useState<Set<string>>(new Set());

  const { retiros, admin, usuarios, isLoading, isError, hayMas, cargandoMas, verMas, buscando } = datos;
  const toast = useToast();
  const [exportarPeriodoOpen, setExportarPeriodoOpen] = useState(false);
  const [devolviendo, setDevolviendo] = useState<Devolucion | null>(null);

  const usuariosPorId = useMemo(() => Object.fromEntries(usuarios.map(u => [u.id, u])), [usuarios]);

  function resumenDeRetiro(r: RetiroHistorial) {
    const u = admin ? usuariosPorId[r.usuario_id] : null;
    const usuarioNombre = u ? (`${u.nombre || ''} ${u.apellido || ''}`.trim() || u.email || '') : '';
    return { usuarioNombre, sector: r.sectores?.nombre ?? '—' };
  }

  function filasDeRetiro(r: RetiroHistorial): FilaHistorial[] {
    const { usuarioNombre, sector } = resumenDeRetiro(r);
    const fecha = new Date(r.created_at);
    const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const fechaHora = fecha.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return r.retiro_items.map(ri => ({
      key: ri.id, itemId: ri.item_id, fechaHora, hora, usuarioNombre, sector,
      codigo: ri.items?.codigo ?? '?', descripcion: ri.items?.descripcion ?? '',
      cantidad: ri.cantidad, observacion: ri.observacion ?? '',
    }));
  }

  // Abre la carga de stock ya armada: el artículo (con su stock de ahora), el motivo y de qué retiro vuelve. La cantidad la escribe quien la recibe.
  async function registrarDevolucion(f: FilaHistorial) {
    if (!devolucion || !f.itemId) return;
    try {
      const ahora = await devolucion.leerRepuesto(f.itemId);
      const quien = f.usuarioNombre ? ` · ${f.usuarioNombre}` : '';
      setDevolviendo({
        repuesto: { id: f.itemId, codigo: f.codigo, descripcion: f.descripcion, stock: ahora.stock, unidad: ahora.unidad },
        referencia: `Retiro del ${f.fechaHora} · ${f.sector}${quien} (salieron ${f.cantidad})`.slice(0, 120),
      });
    } catch (e) {
      toast('No se pudo leer el artículo: ' + mensajeDeError(e), 'error');
    }
  }

  // La búsqueda, la fecha y el usuario los filtra la base: acá llegan ya filtrados.
  const retirosFiltrados = retiros;

  const grupos = useMemo(() => groupByDay(retirosFiltrados), [retirosFiltrados]);

  function toggleDia(day: string) {
    setDiasAbiertos(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day); else next.add(day);
      return next;
    });
  }

  function toggleRetiro(id: string) {
    setRetirosAbiertos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleExportarPendientes() {
    try {
      const cantidad = await acciones.exportarPendientes();
      if (!cantidad) { toast('No hay retiros pendientes de exportar', 'error'); return; }
      toast(`${cantidad} retiro(s) exportado(s) y marcados`, 'success');
    } catch (e) {
      toast('Error al exportar: ' + mensajeDeError(e), 'error');
    }
  }

  const columns: Column<FilaHistorial>[] = [
    { header: 'Hora', render: f => f.hora },
    ...(admin ? [{ header: 'Usuario', render: (f: FilaHistorial) => f.usuarioNombre } as Column<FilaHistorial>] : []),
    { header: 'Sector', render: f => f.sector },
    { header: 'Código', render: f => <strong>{f.codigo}</strong> },
    { header: 'Descripción', render: f => f.descripcion },
    { header: 'Cant.', render: f => f.cantidad },
    { header: 'Observación', render: f => f.observacion || '—' },
    ...(devolucion ? [{
      header: '',
      render: (f: FilaHistorial) => f.itemId && (
        <div className="td-actions" style={{ flexWrap: 'nowrap' }}>
          <Button variant="ghost" size="sm" onClick={() => void registrarDevolucion(f)}><Icono n="devolver" /> Registrar devolución</Button>
        </div>
      ),
    } as Column<FilaHistorial>] : []),
  ];

  function renderCard(f: FilaHistorial) {
    return (
      <div className="prov-card">
        <div className="prov-card-header">
          <div>
            <div className="prov-card-name">{f.codigo}</div>
            <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2 }}>{f.descripcion}</div>
          </div>
          <span className="badge badge-rubro">x{f.cantidad}</span>
        </div>
        <div className="prov-card-body">
          <div className="prov-card-row"><Icono n="reloj" /> {f.hora}{admin && <> — <Icono n="usuario" /> {f.usuarioNombre}</>}</div>
          <div className="prov-card-row"><Icono n="fabrica" /> {f.sector}</div>
          {f.observacion && <div className="prov-card-row"><Icono n="nota" /> {f.observacion}</div>}
        </div>
        {devolucion && f.itemId && (
          <div className="prov-card-actions">
            <Button variant="ghost" size="sm" onClick={() => void registrarDevolucion(f)}><Icono n="devolver" /> Registrar devolución</Button>
          </div>
        )}
      </div>
    );
  }

  function renderRetirosItems(r: RetiroHistorial) {
    return (
      <ResponsiveList
        columns={columns}
        data={filasDeRetiro(r)}
        renderCard={renderCard}
        keyField={f => f.key}
        emptyIcon={<Icono n="lista" />}
        emptyTitle="Sin ítems"
        emptyDescription=""
      />
    );
  }

  function renderVistaTabla() {
    return (
      <>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th><span className="sr-only">Detalle</span></th>
                <th>Fecha</th>
                {admin && <th>Usuario</th>}
                <th>Sector</th>
                <th>Ítems</th>
              </tr>
            </thead>
            <tbody>
              {retirosFiltrados.map(r => {
                const { usuarioNombre, sector } = resumenDeRetiro(r);
                const abierto = retirosAbiertos.has(r.id);
                const fechaHora = new Date(r.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const totalCantidad = r.retiro_items.reduce((s, ri) => s + ri.cantidad, 0);
                return (
                  <Fragment key={r.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => toggleRetiro(r.id)}>
                      <td style={{ width: 28 }}>
                        <button
                          type="button"
                          aria-expanded={abierto}
                          aria-label={abierto ? 'Ocultar el detalle del retiro' : 'Ver el detalle del retiro'}
                          onClick={e => { e.stopPropagation(); toggleRetiro(r.id); }}
                          style={{ display: 'inline-flex', background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', transition: 'transform 0.15s', transform: abierto ? 'rotate(90deg)' : 'none' }}
                        ><Icono n="desplegar" /></button>
                      </td>
                      <td>{fechaHora}</td>
                      {admin && <td>{usuarioNombre}</td>}
                      <td>{sector}</td>
                      <td>{r.retiro_items.length} ítem{r.retiro_items.length !== 1 ? 's' : ''} · {totalCantidad} u.</td>
                    </tr>
                    {abierto && (
                      <tr>
                        <td colSpan={admin ? 5 : 4} style={{ background: 'var(--surface2)', padding: 14 }}>
                          {renderRetirosItems(r)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="prov-cards">
          {retirosFiltrados.map(r => {
            const { usuarioNombre, sector } = resumenDeRetiro(r);
            const abierto = retirosAbiertos.has(r.id);
            const fechaHora = new Date(r.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            const totalCantidad = r.retiro_items.reduce((s, ri) => s + ri.cantidad, 0);
            return (
              <div key={r.id} className="prov-card">
                <div className="prov-card-header" aria-expanded={abierto} {...clicConTeclado(() => toggleRetiro(r.id))} style={{ cursor: 'pointer' }}>
                  <div>
                    <div className="prov-card-name">{fechaHora}{admin ? ` — ${usuarioNombre}` : ''}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2 }}><Icono n="fabrica" /> {sector} · {r.retiro_items.length} ítem{r.retiro_items.length !== 1 ? 's' : ''} · {totalCantidad} u.</div>
                  </div>
                  <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: abierto ? 'rotate(90deg)' : 'none' }}><Icono n="desplegar" /></span>
                </div>
                {abierto && <div style={{ marginTop: 10 }}>{renderRetirosItems(r)}</div>}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  function renderVistaDias() {
    return Object.entries(grupos).map(([day, dayRetiros]) => {
      const itemCount = dayRetiros.reduce((s, r) => s + r.retiro_items.length, 0);
      const isOpen = diasAbiertos.has(day);
      const fechaLabel = new Date(day + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      return (
        <div className="admin-card" style={{ marginBottom: 10, padding: 0, overflow: 'hidden' }} key={day}>
          <button type="button" onClick={() => toggleDia(day)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <div className="admin-card-header" style={{ justifyContent: 'space-between' }}>
              <span><Icono n="fecha" /> {fechaLabel} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({itemCount} ítem{itemCount !== 1 ? 's' : ''})</span></span>
              <span>{isOpen ? <Icono n="arriba" /> : <Icono n="abajo" />}</span>
            </div>
          </button>
          {isOpen && (
            <div className="admin-card-body">
              <ResponsiveList
                columns={columns}
                data={dayRetiros.flatMap(filasDeRetiro)}
                renderCard={renderCard}
                keyField={f => f.key}
                emptyIcon={<Icono n="lista" />}
                emptyTitle="Sin ítems"
                emptyDescription=""
              />
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">{admin ? <><Icono n="lista" /> Historial de retiros</> : <><Icono n="lista" /> Mis retiros</>}</div>
        {admin && (
          <div className="section-actions">
            <Button variant="ghost" size="sm" onClick={() => void handleExportarPendientes()}><Icono n="importar" /> Exportar pendientes</Button>
            <Button variant="ghost" size="sm" onClick={() => setExportarPeriodoOpen(true)}><Icono n="calendario" /> Exportar por período</Button>
          </div>
        )}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
        Un retiro no se corrige ni se borra. {devolucion
          ? <>Si algo vuelve al depósito, tocá <strong>Registrar devolución</strong> en su línea: entra como una carga de stock, con su comprobante.</>
          : <>Si devolvés algo, llevalo al depósito: ahí lo registran como devolución.</>}
      </p>

      <div className="toolbar">
        <div className="search-wrap">
          <Input type="text" placeholder="Buscar por artículo, sector u operario..." value={busqueda} onChange={e => onFiltros({ ...filtros, texto: e.target.value })} />
        </div>
        <Input type="date" aria-label="Fecha" value={fechaFiltro} onChange={e => onFiltros({ ...filtros, fecha: e.target.value })} style={{ maxWidth: 200 }} />
        <Button variant="ghost" size="sm" onClick={() => onFiltros({ ...filtros, fecha: '' })}>Ver últimos 30 días</Button>
        {admin && (
          <Select className="filter-select" aria-label="Filtrar por usuario" value={usuarioFiltro} onChange={e => onFiltros({ ...filtros, usuario: e.target.value })}>
            <option value="">Todos los usuarios</option>
            {[...usuarios].sort((a, b) => (a.nombre || a.email || '').localeCompare(b.nombre || b.email || '')).map(u => (
              <option key={u.id} value={u.id}>{`${u.nombre || ''} ${u.apellido || ''}`.trim() || u.email}</option>
            ))}
          </Select>
        )}
        <Select className="filter-select" aria-label="Forma de ver los retiros" value={vista} onChange={e => setVista(e.target.value as Vista)}>
          <option value="tabla">Vista tabla</option>
          <option value="dias">Vista por día</option>
        </Select>
      </div>

      {isLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {isError && <p style={{ color: 'var(--danger)' }}>Error al cargar el historial.</p>}

      {!isLoading && !isError && !buscando && !retiros.length && !busqueda.trim() && !fechaFiltro && !usuarioFiltro && (
        <div className="empty-state">
          <div className="empty-icon"><Icono n="lista" /></div>
          <h2>Todavía no hay retiros</h2>
          <p>Los que confirmes van a aparecer acá.</p>
        </div>
      )}

      {!isLoading && !isError && !buscando && !retiros.length && (!!busqueda.trim() || !!fechaFiltro || !!usuarioFiltro) && (
        <div className="empty-state">
          <div className="empty-icon"><Icono n="buscar" /></div>
          <h2>Sin resultados</h2>
          <p>Probá con otro código, sector, operario o fecha.</p>
        </div>
      )}
      {!isLoading && !isError && buscando && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}><Icono n="buscar" /> Buscando...</p>}

      {!isLoading && !isError && !!retirosFiltrados.length && (vista === 'tabla' ? renderVistaTabla() : renderVistaDias())}
      {!isLoading && !isError && <BotonVerMas hayMas={hayMas} cargando={cargandoMas} mostrando={retiros.length} onClick={verMas} />}

      <ExportarPeriodoModal open={exportarPeriodoOpen} onClose={() => setExportarPeriodoOpen(false)} exportar={acciones.exportarPeriodo} />

      {devolucion && (
      <NuevoMovimientoModal
        open={!!devolviendo}
        onClose={() => setDevolviendo(null)}
        claseInicial="carga"
        repuestoInicial={devolviendo?.repuesto ?? null}
        motivoInicial={MOTIVO_DEVOLUCION}
        referenciaInicial={devolviendo?.referencia ?? ''}
        acciones={devolucion}
      />
      )}
    </div>
  );
}
