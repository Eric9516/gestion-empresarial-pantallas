import ResponsiveList, { type Column } from '../../components/ResponsiveList';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { useErrorLogsQuery, useLimpiarErrorLogs, type ErrorLogRow } from './useErrorLogs';
import { Button } from '@/components/ui/button';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

const columns: Column<ErrorLogRow>[] = [
  { header: 'Fecha', render: r => <span style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString('es-AR')}</span> },
  { header: 'Usuario', render: r => r.usuario_email || '—' },
  { header: 'Pantalla', render: r => r.pantalla || '—' },
  { header: 'Mensaje', render: r => <span style={{ fontSize: 12 }}>{r.mensaje}</span> },
  { header: 'Navegador', render: r => <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(r.user_agent || '').slice(0, 80)}</span> },
];

function renderCard(r: ErrorLogRow) {
  return (
    <div className="prov-card">
      <div className="prov-card-header">
        <div>
          <div className="prov-card-name">{r.usuario_email || 'Desconocido'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2 }}>
            {new Date(r.created_at).toLocaleString('es-AR')} — {r.pantalla || '—'}
          </div>
          <div style={{ fontSize: 12, marginTop: 6 }}>{r.mensaje}</div>
        </div>
      </div>
    </div>
  );
}

export default function ErroresPane() {
  const { data: rows, isLoading, isError } = useErrorLogsQuery();
  const limpiar = useLimpiarErrorLogs();
  const toast = useToast();
  const confirmar = useConfirm();

  async function handleLimpiar() {
    if (!(await confirmar('¿Borrar todos los errores registrados?', { textoConfirmar: 'Borrar todo', peligroso: true }))) return;
    try {
      await limpiar.mutateAsync();
      toast('Log de errores limpiado', 'success');
    } catch (e) {
      toast('Error al limpiar: ' + mensajeDeError(e), 'error');
    }
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header" style={{ justifyContent: 'space-between' }}>
        <span><Icono n="error" /> Log de errores</span>
        <Button size="sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', fontSize: 12 }} onClick={() => void handleLimpiar()}>Limpiar</Button>
      </div>
      <div className="admin-card-body" style={{ padding: rows?.length ? 0 : 18 }}>
        {isLoading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</p>}
        {isError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>Error al cargar el log</p>}
        {!isLoading && !isError && (
          <ResponsiveList
            columns={columns}
            data={rows ?? []}
            renderCard={renderCard}
            keyField={r => r.id}
            emptyIcon={<Icono n="error" />}
            emptyTitle="Sin errores registrados"
            emptyDescription=""
          />
        )}
      </div>
    </div>
  );
}
