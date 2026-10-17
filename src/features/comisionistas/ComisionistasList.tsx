import ListaDirectorio, { type AccionesDeFila } from '../../components/ListaDirectorio';
import type { Column } from '../../components/ResponsiveList';
import { useCamposCustomQuery } from '../config/useCamposCustom';
import { useComisionistasQuery, useDeleteComisionista, type Comisionista } from './useComisionistas';
import ComisionistaForm from './ComisionistaForm';
import ComisionistaDetail from './ComisionistaDetail';
import { Button } from '@/components/ui/button';
import { Icono, Punto } from '@/components/Icono';

const aFechaCorta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '');

const Estado = ({ activo }: { activo: boolean | null }) => (
  <span className={`badge ${activo ? 'badge-active' : 'badge-inactive'}`}>{activo ? <><Punto /> Activo</> : <><Punto hueco /> Inactivo</>}</span>
);

const columnas = ({ admin, ver, editar, eliminar }: AccionesDeFila<Comisionista>): Column<Comisionista>[] => [
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
  { header: 'Estado', render: c => <Estado activo={c.activo} /> },
  {
    header: 'Modificado',
    render: c => (
      <>
        <div style={{ fontSize: 12 }}>{aFechaCorta(c.updated_at) || '—'}</div>
        <div className="meta-info">por {c.modificado_por || '—'}</div>
      </>
    ),
  },
  {
    header: 'Acciones',
    render: c => (
      <div className="td-actions">
        <Button variant="ghost" size="icon" title="Ver" onClick={() => ver(c)}><Icono n="ver" /></Button>
        {admin && <Button variant="ghost" size="icon" title="Editar" onClick={() => editar(c)}><Icono n="editar" /></Button>}
        {admin && <Button variant="dangerGhost" size="icon" title="Eliminar" onClick={() => eliminar(c)}><Icono n="borrar" /></Button>}
      </div>
    ),
  },
];

const tarjeta = (c: Comisionista, { admin, ver, editar, eliminar }: AccionesDeFila<Comisionista>) => (
  <div className="prov-card">
    <div className="prov-card-header">
      <div>
        <div className="prov-card-name">{c.nombre}</div>
        {c.zona && <span className="badge badge-rubro" style={{ marginTop: 4, display: 'inline-flex' }}>{c.zona}</span>}
      </div>
      <Estado activo={c.activo} />
    </div>
    <div className="prov-card-body">
      {c.empresa && <div className="prov-card-row"><Icono n="empresa" /> {c.empresa}</div>}
      {(c.localidad || c.provincia) && <div className="prov-card-row"><Icono n="lugar" /> {[c.localidad, c.provincia].filter(Boolean).join(', ')}</div>}
      {c.telefono && <div className="prov-card-row"><Icono n="telefono" /> {c.telefono}</div>}
      {c.celular && <div className="prov-card-row"><Icono n="celular" /> {c.celular}</div>}
    </div>
    <div className="prov-card-actions">
      <Button variant="ghost" size="sm" onClick={() => ver(c)}><Icono n="ver" /> Ver</Button>
      {admin && <Button variant="ghost" size="sm" onClick={() => editar(c)}><Icono n="editar" /> Editar</Button>}
      {admin && <Button variant="dangerGhost" size="sm" aria-label="Eliminar" title="Eliminar" onClick={() => eliminar(c)}><Icono n="borrar" /></Button>}
    </div>
  </div>
);

export default function ComisionistasList() {
  const { data: comisionistas, isLoading, isError } = useComisionistasQuery();
  const { data: camposCustom } = useCamposCustomQuery();
  const deleteComisionista = useDeleteComisionista();

  return (
    <ListaDirectorio<Comisionista>
      datos={comisionistas}
      isLoading={isLoading}
      isError={isError}
      icono="acuerdo"
      textos={{
        titulo: 'Comisionistas', buscar: 'Buscar comisionista...', sinDatos: 'Sin comisionistas aún', agregarPrimero: 'Agregá el primer comisionista.',
        errorAlCargar: 'Error al cargar comisionistas.', eliminado: 'Comisionista eliminado',
      }}
      grupo={{ todos: 'Todas las zonas', plural: 'Zonas', iconoDeLaCuenta: 'lugar', valor: c => c.zona }}
      camposDeBusqueda={c => [c.nombre, c.zona, c.localidad, c.provincia, c.empresa, c.email]}
      columnas={columnas}
      tarjeta={tarjeta}
      exportar={{
        hoja: 'Comisionistas',
        archivo: 'comisionistas',
        filas: lista => lista.map(c => {
          const camposExtra = (c.campos_extra as Record<string, string> | null) ?? {};
          const base: Record<string, string> = {
            Nombre: c.nombre, Zona: c.zona || '', Empresa: c.empresa || '',
            Teléfono: c.telefono || '', Celular: c.celular || '', Email: c.email || '',
            Localidad: c.localidad || '', Provincia: c.provincia || '',
            Estado: c.activo ? 'Activo' : 'Inactivo', Notas: c.notas || '',
            'Última modificación': aFechaCorta(c.updated_at),
            'Modificado por': c.modificado_por || '',
          };
          (camposCustom ?? []).forEach(campo => { base[campo.label] = camposExtra[campo.id] || ''; });
          return base;
        }),
      }}
      eliminar={{
        pregunta: c => `¿Eliminar a "${c.nombre}"? Esta acción no se puede deshacer.`,
        hacer: id => deleteComisionista.mutateAsync(id),
      }}
      formulario={({ open, onClose, editando }) => <ComisionistaForm open={open} onClose={onClose} comisionista={editando} />}
      detalle={({ fila, onClose, onEditar }) => <ComisionistaDetail comisionista={fila} onClose={onClose} onEdit={onEditar} />}
    />
  );
}
