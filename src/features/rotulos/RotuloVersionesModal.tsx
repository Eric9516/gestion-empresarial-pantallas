import Modal from '../../components/Modal';
import { useRotuloVersionesQuery } from './useRotulos';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  grupoId: string | null;
  onVerBultos: (rotuloId: string) => void;
}

export default function RotuloVersionesModal({ open, onClose, grupoId, onVerBultos }: Props) {
  const { data: versiones, isLoading, isError } = useRotuloVersionesQuery(grupoId);

  return (
    <Modal open={open} onClose={onClose} title={<><span className="accent"><Icono n="reloj" /></span> Historial de versiones</>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cargando...</div>}
        {isError && <div style={{ fontSize: 12, color: 'var(--danger)' }}>Error al cargar el historial de versiones.</div>}
        {!isLoading && !isError && !versiones?.length && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin versiones.</div>}
        {versiones?.map(r => (
          <div key={r.id} style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <strong style={{ fontSize: 13, color: 'var(--blue)' }}>Versión {r.version}{r.vigente ? ' (actual)' : ''}</strong>
              <Button type="button" variant="ghost" size="sm" onClick={() => onVerBultos(r.id)}><Icono n="paquete" /> Ver bultos</Button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleString('es-AR')}</div>
            {r.motivo_edicion && <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4 }}><strong>Motivo:</strong> {r.motivo_edicion}</div>}
          </div>
        ))}
      </div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>Cerrar</Button>
      </div>
    </Modal>
  );
}
