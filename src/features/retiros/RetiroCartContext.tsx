import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAlCambiar } from '../../lib/useAlCambiar';
import type { Item } from '../items/tipos';

// De cada repuesto el carrito solo necesita estos tres datos (así sirve tanto con un resultado de búsqueda como con el repuesto completo).
export type RepuestoParaElCarrito = Pick<Item, 'id' | 'codigo' | 'descripcion'>;

export interface RetiroCartLine {
  item_id: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  observacion: string;
}

interface CartState {
  cart: RetiroCartLine[];
  addItem: (item: RepuestoParaElCarrito) => void;
  updateCantidad: (itemId: string, cantidad: number) => void;
  updateObservacion: (itemId: string, observacion: string) => void;
  removeItem: (itemId: string) => void;
  clear: () => void;
}

const RetiroCartContext = createContext<CartState | undefined>(undefined);

// (para useSyncExternalStore: "ya se hidrató" no cambia nunca después, no hay a qué suscribirse)
const sinSuscripcion = () => () => {};

// Igual que retiroCartPendiente_${userId} en la app vieja: escapado por usuario
// para que en una compu/tablet compartida del depósito nadie herede el carrito
// de otro sin darse cuenta.
function cartKey(userId: string | undefined) {
  return `retiroCartPendiente_${userId ?? 'anon'}`;
}

// Recibe de quién es la sesión (lo sabe cada app a su manera: Supabase en la de Vite, el servidor en la de Next).
export function RetiroCartProvider({ usuarioId, children }: { usuarioId: string | undefined; children: ReactNode }) {
  const [cart, setCart] = useState<RetiroCartLine[]>([]);
  // De quién es el carrito que ya se leyó: hasta leerlo no se guarda nada (no pisa lo guardado con el carrito vacío del arranque).
  const [leidoDe, setLeidoDe] = useState<string | undefined | null>(null);
  // En Next la pantalla llega armada del servidor, que no tiene el carrito: el primer dibujo del navegador tiene que coincidir con ese (si no,
  // React rehace toda la pantalla), así que se lee recién al terminar de "hidratar". En la de Vite no hay servidor: se lee de entrada.
  const hidratado = useSyncExternalStore(sinSuscripcion, () => true, () => false);

  useAlCambiar([usuarioId, hidratado], () => {
    if (!hidratado) return;
    let guardado: RetiroCartLine[] = [];
    try {
      const raw = localStorage.getItem(cartKey(usuarioId));
      if (raw) guardado = JSON.parse(raw) as RetiroCartLine[];
    } catch { /* sin carrito guardado */ }
    setCart(guardado);
    setLeidoDe(usuarioId);
  });

  useEffect(() => {
    if (leidoDe !== usuarioId) return;
    try { localStorage.setItem(cartKey(usuarioId), JSON.stringify(cart)); } catch { /* noop */ }
  }, [cart, usuarioId, leidoDe]);

  function addItem(item: RepuestoParaElCarrito) {
    setCart(prev => {
      const existing = prev.find(c => c.item_id === item.id);
      if (existing) {
        return prev.map(c => (c.item_id === item.id ? { ...c, cantidad: c.cantidad + 1 } : c));
      }
      return [...prev, { item_id: item.id, codigo: item.codigo, descripcion: item.descripcion, cantidad: 1, observacion: '' }];
    });
  }

  function updateCantidad(itemId: string, cantidad: number) {
    setCart(prev => prev.map(c => (c.item_id === itemId ? { ...c, cantidad: cantidad > 0 ? cantidad : 1 } : c)));
  }

  function updateObservacion(itemId: string, observacion: string) {
    setCart(prev => prev.map(c => (c.item_id === itemId ? { ...c, observacion } : c)));
  }

  function removeItem(itemId: string) {
    setCart(prev => prev.filter(c => c.item_id !== itemId));
  }

  function clear() {
    setCart([]);
    try { localStorage.removeItem(cartKey(usuarioId)); } catch { /* noop */ }
  }

  return (
    <RetiroCartContext.Provider value={{ cart, addItem, updateCantidad, updateObservacion, removeItem, clear }}>
      {children}
    </RetiroCartContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components -- el hook que lee este contexto va junto a su proveedor a propósito
export function useRetiroCart() {
  const ctx = useContext(RetiroCartContext);
  if (!ctx) throw new Error('useRetiroCart debe usarse dentro de <RetiroCartProvider>');
  return ctx;
}
