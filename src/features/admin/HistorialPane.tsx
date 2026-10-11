import ResponsiveList, { type Column } from '../../components/ResponsiveList';
import { useAuditLogQuery, type AuditLogRow } from './useAuditLog';
import { Icono } from '@/components/Icono';

const TABLA_LABELS: Record<string, string> = { proveedores: 'Proveedor', comisionistas: 'Comisionista', contactos: 'Contacto', retiro_items: 'Retiro',
  items: 'Repuesto', usuarios_perfil: 'Usuario',
  reparaciones: 'Reparación', reparacion_items: 'Reparación (repuesto)', reparacion_entregas: 'Reparación (entrega)',
};
const ACCION_LABELS: Record<string, string> = { insert: 'Alta', update: 'Edición', delete: 'Baja' };
const ACCION_BADGE: Record<string, string> = { insert: 'badge-active', update: 'badge-rubro', delete: 'badge-inactive' };

const columns: Column<AuditLogRow>[] = [
  { header: 'Fecha', render: r => new Date(r.created_at).toLocaleString('es-AR') },
  { header: 'Usuario', render: r => r.usuario_nombre || r.usuario_email || 'Desconocido' },
  { header: 'Tabla', render: r => TABLA_LABELS[r.tabla] || r.tabla },
  { header: 'Acción', render: r => <span className={`badge ${ACCION_BADGE[r.accion] || ''}`}>{ACCION_LABELS[r.accion] || r.accion}</span> },
  { header: 'Detalle', render: r => r.descripcion || '—' },
];

function keyField(r: AuditLogRow) {
  return String(r.id);
}

function renderCard(r: AuditLogRow) {
  return (
    <div className="prov-card">
      <div className="prov-card-header">
        <div>
          <div className="prov-card-name">{r.usuario_nombre || r.usuario_email || 'Desconocido'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2 }}>{new Date(r.created_at).toLocaleString('es-AR')}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`badge ${ACCION_BADGE[r.accion] || ''}`}>{ACCION_LABELS[r.accion] || r.accion}</span>
            <span style={{ fontSize: 12, color: 'var(--text-mid)' }}>{TABLA_LABELS[r.tabla] || r.tabla}</span>
          </div>
          {r.descripcion && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{r.descripcion}</div>}
        </div>
      </div>
    </div>
  );
}

export default function HistorialPane() {
  const { data: rows, isLoading, isError } = useAuditLogQuery();

  return (
    <div className="admin-card">
      <div className="admin-card-header"><Icono n="historial" /> Historial de cambios</div>
      <div className="admin-card-body" style={{ padding: rows?.length ? 0 : 18 }}>
        {isLoading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</p>}
        {isError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>Error al cargar historial</p>}
        {!isLoading && !isError && (
          <ResponsiveList
            columns={columns}
            data={rows ?? []}
            renderCard={renderCard}
            keyField={keyField}
            emptyIcon={<Icono n="historial" />}
            emptyTitle="Sin movimientos registrados"
            emptyDescription=""
          />
        )}
      </div>
    </div>
  );
}
