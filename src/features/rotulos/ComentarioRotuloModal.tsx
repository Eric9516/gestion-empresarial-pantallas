import { useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { useServicioDeEnvios } from './servicioDeEnvios';
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
  const { guardarComentario, registrarError } = useServicioDeEnvios();
  const [guardando, setGuardando] = useState(false);
  const [texto, setTexto] = useState('');
  // Cuando cambia el envío o su comentario, el cuadro se vuelve a llenar con lo guardado (se ajusta al dibujar, sin efectos).
  const origen = rotuloId ? `${rotuloId}|${comentarioActual ?? ''}` : null;
  const [origenCargado, setOrigenCargado] = useState<string | null>(null);
  if (origen !== origenCargado) {
    setOrigenCargado(origen);
    if (origen) setTexto(comentarioActual ?? '');
  }

  if (!rotuloId) return null;

  async function guardar(comentario: string, hecho: string, error: string) {
    setGuardando(true);
    try {
      await guardarComentario(rotuloId!, comentario);
      toast(hecho, 'success');
      onClose();
    } catch (err) {
      await registrarError(`Error al ${error} el comentario de un envío`, err);
      toast(`No se pudo ${error} el comentario`, 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function handleGuardar() {
    await guardar(texto, 'Comentario guardado', 'guardar');
  }

  async function handleBorrar() {
    if (!(await confirmar('¿Borrar este comentario?', { textoConfirmar: 'Borrar', peligroso: true }))) return;
    await guardar('', 'Comentario borrado', 'borrar');
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
          {comentarioActual && <Button variant="dangerGhost" disabled={guardando} onClick={() => void handleBorrar()}>Borrar</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={guardando} onClick={() => void handleGuardar()}>Guardar</Button>
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
