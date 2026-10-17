import { useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { isDirectorioAdmin } from '../lib/types';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmProvider';
import { exportarExcel } from '../lib/exportExcel';
import StatsRow from './StatsRow';
import ResponsiveList, { type Column } from './ResponsiveList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { mensajeDeError } from '@/lib/errores';
import { Icono, type NombreIcono } from '@/components/Icono';

// Lo que cada fila le puede pedir a la lista: abrir el detalle, editar, eliminar. `admin` dice si esta persona puede editar y eliminar.
export interface AccionesDeFila<T> {
  admin: boolean;
  ver: (fila: T) => void;
  editar: (fila: T) => void;
  eliminar: (fila: T) => void;
}

interface Props<T extends { id: string; activo: boolean | null }> {
  datos: T[] | undefined;
  isLoading: boolean;
  isError: boolean;
  icono: NombreIcono;
  /** Los textos de esta lista, en la forma en que se dicen. */
  textos: {
    titulo: string; // "Proveedores"
    buscar: string; // "Buscar proveedor..."
    sinDatos: string; // "Sin proveedores aún"
    agregarPrimero: string; // "Agregá el primer proveedor."
    errorAlCargar: string; // "Error al cargar proveedores."
    eliminado: string; // "Proveedor eliminado"
  };
  /** Un campo por el que se agrupa y se filtra (rubro, zona...). */
  grupo: { todos: string; plural: string; iconoDeLaCuenta: NombreIcono; valor: (fila: T) => string | null | undefined };
  camposDeBusqueda: (fila: T) => (string | null | undefined)[];
  columnas: (acciones: AccionesDeFila<T>) => Column<T>[];
  tarjeta: (fila: T, acciones: AccionesDeFila<T>) => ReactNode;
  exportar: { hoja: string; archivo: string; filas: (datos: T[]) => Record<string, string>[] };
  eliminar: { pregunta: (fila: T) => string; hacer: (id: string) => Promise<unknown> };
  formulario: (estado: { open: boolean; onClose: () => void; editando: T | null }) => ReactNode;
  detalle: (estado: { fila: T; onClose: () => void; onEditar: (() => void) | undefined }) => ReactNode;
  /** Ventanas extra de esta lista (por ejemplo, la del rótulo en proveedores). */
  extras?: ReactNode;
}

// La lista del Directorio (proveedores, comisionistas): estadísticas arriba, buscador, filtros, tabla o tarjetas, y los pasos de ver, editar y eliminar.
// Lo que cambia de una a otra (columnas, tarjetas, textos, qué se exporta) llega por parámetros; lo demás está acá una sola vez.
export default function ListaDirectorio<T extends { id: string; activo: boolean | null }>({
  datos, isLoading, isError, icono, textos, grupo, camposDeBusqueda, columnas, tarjeta, exportar, eliminar, formulario, detalle, extras,
}: Props<T>) {
  const { profile } = useAuth();
  const admin = isDirectorioAdmin(profile);
  const toast = useToast();
  const confirmar = useConfirm();

  const [search, setSearch] = useState('');
  const [grupoFiltro, setGrupoFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<'activo' | '' | 'inactivo'>('activo');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [viewing, setViewing] = useState<T | null>(null);

  const grupos = useMemo(
    () => [...new Set((datos ?? []).map(grupo.valor).filter((g): g is string => !!g))].sort(),
    // `grupo.valor` viene de una constante de cada lista: no cambia entre dibujados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos],
  );

  const filtrados = useMemo(() => {
    const q = search.toLowerCase();
    return (datos ?? []).filter(fila => {
      const coincideTexto = !q || camposDeBusqueda(fila).some(v => v?.toLowerCase().includes(q));
      const coincideGrupo = !grupoFiltro || grupo.valor(fila) === grupoFiltro;
      const coincideEstado = !estadoFiltro || (estadoFiltro === 'activo' ? fila.activo : !fila.activo);
      return coincideTexto && coincideGrupo && coincideEstado;
    });
    // `grupo.valor` y `camposDeBusqueda` vienen de constantes de cada lista: no cambian entre dibujados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, search, grupoFiltro, estadoFiltro]);

  const activos = (datos ?? []).filter(f => f.activo).length;

  function abrirEdicion(fila: T | null) { setEditing(fila); setFormOpen(true); }

  async function handleDelete(fila: T) {
    if (!(await confirmar(eliminar.pregunta(fila), { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    try {
      await eliminar.hacer(fila.id);
      toast(textos.eliminado, 'error');
    } catch (e) {
      toast('Error al eliminar: ' + mensajeDeError(e), 'error');
    }
  }

  async function handleExport() {
    if (!datos?.length) { toast('Sin datos para exportar', 'error'); return; }
    await exportarExcel(exportar.filas(datos), exportar.hoja, `${exportar.archivo}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast('Excel exportado', 'success');
  }

  const acciones: AccionesDeFila<T> = { admin, ver: setViewing, editar: abrirEdicion, eliminar: fila => void handleDelete(fila) };

  return (
    <div>
      <StatsRow stats={[
        { icon: <Icono n={icono} />, iconColor: 'blue', value: datos?.length ?? 0, label: 'Total' },
        { icon: <Icono n="exito" />, iconColor: 'green', value: activos, label: 'Activos' },
        { icon: <Icono n={grupo.iconoDeLaCuenta} />, iconColor: 'red', value: grupos.length, label: grupo.plural },
      ]} />

      <div className="section-header">
        <div className="section-title"><Icono n={icono} /> {textos.titulo}</div>
        <div className="section-actions">
          <Button variant="ghost" size="sm" onClick={() => void handleExport()}>Excel</Button>
          {admin && <Button variant="primary" size="sm" onClick={() => abrirEdicion(null)}>+ Nuevo</Button>}
        </div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Input type="text" placeholder={textos.buscar} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select className="filter-select" aria-label={`Filtrar por ${grupo.plural.toLowerCase()}`} value={grupoFiltro} onChange={e => setGrupoFiltro(e.target.value)}>
          <option value="">{grupo.todos}</option>
          {grupos.map(g => <option key={g} value={g}>{g}</option>)}
        </Select>
        <Select className="filter-select" aria-label="Filtrar por estado" style={{ minWidth: 130 }} value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value as typeof estadoFiltro)}>
          <option value="activo">Solo activos</option>
          <option value="">Todos</option>
          <option value="inactivo">Inactivos</option>
        </Select>
      </div>

      {isLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {isError && <p style={{ color: 'var(--danger)' }}>{textos.errorAlCargar}</p>}

      {!isLoading && !isError && (
        <ResponsiveList
          columns={columnas(acciones)}
          data={filtrados}
          renderCard={fila => tarjeta(fila, acciones)}
          keyField={fila => fila.id}
          emptyIcon={<Icono n={icono} />}
          emptyTitle={datos?.length === 0 ? textos.sinDatos : 'Sin resultados'}
          emptyDescription={datos?.length === 0 ? textos.agregarPrimero : 'Probá con otro filtro.'}
        />
      )}

      {admin && formulario({ open: formOpen, onClose: () => setFormOpen(false), editando: editing })}
      {viewing && detalle({
        fila: viewing,
        onClose: () => setViewing(null),
        onEditar: admin ? () => { abrirEdicion(viewing); setViewing(null); } : undefined,
      })}
      {extras}
    </div>
  );
}
