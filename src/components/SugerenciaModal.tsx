import { useState } from 'react';
import Modal from './Modal';
import { useToast } from './ToastProvider';
import { useEnviarSugerencia } from '../features/admin/useSugerencias';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

export default function SugerenciaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mensaje, setMensaje] = useState('');
  const enviar = useEnviarSugerencia();
  const toast = useToast();

  function handleClose() {
    setMensaje('');
    onClose();
  }

  async function handleEnviar() {
    if (!mensaje.trim()) { toast('Escribí algo antes de enviar', 'error'); return; }
    try {
      await enviar.mutateAsync(mensaje.trim());
      toast('¡Gracias! Tu sugerencia fue enviada', 'success');
      handleClose();
    } catch (e) {
      toast('Error al enviar: ' + mensajeDeError(e), 'error');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={<><Icono n="idea" /> Enviar sugerencia</>}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
          <Button variant="success" disabled={enviar.isPending} onClick={() => void handleEnviar()}>
            {enviar.isPending ? 'Enviando...' : 'Enviar'}
          </Button>
        </>
      }
    >
      <div className="form-group full">
        <label htmlFor="sugerencia-modal-1">¿Qué se te ocurre para mejorar el sistema?</label>
        <Textarea id="sugerencia-modal-1" rows={4} placeholder="Escribí tu idea o sugerencia acá..." value={mensaje} onChange={e => setMensaje(e.target.value)} data-autofocus />
      </div>
    </Modal>
  );
}
