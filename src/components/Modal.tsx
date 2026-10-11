import { useRef, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { Icono } from '@/components/Icono';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  large?: boolean;
}

// Ventana accesible (Radix Dialog): rol "dialog", se cierra con Esc, el foco queda
// atrapado adentro y vuelve al botón que la abrió. Conserva el aspecto de siempre
// (clases .modal-*); cuando se cambie el diseño, se cambia solo acá.
export default function Modal({ open, onClose, title, children, footer, large }: ModalProps) {
  const contenidoRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog.Root open={open} onOpenChange={abierto => { if (!abierto) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay open">
          <Dialog.Content
            ref={contenidoRef}
            className={`modal${large ? ' modal-lg' : ''}`}
            aria-describedby={undefined}
            onEscapeKeyDown={e => {
              // Con un menú o una lista desplegable abierta adentro, Esc cierra primero eso.
              if ((e.target as HTMLElement | null)?.closest?.('[role="menu"], [role="combobox"][aria-expanded="true"]')) e.preventDefault();
            }}
            onOpenAutoFocus={e => {
              // El foco va al campo marcado con data-autofocus; si no hay, a la ventana
              // (y no al botón de cerrar, que cerraría todo con un Enter apurado).
              // React autoFocus no sirve acá: al abrir una ventana sobre otra, la de
              // abajo le devuelve el foco a lo que tenía antes.
              e.preventDefault();
              const contenido = contenidoRef.current;
              if (!contenido) return;
              (contenido.querySelector<HTMLElement>('[data-autofocus]') ?? contenido).focus();
            }}
          >
            <div className="modal-header">
              <Dialog.Title asChild><div className="modal-title">{title}</div></Dialog.Title>
              <Dialog.Close asChild><button type="button" className="btn-close" aria-label="Cerrar"><Icono n="cerrar" /></button></Dialog.Close>
            </div>
            <div>{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
