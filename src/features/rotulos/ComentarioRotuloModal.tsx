import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { useGuardarComentarioRotulo } from './useRotulos';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Icono } from '@/components/Icono';

interface Props {
  rotuloId: string | null;
  comentarioActual: string | null;
  puedeEditar: boolean;
  onClose: () => void;
}

// Nota libre y opcional por envío. Visible para cualquiera; solo un admin de
// Directorio puede escribirla, cambiarla o borrarla.
export default function ComentarioRotuloModal({ rotuloId, comentarioActual, puedeEditar, onClose }: Props) {
  const toast = useToast();
  const confirmar = useConfirm();
  const guardar = useGuardarComentarioRotulo();
  const [texto, setTexto] = useState('');

  useEffect(() => {
    if (rotuloId) setTexto(comentarioActual ?? '');
  }, [rotuloId, comentarioActual]);

  if (!rotuloId) return null;

  async function handleGuardar() {
    try {
      await guardar.mutateAsync({ id: rotuloId!, comentario: texto });
      toast('Comentario guardado', 'success');
      onClose();
    } catch (err) {
      await registrarErrorAccion('Error al guardar el comentario de un envío', err);
      toast('No se pudo guardar el comentario', 'error');
    }
  }

  async function handleBorrar() {
    if (!(await confirmar('¿Borrar este comentario?', { textoConfirmar: 'Borrar', peligroso: true }))) return;
    try {
      await guardar.mutateAsync({ id: rotuloId!, comentario: '' });
      toast('Comentario borrado', 'success');
      onClose();
    } catch (err) {
      await registrarErrorAccion('Error al borrar el comentario de un envío', err);
      toast('No se pudo borrar el comentario', 'error');
    }
  }

  if (!puedeEditar) {
    return (
      <Modal open onClose={onClose} title={<><Icono n="mensaje" /> Comentario</>} footer={<Button variant="ghost" onClick={onClose}>Cerrar</Button>}>
        <p style={{ fontSize: 14, color: 'var(--text-mid)', whiteSpace: 'pre-wrap' }}>
          {comentarioActual || 'Sin comentario.'}
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={<><Icono n="mensaje" /> Comentario</>}
      footer={
        <>
          {comentarioActual && <Button variant="dangerGhost" disabled={guardar.isPending} onClick={() => void handleBorrar()}>Borrar</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={guardar.isPending} onClick={() => void handleGuardar()}>Guardar</Button>
        </>
      }
    >
      <Textarea
        rows={4}
        data-autofocus
        placeholder="Ej: el proveedor avisó que llega con demora..."
        value={texto}
        onChange={e => setTexto(e.target.value)}
        style={{ width: '100%' }}
      />
    </Modal>
  );
}
