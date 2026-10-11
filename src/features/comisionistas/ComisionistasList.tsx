import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { isDirectorioAdmin } from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { exportarExcel } from '../../lib/exportExcel';
import StatsRow from '../../components/StatsRow';
import ResponsiveList, { type Column } from '../../components/ResponsiveList';
import { useCamposCustomQuery } from '../config/useCamposCustom';
import { useComisionistasQuery, useDeleteComisionista, type Comisionista } from './useComisionistas';
import ComisionistaForm from './ComisionistaForm';
import ComisionistaDetail from './ComisionistaDetail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { mensajeDeError } from '@/lib/errores';
import { Icono, Punto } from '@/components/Icono';

export default function ComisionistasList() {
  const { profile } = useAuth();
  const admin = isDirectorioAdmin(profile);
  const { data: comisionistas, isLoading, isError } = useComisionistasQuery();
  const { data: camposCustom } = useCamposCustomQuery();
  const deleteComisionista = useDeleteComisionista();
  const toast = useToast();
  const confirmar = useConfirm();

  const [search, setSearch] = useState('');
  const [zonaFiltro, setZonaFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<'activo' | '' | 'inactivo'>('activo');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Comisionista | null>(null);
  const [viewing, setViewing] = useState<Comisionista | null>(null);

  const zonas = useMemo(
    () => [...new Set((comisionistas ?? []).map(c => c.zona).filter((z): z is string => !!z))].sort(),
    [comisionistas]
  );

  const filtrados = useMemo(() => {
    const q = search.toLowerCase();
    return (comisionistas ?? []).filter(c => {
      const matchQ = !q || [c.nombre, c.zona, c.localidad, c.provincia, c.empresa, c.email].some(v => v?.toLowerCase().includes(q));
      const matchZ = !zonaFiltro || c.zona === zonaFiltro;
      const matchE = !estadoFiltro || (estadoFiltro === 'activo' ? c.activo : !c.activo);
      return matchQ && matchZ && matchE;
    });
  }, [comisionistas, search, zonaFiltro, estadoFiltro]);

  const activos = (comisionistas ?? []).filter(c => c.activo).length;

  async function handleDelete(c: Comisionista) {
    if (!(await confirmar(`¿Eliminar a "${c.nombre}"? Esta acción no se puede deshacer.`, { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    try {
      await deleteComisionista.mutateAsync(c.id);
      toast('Comisionista eliminado', 'error');
    } catch (e) {
      toast('Error al eliminar: ' + mensajeDeError(e), 'error');
    }
  }

  async function handleExport() {
    if (!comisionistas?.length) { toast('Sin datos para exportar', 'error'); return; }
    const rows = comisionistas.map(c => {
      const camposExtra = (c.campos_extra as Record<string, string> | null) ?? {};
      const base: Record<string, string> = {
        Nombre: c.nombre, Zona: c.zona || '', Empresa: c.empresa || '',
        Teléfono: c.telefono || '', Celular: c.celular || '', Email: c.email || '',
        Localidad: c.localidad || '', Provincia: c.provincia || '',
        Estado: c.activo ? 'Activo' : 'Inactivo', Notas: c.notas || '',
        'Última modificación': c.updated_at ? new Date(c.updated_at).toLocaleDateString('es-AR') : '',
        'Modificado por': c.modificado_por || '',
      };
      (camposCustom ?? []).forEach(campo => { base[campo.label] = camposExtra[campo.id] || ''; });
      return base;
    });
    await exportarExcel(rows, 'Comisionistas', `comisionistas_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast('Excel exportado', 'success');
  }

  const columns: Column<Comisionista>[] = [
    {
      header: 'Comisionista',
      render: c => (
        <>
          <div className="provider-name">{c.nombre}</div>
          {c.empresa && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.empresa}</div>}
        </>
      ),
    },
    { header: 'Zona', render: c => (c.zona ? <span className="badge badge-rubro">{c.zona}</span> : '—') },
    { header: 'Localidad', render: c => [c.localidad, c.provincia].filter(Boolean).join(', ') || '—' },
    {
      header: 'Contacto',
      render: c => (
        <>
          {c.telefono && <div style={{ fontSize: 12 }}><Icono n="telefono" /> {c.telefono}</div>}
          {c.celular && <div style={{ fontSize: 12 }}><Icono n="celular" /> {c.celular}</div>}
          {!c.telefono && !c.celular && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
        </>
      ),
    },
    { header: 'Estado', render: c => <span className={`badge ${c.activo ? 'badge-active' : 'badge-inactive'}`}>{c.activo ? <><Punto /> Activo</> : <><Punto hueco /> Inactivo</>}</span> },
    {
      header: 'Modificado',
      render: c => (
        <>
          <div style={{ fontSize: 12 }}>{c.updated_at ? new Date(c.updated_at).toLocaleDateString('es-AR') : '—'}</div>
          <div className="meta-info">por {c.modificado_por || '—'}</div>
        </>
      ),
    },
    {
      header: 'Acciones',
      render: c => (
        <div className="td-actions">
          <Button variant="ghost" size="icon" title="Ver" onClick={() => setViewing(c)}><Icono n="ver" /></Button>
          {admin && <Button variant="ghost" size="icon" title="Editar" onClick={() => { setEditing(c); setFormOpen(true); }}><Icono n="editar" /></Button>}
          {admin && <Button variant="dangerGhost" size="icon" title="Eliminar" onClick={() => void handleDelete(c)}><Icono n="borrar" /></Button>}
        </div>
      ),
    },
  ];

  function renderCard(c: Comisionista) {
    return (
      <div className="prov-card">
        <div className="prov-card-header">
          <div>
            <div className="prov-card-name">{c.nombre}</div>
            {c.zona && <span className="badge badge-rubro" style={{ marginTop: 4, display: 'inline-flex' }}>{c.zona}</span>}
          </div>
          <span className={`badge ${c.activo ? 'badge-active' : 'badge-inactive'}`}>{c.activo ? <><Punto /> Activo</> : <><Punto hueco /> Inactivo</>}</span>
        </div>
        <div className="prov-card-body">
          {c.empresa && <div className="prov-card-row"><Icono n="empresa" /> {c.empresa}</div>}
          {(c.localidad || c.provincia) && <div className="prov-card-row"><Icono n="lugar" /> {[c.localidad, c.provincia].filter(Boolean).join(', ')}</div>}
          {c.telefono && <div className="prov-card-row"><Icono n="telefono" /> {c.telefono}</div>}
          {c.celular && <div className="prov-card-row"><Icono n="celular" /> {c.celular}</div>}
        </div>
        <div className="prov-card-actions">
          <Button variant="ghost" size="sm" onClick={() => setViewing(c)}><Icono n="ver" /> Ver</Button>
          {admin && <Button variant="ghost" size="sm" onClick={() => { setEditing(c); setFormOpen(true); }}><Icono n="editar" /> Editar</Button>}
          {admin && <Button variant="dangerGhost" size="sm" onClick={() => void handleDelete(c)}><Icono n="borrar" /></Button>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <StatsRow stats={[
        { icon: <Icono n="acuerdo" />, iconColor: 'blue', value: comisionistas?.length ?? 0, label: 'Total' },
        { icon: <Icono n="exito" />, iconColor: 'green', value: activos, label: 'Activos' },
        { icon: <Icono n="lugar" />, iconColor: 'red', value: zonas.length, label: 'Zonas' },
      ]} />

      <div className="section-header">
        <div className="section-title"><Icono n="acuerdo" /> Comisionistas</div>
        <div className="section-actions">
          <Button variant="ghost" size="sm" onClick={() => void handleExport()}>Excel</Button>
          {admin && <Button variant="primary" size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>+ Nuevo</Button>}
        </div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Input type="text" placeholder="Buscar comisionista..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select className="filter-select" value={zonaFiltro} onChange={e => setZonaFiltro(e.target.value)}>
          <option value="">Todas las zonas</option>
          {zonas.map(z => <option key={z} value={z}>{z}</option>)}
        </Select>
        <Select className="filter-select" style={{ minWidth: 130 }} value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value as typeof estadoFiltro)}>
          <option value="activo">Solo activos</option>
          <option value="">Todos</option>
          <option value="inactivo">Inactivos</option>
        </Select>
      </div>

      {isLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {isError && <p style={{ color: 'var(--danger)' }}>Error al cargar comisionistas.</p>}

      {!isLoading && !isError && (
        <ResponsiveList
          columns={columns}
          data={filtrados}
          renderCard={renderCard}
          keyField={c => c.id}
          emptyIcon={<Icono n="acuerdo" />}
          emptyTitle={comisionistas?.length === 0 ? 'Sin comisionistas aún' : 'Sin resultados'}
          emptyDescription={comisionistas?.length === 0 ? 'Agregá el primer comisionista.' : 'Probá con otro filtro.'}
        />
      )}

      {admin && <ComisionistaForm open={formOpen} onClose={() => setFormOpen(false)} comisionista={editing} />}
      {viewing && (
        <ComisionistaDetail
          comisionista={viewing}
          onClose={() => setViewing(null)}
          onEdit={admin ? () => { setEditing(viewing); setViewing(null); setFormOpen(true); } : undefined}
        />
      )}
    </div>
  );
}
