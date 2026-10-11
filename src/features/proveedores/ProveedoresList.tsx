import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { isDirectorioAdmin } from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { exportarExcel } from '../../lib/exportExcel';
import StatsRow from '../../components/StatsRow';
import ResponsiveList, { type Column } from '../../components/ResponsiveList';
import { useDeleteProveedor, useProveedoresQuery, type Proveedor } from './useProveedores';
import ProveedorForm from './ProveedorForm';
import ProveedorDetail from './ProveedorDetail';
import RotuloForm from '../rotulos/RotuloForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { mensajeDeError } from '@/lib/errores';
import { Icono, Punto } from '@/components/Icono';

export default function ProveedoresList() {
  const { profile } = useAuth();
  const admin = isDirectorioAdmin(profile);
  const { data: proveedores, isLoading, isError } = useProveedoresQuery();
  const deleteProveedor = useDeleteProveedor();
  const toast = useToast();
  const confirmar = useConfirm();

  const [search, setSearch] = useState('');
  const [rubroFiltro, setRubroFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<'activo' | '' | 'inactivo'>('activo');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Proveedor | null>(null);
  const [viewing, setViewing] = useState<Proveedor | null>(null);
  const [rotuloProvId, setRotuloProvId] = useState<string | null>(null);

  const rubros = useMemo(
    () => [...new Set((proveedores ?? []).map(p => p.rubro).filter((r): r is string => !!r))].sort(),
    [proveedores]
  );

  const filtrados = useMemo(() => {
    const q = search.toLowerCase();
    return (proveedores ?? []).filter(p => {
      const matchQ = !q || [p.nombre, p.rubro, p.localidad, p.provincia, p.email].some(v => v?.toLowerCase().includes(q));
      const matchR = !rubroFiltro || p.rubro === rubroFiltro;
      const matchE = !estadoFiltro || (estadoFiltro === 'activo' ? p.activo : !p.activo);
      return matchQ && matchR && matchE;
    });
  }, [proveedores, search, rubroFiltro, estadoFiltro]);

  const activos = (proveedores ?? []).filter(p => p.activo).length;

  async function handleDelete(p: Proveedor) {
    if (!(await confirmar(`¿Eliminar a "${p.nombre}"? Queda en la Papelera hasta que se confirme la baja definitiva.`, { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    try {
      await deleteProveedor.mutateAsync(p.id);
      toast('Proveedor eliminado', 'error');
    } catch (e) {
      toast('Error al eliminar: ' + mensajeDeError(e), 'error');
    }
  }

  async function handleExport() {
    if (!proveedores?.length) { toast('Sin datos para exportar', 'error'); return; }
    const rows = proveedores.map(p => ({
      Nombre: p.nombre, Rubro: p.rubro || '', Email: p.email || '',
      Dirección: p.direccion || '', Localidad: p.localidad || '', Provincia: p.provincia || '',
      Horario: p.horario || '', Estado: p.activo ? 'Activo' : 'Inactivo', Notas: p.notas || '',
      'Última modificación': p.updated_at ? new Date(p.updated_at).toLocaleDateString('es-AR') : '',
      'Modificado por': p.modificado_por || '',
      Contactos: p.contactos.map(c => `${c.nombre}${c.cargo ? ' (' + c.cargo + ')' : ''}`).join(' | '),
    }));
    await exportarExcel(rows, 'Proveedores', `proveedores_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast('Excel exportado', 'success');
  }

  const columns: Column<Proveedor>[] = [
    {
      header: 'Proveedor',
      render: p => (
        <>
          <div className="provider-name">{p.nombre}</div>
          {p.email && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.email}</div>}
        </>
      ),
    },
    { header: 'Rubro', render: p => (p.rubro ? <span className="badge badge-rubro">{p.rubro}</span> : '—') },
    { header: 'Localidad', render: p => [p.localidad, p.provincia].filter(Boolean).join(', ') || '—' },
    {
      header: 'Contactos',
      render: p => p.contactos.length === 0
        ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Sin contactos</span>
        : p.contactos.map(c => <span className="contact-chip" key={c.id}><Icono n="usuario" /> {c.nombre}{c.cargo ? ` · ${c.cargo}` : ''}</span>),
    },
    { header: 'Estado', render: p => <span className={`badge ${p.activo ? 'badge-active' : 'badge-inactive'}`}>{p.activo ? <><Punto /> Activo</> : <><Punto hueco /> Inactivo</>}</span> },
    {
      header: 'Modificado',
      render: p => (
        <>
          <div style={{ fontSize: 12 }}>{p.updated_at ? new Date(p.updated_at).toLocaleDateString('es-AR') : '—'}</div>
          <div className="meta-info">por {p.modificado_por || '—'}</div>
        </>
      ),
    },
    {
      header: 'Acciones',
      render: p => (
        <div className="td-actions">
          <Button variant="ghost" size="icon" title="Ver" onClick={() => setViewing(p)}><Icono n="ver" /></Button>
          {admin && <Button variant="ghost" size="icon" title="Editar" onClick={() => { setEditing(p); setFormOpen(true); }}><Icono n="editar" /></Button>}
          <Button variant="ghost" size="icon" title="Rótulo" onClick={() => setRotuloProvId(p.id)}><Icono n="etiqueta" /></Button>
          {admin && <Button variant="dangerGhost" size="icon" title="Eliminar" onClick={() => void handleDelete(p)}><Icono n="borrar" /></Button>}
        </div>
      ),
    },
  ];

  function renderCard(p: Proveedor) {
    const contacto = p.contactos[0];
    return (
      <div className="prov-card">
        <div className="prov-card-header">
          <div>
            <div className="prov-card-name">{p.nombre}</div>
            {p.rubro && <span className="badge badge-rubro" style={{ marginTop: 4, display: 'inline-flex' }}>{p.rubro}</span>}
          </div>
          <span className={`badge ${p.activo ? 'badge-active' : 'badge-inactive'}`}>{p.activo ? <><Punto /> Activo</> : <><Punto hueco /> Inactivo</>}</span>
        </div>
        <div className="prov-card-body">
          {(p.localidad || p.provincia) && <div className="prov-card-row"><Icono n="lugar" /> {[p.localidad, p.provincia].filter(Boolean).join(', ')}</div>}
          {p.horario && <div className="prov-card-row"><Icono n="reloj" /> {p.horario}</div>}
          {contacto && <div className="prov-card-row"><Icono n="usuario" /> {contacto.nombre}{contacto.telefono ? ' — ' + contacto.telefono : ''}{contacto.celular ? ' / ' + contacto.celular : ''}</div>}
        </div>
        <div className="prov-card-actions">
          <Button variant="ghost" size="sm" onClick={() => setViewing(p)}><Icono n="ver" /> Ver</Button>
          {admin && <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setFormOpen(true); }}><Icono n="editar" /> Editar</Button>}
          <Button variant="ghost" size="sm" onClick={() => setRotuloProvId(p.id)}><Icono n="etiqueta" /></Button>
          {admin && <Button variant="dangerGhost" size="sm" onClick={() => void handleDelete(p)}><Icono n="borrar" /></Button>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <StatsRow stats={[
        { icon: <Icono n="fabrica" />, iconColor: 'blue', value: proveedores?.length ?? 0, label: 'Total' },
        { icon: <Icono n="exito" />, iconColor: 'green', value: activos, label: 'Activos' },
        { icon: <Icono n="paquete" />, iconColor: 'red', value: rubros.length, label: 'Rubros' },
      ]} />

      <div className="section-header">
        <div className="section-title"><Icono n="fabrica" /> Proveedores</div>
        <div className="section-actions">
          <Button variant="ghost" size="sm" onClick={() => void handleExport()}>Excel</Button>
          {admin && <Button variant="primary" size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>+ Nuevo</Button>}
        </div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Input type="text" placeholder="Buscar proveedor..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select className="filter-select" value={rubroFiltro} onChange={e => setRubroFiltro(e.target.value)}>
          <option value="">Todos los rubros</option>
          {rubros.map(r => <option key={r} value={r}>{r}</option>)}
        </Select>
        <Select className="filter-select" style={{ minWidth: 130 }} value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value as typeof estadoFiltro)}>
          <option value="activo">Solo activos</option>
          <option value="">Todos</option>
          <option value="inactivo">Inactivos</option>
        </Select>
      </div>

      {isLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {isError && <p style={{ color: 'var(--danger)' }}>Error al cargar proveedores.</p>}

      {!isLoading && !isError && (
        <ResponsiveList
          columns={columns}
          data={filtrados}
          renderCard={renderCard}
          keyField={p => p.id}
          emptyIcon={<Icono n="fabrica" />}
          emptyTitle={proveedores?.length === 0 ? 'Sin proveedores aún' : 'Sin resultados'}
          emptyDescription={proveedores?.length === 0 ? 'Agregá el primer proveedor.' : 'Probá con otro filtro.'}
        />
      )}

      {admin && <ProveedorForm open={formOpen} onClose={() => setFormOpen(false)} proveedor={editing} />}
      {viewing && (
        <ProveedorDetail
          proveedor={viewing}
          onClose={() => setViewing(null)}
          onEdit={admin ? () => { setEditing(viewing); setViewing(null); setFormOpen(true); } : undefined}
          onRotulo={() => { setRotuloProvId(viewing.id); setViewing(null); }}
        />
      )}
      <RotuloForm open={!!rotuloProvId} onClose={() => setRotuloProvId(null)} proveedorId={rotuloProvId} editingId={null} />
    </div>
  );
}
