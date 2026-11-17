import { useState } from 'react';
import Modal from './Modal';
import { useToast } from './ToastProvider';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

/** Mandar una sugerencia (`enviar`: cada app a su manera). La comparten la app de Vite y la de Next. */
export default function SugerenciaModal({ open, onClose, enviar }: { open: boolean; onClose: () => void; enviar: (mensaje: string) => Promise<void> }) {
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const toast = useToast();

  function handleClose() {
    setMensaje('');
    onClose();
  }

  async function handleEnviar() {
    if (!mensaje.trim()) { toast('Escribí algo antes de enviar', 'error'); return; }
    setEnviando(true);
    try {
      await enviar(mensaje.trim());
      toast('¡Gracias! Tu sugerencia fue enviada', 'success');
      handleClose();
    } catch (e) {
      toast('Error al enviar: ' + mensajeDeError(e), 'error');
    } finally {
      setEnviando(false);
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
          <Button variant="success" disabled={enviando} onClick={() => void handleEnviar()}>
            {enviando ? 'Enviando...' : 'Enviar'}
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
