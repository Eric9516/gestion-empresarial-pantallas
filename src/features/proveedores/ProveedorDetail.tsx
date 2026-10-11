import Modal from '../../components/Modal';
import type { Proveedor } from './useProveedores';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';
import type { ReactNode } from 'react';

function Field({ label, value }: { label: string; value?: ReactNode }) {
  if (!value) return null;
  return (
    <div className="detail-item">
      <label>{label}</label>
      <div className="value">{value}</div>
    </div>
  );
}

interface Props {
  proveedor: Proveedor | null;
  onClose: () => void;
  // Sin onEdit/onRotulo es una vista de solo lectura (ej. desde el detalle de un repuesto).
  onEdit?: () => void;
  onRotulo?: () => void;
}

export default function ProveedorDetail({ proveedor, onClose, onEdit, onRotulo }: Props) {
  if (!proveedor) return null;
  const fecha = proveedor.updated_at ? new Date(proveedor.updated_at).toLocaleDateString('es-AR') : '—';
  const ubicacion = [proveedor.localidad, proveedor.provincia, proveedor.codigo_postal ? `CP: ${proveedor.codigo_postal}` : '']
    .filter(Boolean).join(', ');

  return (
    <Modal
      open
      onClose={onClose}
      title={proveedor.nombre}
      footer={(onRotulo || onEdit) && (
        <>
          {onRotulo && <Button variant="ghost" onClick={onRotulo}><Icono n="etiqueta" /> Generar rótulo</Button>}
          {onEdit && <Button variant="primary" onClick={onEdit}><Icono n="editar" /> Editar</Button>}
        </>
      )}
    >
      <div className="detail-grid">
        <Field label="Rubro" value={proveedor.rubro} />
        <Field label="Localidad" value={ubicacion} />
        <Field label="Dirección" value={proveedor.direccion} />
        <Field label="Horario" value={proveedor.horario} />
        <Field label="Email" value={proveedor.email} />
        <Field label="Estado" value={proveedor.activo ? <><Icono n="exito" /> Activo</> : <><Icono n="vacio" /> Inactivo</>} />
        <Field label="Última modificación" value={proveedor.modificado_por ? `${fecha} por ${proveedor.modificado_por}` : fecha} />
      </div>
      {proveedor.notas && (
        <div className="detail-section">
          <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>Notas</label>
          <p style={{ marginTop: 4, fontSize: 14, color: 'var(--text-mid)' }}>{proveedor.notas}</p>
        </div>
      )}
      <div className="divider" />
      <div style={{ fontWeight: 700, color: 'var(--blue)', marginBottom: 12 }}><Icono n="usuario" /> Contactos ({proveedor.contactos.length})</div>
      {proveedor.contactos.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin contactos registrados</p>
      ) : (
        <div className="contacts-list">
          {proveedor.contactos.map(c => (
            <div className="contact-card" key={c.id}>
              <div className="contact-card-name">{c.nombre}</div>
              {c.cargo && <div className="contact-card-cargo">{c.cargo}</div>}
              <div className="contact-card-info">
                {c.telefono && <span><Icono n="telefono" /> {c.telefono}</span>}
                {c.celular && <span><Icono n="celular" /> {c.celular}</span>}
                {c.email && <span><Icono n="correo" /> {c.email}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
