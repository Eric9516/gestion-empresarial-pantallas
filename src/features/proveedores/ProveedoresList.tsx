import { useState } from 'react';
import ListaDirectorio, { type AccionesDeFila } from '../../components/ListaDirectorio';
import type { Column } from '../../components/ResponsiveList';
import { useDeleteProveedor, useProveedoresQuery, type Proveedor } from './useProveedores';
import ProveedorForm from './ProveedorForm';
import ProveedorDetail from './ProveedorDetail';
import RotuloForm from '../rotulos/RotuloForm';
import { Button } from '@/components/ui/button';
import { Icono, Punto } from '@/components/Icono';

const aFechaCorta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '');

const Estado = ({ activo }: { activo: boolean | null }) => (
  <span className={`badge ${activo ? 'badge-active' : 'badge-inactive'}`}>{activo ? <><Punto /> Activo</> : <><Punto hueco /> Inactivo</>}</span>
);

export default function ProveedoresList() {
  const { data: proveedores, isLoading, isError } = useProveedoresQuery();
  const deleteProveedor = useDeleteProveedor();
  const [rotuloProvId, setRotuloProvId] = useState<string | null>(null);

  const columnas = ({ admin, ver, editar, eliminar }: AccionesDeFila<Proveedor>): Column<Proveedor>[] => [
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
    { header: 'Estado', render: p => <Estado activo={p.activo} /> },
    {
      header: 'Modificado',
      render: p => (
        <>
          <div style={{ fontSize: 12 }}>{aFechaCorta(p.updated_at) || '—'}</div>
          <div className="meta-info">por {p.modificado_por || '—'}</div>
        </>
      ),
    },
    {
      header: 'Acciones',
      render: p => (
        <div className="td-actions">
          <Button variant="ghost" size="icon" title="Ver" onClick={() => ver(p)}><Icono n="ver" /></Button>
          {admin && <Button variant="ghost" size="icon" title="Editar" onClick={() => editar(p)}><Icono n="editar" /></Button>}
          <Button variant="ghost" size="icon" title="Rótulo" onClick={() => setRotuloProvId(p.id)}><Icono n="etiqueta" /></Button>
          {admin && <Button variant="dangerGhost" size="icon" title="Eliminar" onClick={() => eliminar(p)}><Icono n="borrar" /></Button>}
        </div>
      ),
    },
  ];

  const tarjeta = (p: Proveedor, { admin, ver, editar, eliminar }: AccionesDeFila<Proveedor>) => {
    const contacto = p.contactos[0];
    return (
      <div className="prov-card">
        <div className="prov-card-header">
          <div>
            <div className="prov-card-name">{p.nombre}</div>
            {p.rubro && <span className="badge badge-rubro" style={{ marginTop: 4, display: 'inline-flex' }}>{p.rubro}</span>}
          </div>
          <Estado activo={p.activo} />
        </div>
        <div className="prov-card-body">
          {(p.localidad || p.provincia) && <div className="prov-card-row"><Icono n="lugar" /> {[p.localidad, p.provincia].filter(Boolean).join(', ')}</div>}
          {p.horario && <div className="prov-card-row"><Icono n="reloj" /> {p.horario}</div>}
          {contacto && <div className="prov-card-row"><Icono n="usuario" /> {contacto.nombre}{contacto.telefono ? ' — ' + contacto.telefono : ''}{contacto.celular ? ' / ' + contacto.celular : ''}</div>}
        </div>
        <div className="prov-card-actions">
          <Button variant="ghost" size="sm" onClick={() => ver(p)}><Icono n="ver" /> Ver</Button>
          {admin && <Button variant="ghost" size="sm" onClick={() => editar(p)}><Icono n="editar" /> Editar</Button>}
          <Button variant="ghost" size="sm" aria-label="Rótulo" title="Rótulo" onClick={() => setRotuloProvId(p.id)}><Icono n="etiqueta" /></Button>
          {admin && <Button variant="dangerGhost" size="sm" aria-label="Eliminar" title="Eliminar" onClick={() => eliminar(p)}><Icono n="borrar" /></Button>}
        </div>
      </div>
    );
  };

  return (
    <ListaDirectorio<Proveedor>
      datos={proveedores}
      isLoading={isLoading}
      isError={isError}
      icono="fabrica"
      textos={{
        titulo: 'Proveedores', buscar: 'Buscar proveedor...', sinDatos: 'Sin proveedores aún', agregarPrimero: 'Agregá el primer proveedor.',
        errorAlCargar: 'Error al cargar proveedores.', eliminado: 'Proveedor eliminado',
      }}
      grupo={{ todos: 'Todos los rubros', plural: 'Rubros', iconoDeLaCuenta: 'paquete', valor: p => p.rubro }}
      camposDeBusqueda={p => [p.nombre, p.rubro, p.localidad, p.provincia, p.email]}
      columnas={columnas}
      tarjeta={tarjeta}
      exportar={{
        hoja: 'Proveedores',
        archivo: 'proveedores',
        filas: lista => lista.map(p => ({
          Nombre: p.nombre, Rubro: p.rubro || '', Email: p.email || '',
          Dirección: p.direccion || '', Localidad: p.localidad || '', Provincia: p.provincia || '',
          Horario: p.horario || '', Estado: p.activo ? 'Activo' : 'Inactivo', Notas: p.notas || '',
          'Última modificación': aFechaCorta(p.updated_at),
          'Modificado por': p.modificado_por || '',
          Contactos: p.contactos.map(c => `${c.nombre}${c.cargo ? ' (' + c.cargo + ')' : ''}`).join(' | '),
        })),
      }}
      eliminar={{
        pregunta: p => `¿Eliminar a "${p.nombre}"? Queda en la Papelera hasta que se confirme la baja definitiva.`,
        hacer: id => deleteProveedor.mutateAsync(id),
      }}
      formulario={({ open, onClose, editando }) => <ProveedorForm open={open} onClose={onClose} proveedor={editando} />}
      detalle={({ fila, onClose, onEditar }) => (
        <ProveedorDetail
          proveedor={fila}
          onClose={onClose}
          onEdit={onEditar}
          onRotulo={() => { setRotuloProvId(fila.id); onClose(); }}
        />
      )}
      extras={<RotuloForm open={!!rotuloProvId} onClose={() => setRotuloProvId(null)} proveedorId={rotuloProvId} editingId={null} />}
    />
  );
}
