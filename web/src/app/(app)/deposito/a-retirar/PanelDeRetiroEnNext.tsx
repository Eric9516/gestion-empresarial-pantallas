'use client';
import { useEffect, useState } from 'react';
import type { Sector } from '@/features/sectores/tipos';
import PanelDeRetiro from '@/features/retiros/PanelDeRetiro';
import { useRetiroCart } from '@/features/retiros/RetiroCartContext';
import { confirmarRetiro, stockDe, verificarStock } from '../acciones';

// El mismo panel de la app de Vite, con los datos y las acciones del servidor propio.
export default function PanelDeRetiroEnNext({ sectores }: { sectores: Sector[] }) {
  const { cart } = useRetiroCart();
  const [stockPorId, setStockPorId] = useState(new Map<string, number | null>());
  // el stock de ahora, solo de lo que hay en el carrito: al abrir y cada vez que cambia qué repuestos hay
  const ids = cart.map(c => c.item_id).sort().join(',');
  useEffect(() => {
    if (!ids) return;
    let vigente = true;
    void stockDe(ids.split(',')).then(s => { if (vigente) setStockPorId(new Map(Object.entries(s))); });
    return () => { vigente = false; };
  }, [ids]);

  return (
    <PanelDeRetiro
      sectores={sectores}
      stockPorId={stockPorId}
      verificarStock={verificarStock}
      confirmar={async r => {
        const { error } = await confirmarRetiro(r);
        if (error) throw new Error(error);
      }}
    />
  );
}
