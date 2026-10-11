import { clicConTeclado } from '@/lib/clicConTeclado';
import { Fragment, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import Modal from '../../components/Modal';
import Tooltip from '../../components/Tooltip';
import ResponsiveList, { type Column } from '../../components/ResponsiveList';
import {
  useDeleteHistorialItem, useExportarRetirosPendientes, useHistorialRetirosQuery, useUpdateHistorialCantidad, type RetiroHistorial,
} from './useRetiros';
import ExportarPeriodoModal from './ExportarPeriodoModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { mensajeDeError } from '@/lib/errores';
import { fechaHoyISO, fechaLocalDe } from '../../lib/fechaHoy';
import { Icono, Punto } from '@/components/Icono';

const VENTANA_DEVOLUCION_MS = 24 * 60 * 60 * 1000;

const TEXTO_ESTADO = {
  Abierto: 'Podés devolver hasta 24h después del retiro',
  Cerrado: 'Ya pasaron las 24h — para devolver, pedile a un admin',
} as const;

function EstadoBadge({ estado }: { estado: 'Abierto' | 'Cerrado' }) {
  return (
    <Tooltip text={TEXTO_ESTADO[estado]}>
      <span className={`badge ${estado === 'Abierto' ? 'badge-active' : 'badge-inactive'}`}>{estado === 'Abierto' ? <><Punto color="var(--success)" /> Abierto</> : <><Icono n="candado" /> Cerrado</>}</span>
    </Tooltip>
  );
}

type Vista = 'tabla' | 'dias';

interface FilaHistorial {
  key: string;
  retiroItemId: string;
  retiroId: string;
  hora: string;
  usuarioNombre: string;
  sector: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  observacion: string;
  canEdit: boolean;
  estado: 'Abierto' | 'Cerrado';
}

function groupByDay(retiros: RetiroHistorial[]) {
  const groups: Record<string, RetiroHistorial[]> = {};
  for (const r of retiros) {
    const day = fechaLocalDe(r.created_at);
    (groups[day] ??= []).push(r);
  }
  return groups;
}

export default function HistorialRetiros() {
  const { profile } = useAuth();
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [usuarioFiltro, setUsuarioFiltro] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState<Vista>('tabla');
  const hoy = fechaHoyISO();
  const [diasAbiertos, setDiasAbiertos] = useState<Set<string>>(() => new Set([hoy]));
  const [retirosAbiertos, setRetirosAbiertos] = useState<Set<string>>(new Set());

  const { retiros, admin, usuarios, isLoading, isError } = useHistorialRetirosQuery(fechaFiltro, usuarioFiltro);
  const updateCantidad = useUpdateHistorialCantidad();
  const deleteItemMut = useDeleteHistorialItem();
  const exportarPendientes = useExportarRetirosPendientes();
  const toast = useToast();
  const confirmar = useConfirm();
  const [exportarPeriodoOpen, setExportarPeriodoOpen] = useState(false);
  const [devolviendo, setDevolviendo] = useState<FilaHistorial | null>(null);
  const [devolverInput, setDevolverInput] = useState('1');

  const usuariosPorId = useMemo(() => Object.fromEntries(usuarios.map(u => [u.id, u])), [usuarios]);

  function resumenDeRetiro(r: RetiroHistorial) {
    const u = admin ? usuariosPorId[r.usuario_id] : null;
    const usuarioNombre = u ? (`${u.nombre || ''} ${u.apellido || ''}`.trim() || u.email || '') : '';
    const dentroDe24h = Date.now() - new Date(r.created_at).getTime() < VENTANA_DEVOLUCION_MS;
    const canEdit = admin || (r.usuario_id === profile?.id && dentroDe24h);
    const estado: 'Abierto' | 'Cerrado' = dentroDe24h ? 'Abierto' : 'Cerrado';
    return { usuarioNombre, sector: r.sectores?.nombre ?? '—', canEdit, estado };
  }

  function filasDeRetiro(r: RetiroHistorial): FilaHistorial[] {
    const { usuarioNombre, sector, canEdit, estado } = resumenDeRetiro(r);
    const hora = new Date(r.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    return r.retiro_items.map(ri => ({
      key: ri.id, retiroItemId: ri.id, retiroId: r.id, hora, usuarioNombre, sector,
      codigo: ri.items?.codigo ?? '?', descripcion: ri.items?.descripcion ?? '',
      cantidad: ri.cantidad, observacion: ri.observacion ?? '', canEdit, estado,
    }));
  }

  const retirosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return retiros;
    return retiros.filter(r => {
      const { usuarioNombre, sector } = resumenDeRetiro(r);
      const matchUsuario = usuarioNombre.toLowerCase().includes(q);
      const matchSector = sector.toLowerCase().includes(q);
      const matchItem = r.retiro_items.some(ri => [ri.items?.codigo, ri.items?.descripcion].some(v => v?.toLowerCase().includes(q)));
      return matchUsuario || matchSector || matchItem;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retiros, busqueda, admin, usuariosPorId]);

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

  function abrirDevolver(f: FilaHistorial) {
    setDevolviendo(f);
    setDevolverInput('1');
  }

  async function confirmarDevolucion() {
    if (!devolviendo) return;
    const n = parseInt(devolverInput, 10);
    if (!(n > 0) || n > devolviendo.cantidad) { toast('Ingresá una cantidad entre 1 y ' + devolviendo.cantidad, 'error'); return; }
    try {
      if (n === devolviendo.cantidad) {
        await deleteItemMut.mutateAsync({ retiroItemId: devolviendo.retiroItemId, retiroId: devolviendo.retiroId });
      } else {
        await updateCantidad.mutateAsync({ id: devolviendo.retiroItemId, cantidad: devolviendo.cantidad - n });
      }
      toast(`Devolviste ${n} unidad(es) de ${devolviendo.codigo}`, 'success');
      setDevolviendo(null);
    } catch (e) {
      toast('Error al registrar la devolución: ' + mensajeDeError(e), 'error');
    }
  }

  async function handleDelete(retiroItemId: string, retiroId: string) {
    if (!(await confirmar('¿Eliminar este ítem del retiro?', { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    try {
      await deleteItemMut.mutateAsync({ retiroItemId, retiroId });
      toast('Ítem eliminado', 'success');
    } catch (e) { toast('Error al eliminar: ' + mensajeDeError(e), 'error'); }
  }

  async function handleExportarPendientes() {
    try {
      const cantidad = await exportarPendientes.mutateAsync();
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
    { header: 'Estado', render: f => <EstadoBadge estado={f.estado} /> },
    {
      header: '',
      render: f => f.canEdit && (
        <div className="td-actions" style={{ flexWrap: 'nowrap' }}>
          <Button variant="ghost" size="sm" title="Devolver" onClick={() => abrirDevolver(f)}><Icono n="devolver" /> Devolver</Button>
          <Button variant="dangerGhost" size="icon" title="Eliminar" onClick={() => void handleDelete(f.retiroItemId, f.retiroId)}><Icono n="cerrar" /></Button>
        </div>
      ),
    },
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
          <div className="prov-card-row">
            <EstadoBadge estado={f.estado} />
          </div>
        </div>
        {f.canEdit && (
          <div className="prov-card-actions">
            <Button variant="ghost" size="sm" onClick={() => abrirDevolver(f)}><Icono n="devolver" /> Devolver</Button>
            <Button variant="dangerGhost" size="sm" onClick={() => void handleDelete(f.retiroItemId, f.retiroId)}><Icono n="borrar" /> Eliminar</Button>
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
                <th></th>
                <th>Fecha</th>
                {admin && <th>Usuario</th>}
                <th>Sector</th>
                <th>Ítems</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {retirosFiltrados.map(r => {
                const { usuarioNombre, sector, estado } = resumenDeRetiro(r);
                const abierto = retirosAbiertos.has(r.id);
                const fechaHora = new Date(r.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const totalCantidad = r.retiro_items.reduce((s, ri) => s + ri.cantidad, 0);
                return (
                  <Fragment key={r.id}>
                    <tr style={{ cursor: 'pointer' }} aria-expanded={abierto} {...clicConTeclado(() => toggleRetiro(r.id), null)}>
                      <td style={{ width: 28 }}>
                        <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: abierto ? 'rotate(90deg)' : 'none' }}><Icono n="desplegar" /></span>
                      </td>
                      <td>{fechaHora}</td>
                      {admin && <td>{usuarioNombre}</td>}
                      <td>{sector}</td>
                      <td>{r.retiro_items.length} ítem{r.retiro_items.length !== 1 ? 's' : ''} · {totalCantidad} u.</td>
                      <td><EstadoBadge estado={estado} /></td>
                    </tr>
                    {abierto && (
                      <tr>
                        <td colSpan={admin ? 6 : 5} style={{ background: 'var(--surface2)', padding: 14 }}>
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
            const { usuarioNombre, sector, estado } = resumenDeRetiro(r);
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
                <div className="prov-card-body">
                  <EstadoBadge estado={estado} />
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

      <div className="toolbar">
        <div className="search-wrap">
          <Input type="text" placeholder="Buscar por repuesto, sector u operario..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <Input type="date" value={fechaFiltro} onChange={e => setFechaFiltro(e.target.value)} style={{ maxWidth: 200 }} />
        <Button variant="ghost" size="sm" onClick={() => setFechaFiltro('')}>Ver últimos 30 días</Button>
        {admin && (
          <Select className="filter-select" value={usuarioFiltro} onChange={e => setUsuarioFiltro(e.target.value)}>
            <option value="">Todos los usuarios</option>
            {[...usuarios].sort((a, b) => (a.nombre || a.email || '').localeCompare(b.nombre || b.email || '')).map(u => (
              <option key={u.id} value={u.id}>{`${u.nombre || ''} ${u.apellido || ''}`.trim() || u.email}</option>
            ))}
          </Select>
        )}
        <Select className="filter-select" value={vista} onChange={e => setVista(e.target.value as Vista)}>
          <option value="tabla">Vista tabla</option>
          <option value="dias">Vista por día</option>
        </Select>
      </div>

      {isLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {isError && <p style={{ color: 'var(--danger)' }}>Error al cargar el historial.</p>}

      {!isLoading && !isError && !retiros.length && (
        <div className="empty-state">
          <div className="empty-icon"><Icono n="lista" /></div>
          <h3>Todavía no hay retiros</h3>
          <p>Los que confirmes van a aparecer acá.</p>
        </div>
      )}

      {!isLoading && !isError && !!retiros.length && !retirosFiltrados.length && (
        <div className="empty-state">
          <div className="empty-icon"><Icono n="buscar" /></div>
          <h3>Sin resultados</h3>
          <p>Probá con otro código, sector u operario.</p>
        </div>
      )}

      {!isLoading && !isError && !!retirosFiltrados.length && (vista === 'tabla' ? renderVistaTabla() : renderVistaDias())}

      <ExportarPeriodoModal open={exportarPeriodoOpen} onClose={() => setExportarPeriodoOpen(false)} />

      <Modal
        open={!!devolviendo}
        onClose={() => setDevolviendo(null)}
        title={<><Icono n="devolver" /> Devolver "{devolviendo?.codigo}"</>}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDevolviendo(null)}>Cancelar</Button>
            <Button variant="success" onClick={() => void confirmarDevolucion()}>Confirmar devolución</Button>
          </>
        }
      >
        <div className="form-group full">
          <label htmlFor="historial-retiros-1">¿Cuántos devolvés? (retiraste {devolviendo?.cantidad})</label>
          <Input id="historial-retiros-1" type="number" min={1} max={devolviendo?.cantidad} value={devolverInput} onChange={e => setDevolverInput(e.target.value)} data-autofocus />
        </div>
      </Modal>
    </div>
  );
}
