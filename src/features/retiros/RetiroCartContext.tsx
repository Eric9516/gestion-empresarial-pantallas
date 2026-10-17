import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAlCambiar } from '../../lib/useAlCambiar';
import { useAuth } from '../../auth/AuthContext';
import type { Item } from '../items/useItems';

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

// Igual que retiroCartPendiente_${userId} en la app vieja: escapado por usuario
// para que en una compu/tablet compartida del depósito nadie herede el carrito
// de otro sin darse cuenta.
function cartKey(userId: string | undefined) {
  return `retiroCartPendiente_${userId ?? 'anon'}`;
}

export function RetiroCartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<RetiroCartLine[]>([]);

  useAlCambiar([user?.id], () => {
    try {
      const raw = localStorage.getItem(cartKey(user?.id));
      setCart(raw ? (JSON.parse(raw) as RetiroCartLine[]) : []);
    } catch {
      setCart([]);
    }
  });

  useEffect(() => {
    try { localStorage.setItem(cartKey(user?.id), JSON.stringify(cart)); } catch { /* noop */ }
  }, [cart, user?.id]);

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
    try { localStorage.removeItem(cartKey(user?.id)); } catch { /* noop */ }
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
