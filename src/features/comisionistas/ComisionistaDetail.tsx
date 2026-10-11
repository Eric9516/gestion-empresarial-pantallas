import Modal from '../../components/Modal';
import { useCamposCustomQuery } from '../config/useCamposCustom';
import type { Comisionista } from './useComisionistas';
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
  comisionista: Comisionista | null;
  onClose: () => void;
  // Sin onEdit es una vista de solo lectura (usuario común, no admin de Directorio).
  onEdit?: () => void;
}

export default function ComisionistaDetail({ comisionista, onClose, onEdit }: Props) {
  const { data: camposCustom } = useCamposCustomQuery();
  if (!comisionista) return null;

  const fecha = comisionista.updated_at ? new Date(comisionista.updated_at).toLocaleDateString('es-AR') : '—';
  const camposExtra = (comisionista.campos_extra as Record<string, string> | null) ?? {};
  const conValor = (camposCustom ?? []).filter(c => camposExtra[c.id]);

  return (
    <Modal
      open
      onClose={onClose}
      title={comisionista.nombre}
      footer={onEdit && <Button variant="primary" onClick={onEdit}><Icono n="editar" /> Editar</Button>}
    >
      <div className="detail-grid">
        <Field label="Zona / Región" value={comisionista.zona} />
        <Field label="Empresa" value={comisionista.empresa} />
        <Field label="Localidad" value={[comisionista.localidad, comisionista.provincia].filter(Boolean).join(', ')} />
        <Field label="Teléfono" value={comisionista.telefono} />
        <Field label="Celular / WhatsApp" value={comisionista.celular} />
        <Field label="Email" value={comisionista.email} />
        <Field label="Estado" value={comisionista.activo ? <><Icono n="exito" /> Activo</> : <><Icono n="vacio" /> Inactivo</>} />
        <Field label="Última modificación" value={comisionista.modificado_por ? `${fecha} por ${comisionista.modificado_por}` : fecha} />
      </div>
      {comisionista.notas && (
        <div className="detail-section">
          <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>Notas</label>
          <p style={{ marginTop: 4, fontSize: 14, color: 'var(--text-mid)' }}>{comisionista.notas}</p>
        </div>
      )}
      {conValor.length > 0 && (
        <>
          <div className="divider" />
          <div style={{ fontWeight: 700, color: 'var(--blue)', marginBottom: 12 }}><Icono n="lista" /> Información adicional</div>
          <div className="detail-grid">
            {conValor.map(c => <Field key={c.id} label={c.label} value={camposExtra[c.id]} />)}
          </div>
        </>
      )}
    </Modal>
  );
}
