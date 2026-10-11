import ResponsiveList, { type Column } from '../../components/ResponsiveList';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { useLimpiarSugerencias, useSugerenciasQuery, type Sugerencia } from './useSugerencias';
import { Button } from '@/components/ui/button';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

const columns: Column<Sugerencia>[] = [
  { header: 'Fecha', render: s => <span style={{ whiteSpace: 'nowrap' }}>{new Date(s.created_at).toLocaleString('es-AR')}</span> },
  { header: 'Usuario', render: s => s.usuarioNombre },
  { header: 'Sugerencia', render: s => <span style={{ fontSize: 13 }}>{s.mensaje}</span> },
];

function renderCard(s: Sugerencia) {
  return (
    <div className="prov-card">
      <div className="prov-card-header">
        <div>
          <div className="prov-card-name">{s.usuarioNombre}</div>
          <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2 }}>{new Date(s.created_at).toLocaleString('es-AR')}</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>{s.mensaje}</div>
        </div>
      </div>
    </div>
  );
}

export default function SugerenciasPane() {
  const { data: rows, isLoading, isError } = useSugerenciasQuery();
  const limpiar = useLimpiarSugerencias();
  const toast = useToast();
  const confirmar = useConfirm();

  async function handleLimpiar() {
    if (!(await confirmar('¿Borrar todas las sugerencias?', { textoConfirmar: 'Borrar todas', peligroso: true }))) return;
    try {
      await limpiar.mutateAsync();
      toast('Sugerencias limpiadas', 'success');
    } catch (e) {
      toast('Error al limpiar: ' + mensajeDeError(e), 'error');
    }
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header" style={{ justifyContent: 'space-between' }}>
        <span><Icono n="mensaje" /> Sugerencias</span>
        <Button size="sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', fontSize: 12 }} onClick={() => void handleLimpiar()}>Limpiar</Button>
      </div>
      <div className="admin-card-body" style={{ padding: rows?.length ? 0 : 18 }}>
        {isLoading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</p>}
        {isError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>Error al cargar las sugerencias</p>}
        {!isLoading && !isError && (
          <ResponsiveList
            columns={columns}
            data={rows ?? []}
            renderCard={renderCard}
            keyField={s => s.id}
            emptyIcon={<Icono n="mensaje" />}
            emptyTitle="Todavía no hay sugerencias"
            emptyDescription=""
          />
        )}
      </div>
    </div>
  );
}
