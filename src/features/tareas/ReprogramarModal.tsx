import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { useReprogramarTarea } from './useTareas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  taskId: string | null;
  onReprogramada: () => void;
}

export default function ReprogramarModal({ open, onClose, taskId, onReprogramada }: Props) {
  const toast = useToast();
  const reprogramar = useReprogramarTarea();
  const [fecha, setFecha] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setFecha(''); }, [open]);

  async function handleGuardar() {
    if (!taskId) return;
    if (!fecha) { toast('Seleccioná una fecha', 'error'); return; }
    setSaving(true);
    try {
      await reprogramar.mutateAsync({ taskId, fecha });
      toast('Tarea reprogramada', 'success');
      onClose();
      onReprogramada();
    } catch (e) {
      toast('Error: ' + mensajeDeError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={<><span className="accent"><Icono n="fecha" /></span> Reprogramar</>}>
      <div className="form-group">
        <label htmlFor="reprogramar-modal-1">Nueva fecha asignada</label>
        <Input id="reprogramar-modal-1" type="date" value={fecha} min={fechaHoyISO()} onChange={e => setFecha(e.target.value)} />
      </div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={() => void handleGuardar()} disabled={saving}>Reprogramar</Button>
      </div>
    </Modal>
  );
}
