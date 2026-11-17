import Modal from '../../components/Modal';
import FichaDeUsuario from './FichaDeUsuario';
import type { Usuario } from './tipos';

interface Props {
  open: boolean;
  onClose: () => void;
  usuario: Usuario | null;
}

// La ficha de una persona en una ventana flotante (la app de Vite). La app de Next la abre en una página propia: ver FichaDeUsuario.
export default function UsuarioForm({ open, onClose, usuario }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={usuario ? 'Editar Usuario' : 'Nuevo Usuario'}>
      <FichaDeUsuario usuario={usuario} activa={open} alTerminar={() => onClose()} />
    </Modal>
  );
}
