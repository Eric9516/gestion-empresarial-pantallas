import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useResetPasswordUsuario } from './useUsuarios';
import type { Usuario } from './useUsuarios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mensajeDeError } from '@/lib/errores';

interface Props {
  open: boolean;
  onClose: () => void;
  usuario: Usuario | null;
}

export default function ResetPasswordModal({ open, onClose, usuario }: Props) {
  const toast = useToast();
  const resetPassword = useResetPasswordUsuario();
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setPassword(''); }, [open]);

  async function handleGuardar() {
    if (!usuario) return;
    if (password.length < 6) { toast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }
    setSaving(true);
    try {
      await resetPassword.mutateAsync({ id: usuario.id, password });
      toast('Contraseña actualizada', 'success');
      onClose();
    } catch (e) {
      toast('Error: ' + mensajeDeError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!usuario) return null;

  return (
    <Modal open={open} onClose={onClose} title="Restablecer contraseña">
      <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 14 }}>
        Nueva contraseña para <strong>{usuario.nombre} {usuario.apellido}</strong> ({usuario.email}). Comunicásela vos directamente — no se envía ningún mail.
      </p>
      <div className="form-group">
        <label htmlFor="reset-password-modal-1">Contraseña nueva</label>
        <Input id="reset-password-modal-1" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="success" onClick={() => void handleGuardar()} disabled={saving}>Guardar</Button>
      </div>
    </Modal>
  );
}
