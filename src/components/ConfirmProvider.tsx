import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import Modal from './Modal';
import { Button } from '@/components/ui/button';

export interface OpcionesConfirmar {
  titulo?: string;
  textoConfirmar?: string; // Ej: "Eliminar" en vez de "Confirmar" — el botón dice lo que realmente va a pasar.
  peligroso?: boolean; // Botón rojo para acciones que borran o no se pueden deshacer.
}

type ConfirmarFn = (mensaje: string, opciones?: OpcionesConfirmar) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmarFn | undefined>(undefined);

interface Pedido extends OpcionesConfirmar { mensaje: string }

// Modal propio para reemplazar el confirm() nativo del navegador (feo y sin
// estilo). Se usa como Promise<boolean> para que el código que lo llama quede
// igual de simple que antes: `if (!(await confirmar('¿Eliminar?'))) return;`
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirmar = useCallback<ConfirmarFn>((mensaje, opciones) => {
    return new Promise(resolve => {
      resolverRef.current = resolve;
      setPedido({ mensaje, ...opciones });
    });
  }, []);

  function responder(valor: boolean) {
    resolverRef.current?.(valor);
    resolverRef.current = null;
    setPedido(null);
  }

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      {pedido && (
        <Modal
          open
          onClose={() => responder(false)}
          title={pedido.titulo || 'Confirmar'}
          footer={
            <>
              <Button variant="ghost" onClick={() => responder(false)}>Cancelar</Button>
              <Button variant={pedido.peligroso ? 'red' : 'primary'} onClick={() => responder(true)} data-autofocus>
                {pedido.textoConfirmar || 'Confirmar'}
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-mid)', whiteSpace: 'pre-wrap' }}>{pedido.mensaje}</p>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components -- el hook que lee este contexto va junto a su proveedor a propósito
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>');
  return ctx;
}
