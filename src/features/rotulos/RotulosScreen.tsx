import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { registrarErrorAccion } from '../../lib/errorLogging';
import ResponsiveList, { type Column } from '../../components/ResponsiveList';
import { isDirectorioAdmin } from '../../lib/types';
import { useComisionistasQuery } from '../comisionistas/useComisionistas';
import { useProveedoresQuery } from '../proveedores/useProveedores';
import RotuloForm from './RotuloForm';
import RotuloVersionesModal from './RotuloVersionesModal';
import RotuloBultosModal from './RotuloBultosModal';
import RotuloFotosModal from './RotuloFotosModal';
import ComentarioRotuloModal from './ComentarioRotuloModal';
import { useEliminarRotuloGrupo, useRotuloAutoresQuery, useRotulosQuery, type RotuloGenerado } from './useRotulos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Icono } from '@/components/Icono';

export default function RotulosScreen() {
  const { profile } = useAuth();
  const admin = isDirectorioAdmin(profile);
  const toast = useToast();
  const confirmar = useConfirm();

  const { data: rotulos, isLoading, isError } = useRotulosQuery();
  const { data: proveedores } = useProveedoresQuery();
  const { data: comisionistas } = useComisionistasQuery();
  const eliminarGrupo = useEliminarRotuloGrupo();

  const [numDoc, setNumDoc] = useState('');
  const [provFiltro, setProvFiltro] = useState('');
  const [comFiltro, setComFiltro] = useState('');
  const [tipoDocFiltro, setTipoDocFiltro] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [versionesGrupoId, setVersionesGrupoId] = useState<string | null>(null);
  const [bultosRotuloId, setBultosRotuloId] = useState<string | null>(null);
  const [fotosGrupo, setFotosGrupo] = useState<{ grupoId: string; proveedorId: string; proveedorNombre: string } | null>(null);
  const [comentarioRotulo, setComentarioRotulo] = useState<RotuloGenerado | null>(null);

  const autoresIds = useMemo(() => (rotulos ?? []).map(r => r.creado_por).filter((v): v is string => !!v), [rotulos]);
  const { data: autores } = useRotuloAutoresQuery(autoresIds);

  const proveedoresPorId = useMemo(() => Object.fromEntries((proveedores ?? []).map(p => [p.id, p])), [proveedores]);
  const comisionistasPorId = useMemo(() => Object.fromEntries((comisionistas ?? []).map(c => [c.id, c])), [comisionistas]);

  const filtrados = useMemo(() => {
    const num = numDoc.trim().toLowerCase();
    return (rotulos ?? []).filter(r => {
      const matchNum = !num || (r.numero_documento || '').toLowerCase().includes(num);
      const matchProv = !provFiltro || r.proveedor_id === provFiltro;
      const matchCom = !comFiltro || (comFiltro === 'sin_comisionista' ? !r.comisionista_id : r.comisionista_id === comFiltro);
      const matchTipo = !tipoDocFiltro || r.tipo_documento === tipoDocFiltro;
      const fecha = r.created_at.slice(0, 10);
      const matchDesde = !desde || fecha >= desde;
      const matchHasta = !hasta || fecha <= hasta;
      return matchNum && matchProv && matchCom && matchTipo && matchDesde && matchHasta;
    });
  }, [rotulos, numDoc, provFiltro, comFiltro, tipoDocFiltro, desde, hasta]);

  const proveedoresOrdenados = useMemo(() => [...(proveedores ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre)), [proveedores]);
  const comisionistasOrdenados = useMemo(
    () => [...(comisionistas ?? [])].sort((a, b) => (a.empresa || a.nombre || '').localeCompare(b.empresa || b.nombre || '')),
    [comisionistas]
  );

  function docLabel(r: RotuloGenerado) {
    if (!r.tipo_documento) return '—';
    return `${r.tipo_documento === 'remito' ? 'Remito' : 'Nota de despacho'} ${r.numero_documento || ''}`.trim();
  }

  async function handleEliminar(r: RotuloGenerado) {
    if (!(await confirmar('¿Eliminar este envío y todo su historial de versiones? Va a la Papelera, se puede restaurar después.', { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    try {
      await eliminarGrupo.mutateAsync(r.grupo_id);
      toast('Envío eliminado', 'error');
    } catch (e) {
      await registrarErrorAccion('Error al eliminar envío', e);
      toast('Error al eliminar', 'error');
    }
  }

  // El PDF ya no se guarda como archivo (se arma al toque, ver
  // RotuloBultosModal), así que "Ver" siempre pasa por ese modal — incluso
  // con un solo bulto, es el único lugar que sabe generarlo bien.
  function VerBtn({ r }: { r: RotuloGenerado }) {
    const total = r.bulto_total ?? 1;
    return <Button variant="ghost" size="sm" onClick={() => setBultosRotuloId(r.id)}><Icono n="ver" /> Ver{total > 1 ? ` (${total})` : ''}</Button>;
  }

  // Visible para todos (para leerlo); el modal ya decide si se puede editar o solo ver.
  function ComentarioBtn({ r }: { r: RotuloGenerado }) {
    const tiene = !!r.comentario;
    return (
      <Button
        variant="ghost" size="icon"
        title={tiene ? r.comentario! : 'Agregar comentario'}
        style={tiene ? { color: 'var(--blue)' } : undefined}
        onClick={() => setComentarioRotulo(r)}
      ><Icono n="mensaje" /></Button>
    );
  }

  function AdminBtns({ r }: { r: RotuloGenerado }) {
    if (!admin) return null;
    return (
      <>
        {r.version > 1 && <Button variant="ghost" size="icon" title="Historial de versiones" onClick={() => setVersionesGrupoId(r.grupo_id)}><Icono n="reloj" /></Button>}
        <Button variant="ghost" size="icon" title="Editar" onClick={() => setEditingId(r.id)}><Icono n="editar" /></Button>
        <Button variant="dangerGhost" size="icon" title="Eliminar" onClick={() => void handleEliminar(r)}><Icono n="borrar" /></Button>
      </>
    );
  }

  const columns: Column<RotuloGenerado>[] = [
    { header: 'Proveedor', render: r => proveedoresPorId[r.proveedor_id]?.nombre || '(proveedor eliminado)' },
    { header: 'Comisionista', render: r => { const c = comisionistasPorId[r.comisionista_id || '']; return c ? (c.empresa || c.nombre) : '—'; } },
    { header: 'Documento', render: r => <>{docLabel(r)}{r.version > 1 && <span className="badge badge-rubro" style={{ marginLeft: 6 }}>v{r.version}</span>}</> },
    { header: 'Bulto', render: r => (r.bulto_total ?? 1) > 1 ? `${r.bulto_total} bultos` : '1 bulto' },
    { header: 'Versión', render: r => r.version },
    { header: 'Fecha', render: r => new Date(r.created_at).toLocaleDateString('es-AR') },
    { header: 'Creado por', render: r => { const a = r.creado_por ? autores?.[r.creado_por] : null; return a ? `${a.nombre || ''} ${a.apellido || ''}`.trim() : '—'; } },
    {
      header: 'Acciones',
      render: r => (
        <div className="td-actions">
          <VerBtn r={r} />
          <Button variant="ghost" size="icon" title="Fotos del envío" onClick={() => setFotosGrupo({ grupoId: r.grupo_id, proveedorId: r.proveedor_id, proveedorNombre: proveedoresPorId[r.proveedor_id]?.nombre || '' })}><Icono n="camara" /></Button>
          <ComentarioBtn r={r} />
          <AdminBtns r={r} />
        </div>
      ),
    },
  ];

  function renderCard(r: RotuloGenerado) {
    const prov = proveedoresPorId[r.proveedor_id];
    const com = comisionistasPorId[r.comisionista_id || ''];
    const autor = r.creado_por ? autores?.[r.creado_por] : null;
    return (
      <div className="prov-card">
        <div className="prov-card-header">
          <div>
            <div className="prov-card-name">{prov?.nombre || '(proveedor eliminado)'}</div>
            {r.version > 1 && <span className="badge badge-rubro" style={{ marginTop: 4, display: 'inline-flex' }}>v{r.version}</span>}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleDateString('es-AR')}</span>
        </div>
        <div className="prov-card-body">
          <div className="prov-card-row"><Icono n="documento" /> {docLabel(r)}</div>
          <div className="prov-card-row"><Icono n="paquete" /> {(r.bulto_total ?? 1) > 1 ? `${r.bulto_total} bultos` : '1 bulto'}</div>
          {com && <div className="prov-card-row"><Icono n="acuerdo" /> {com.empresa || com.nombre}</div>}
          {autor && <div className="prov-card-row"><Icono n="usuario" /> {`${autor.nombre || ''} ${autor.apellido || ''}`.trim()}</div>}
        </div>
        <div className="prov-card-actions">
          <VerBtn r={r} />
          <Button variant="ghost" size="sm" onClick={() => setFotosGrupo({ grupoId: r.grupo_id, proveedorId: r.proveedor_id, proveedorNombre: prov?.nombre || '' })}><Icono n="camara" /> Fotos</Button>
          <Button variant="ghost" size="sm" style={r.comentario ? { color: 'var(--blue)' } : undefined} onClick={() => setComentarioRotulo(r)}><Icono n="mensaje" /> {r.comentario ? 'Comentario' : 'Comentar'}</Button>
          {admin && (
            <>
              {r.version > 1 && <Button variant="ghost" size="sm" onClick={() => setVersionesGrupoId(r.grupo_id)}><Icono n="reloj" /> Historial</Button>}
              <Button variant="ghost" size="sm" onClick={() => setEditingId(r.id)}><Icono n="editar" /> Editar</Button>
              <Button variant="dangerGhost" size="sm" onClick={() => void handleEliminar(r)}><Icono n="borrar" /> Borrar</Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title"><Icono n="paquete" /> Envíos</div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Input type="text" placeholder="Buscar por N° de remito/despacho..." value={numDoc} onChange={e => setNumDoc(e.target.value)} />
        </div>
        <Select className="filter-select" aria-label="Filtrar por proveedor" value={provFiltro} onChange={e => setProvFiltro(e.target.value)}>
          <option value="">Todos los proveedores</option>
          {proveedoresOrdenados.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </Select>
        <Select className="filter-select" aria-label="Filtrar por comisionista" value={comFiltro} onChange={e => setComFiltro(e.target.value)}>
          <option value="">Todos los comisionistas</option>
          <option value="sin_comisionista">Sin comisionista</option>
          {comisionistasOrdenados.map(c => <option key={c.id} value={c.id}>{c.empresa || c.nombre}</option>)}
        </Select>
        <Select className="filter-select" aria-label="Filtrar por tipo de documento" style={{ minWidth: 150 }} value={tipoDocFiltro} onChange={e => setTipoDocFiltro(e.target.value)}>
          <option value="">Remito y despacho</option>
          <option value="remito">Solo remitos</option>
          <option value="despacho">Solo despachos</option>
        </Select>
        <div className="filter-date-range" style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', padding: '0 8px' }}>
          <Input
            type="date"
            aria-label="Desde"
            title="Desde"
            value={desde}
            onChange={e => setDesde(e.target.value)}
            style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', padding: '8px 0', fontSize: 13, color: 'var(--text)' }}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: 12, flexShrink: 0 }}>–</span>
          <Input
            type="date"
            aria-label="Hasta"
            title="Hasta"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
            style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', padding: '8px 0', fontSize: 13, color: 'var(--text)' }}
          />
        </div>
      </div>

      {isLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {isError && <p style={{ color: 'var(--danger)' }}>Error al cargar los rótulos.</p>}

      {!isLoading && !isError && (
        <ResponsiveList
          columns={columns}
          data={filtrados}
          renderCard={renderCard}
          keyField={r => r.id}
          emptyIcon={<Icono n="paquete" />}
          emptyTitle="Sin envíos"
          emptyDescription="No hay envíos que coincidan con el filtro."
        />
      )}

      <RotuloForm open={!!editingId} onClose={() => setEditingId(null)} proveedorId={null} editingId={editingId} />
      <RotuloVersionesModal open={!!versionesGrupoId} onClose={() => setVersionesGrupoId(null)} grupoId={versionesGrupoId} onVerBultos={id => { setVersionesGrupoId(null); setBultosRotuloId(id); }} />
      <RotuloBultosModal open={!!bultosRotuloId} onClose={() => setBultosRotuloId(null)} rotuloId={bultosRotuloId} />
      <RotuloFotosModal
        open={!!fotosGrupo}
        onClose={() => setFotosGrupo(null)}
        grupoId={fotosGrupo?.grupoId ?? null}
        proveedorId={fotosGrupo?.proveedorId ?? null}
        proveedorNombre={fotosGrupo?.proveedorNombre ?? ''}
      />
      <ComentarioRotuloModal
        rotuloId={comentarioRotulo?.id ?? null}
        comentarioActual={comentarioRotulo?.comentario ?? null}
        puedeEditar={admin}
        onClose={() => setComentarioRotulo(null)}
      />
    </div>
  );
}
