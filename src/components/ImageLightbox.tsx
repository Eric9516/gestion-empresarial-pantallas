import { Dialog } from 'radix-ui';
import { Icono } from '@/components/Icono';

// Visor para ver una foto ampliada (p.ej. fotos de repuestos). Se separa del Modal
// genérico a propósito: ese tiene barra de título y un ancho máximo pensado para
// formularios, no para mostrar una imagen grande. Es un diálogo accesible: se cierra
// con Esc (solo el visor, no la ventana que tenga debajo) y con un clic afuera.
export default function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <Dialog.Root open onOpenChange={abierto => { if (!abierto) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, cursor: 'zoom-out',
          }}
        >
          <Dialog.Content aria-describedby={undefined} onClick={onClose} style={{ outline: 'none' }}>
            <Dialog.Title className="sr-only">Foto ampliada</Dialog.Title>
            <img
              src={url}
              alt=""
              style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}
            />
          </Dialog.Content>
          <Dialog.Close
            aria-label="Cerrar"
            style={{
              position: 'fixed', top: 16, right: 16, width: 38, height: 38, borderRadius: '50%',
              border: 'none', background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 18,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          ><Icono n="cerrar" /></Dialog.Close>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
