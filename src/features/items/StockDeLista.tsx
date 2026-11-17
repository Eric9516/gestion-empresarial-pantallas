import { Icono } from '@/components/Icono';

/**
 * El stock de un repuesto en las tarjetas de la lista (celular): el ícono de paquete, el mismo del botón que muestra el stock, y el número.
 * Sin la palabra, entra en una línea al lado del código; el lector de pantalla igual dice "Stock".
 */
export default function StockDeLista({ stock }: { stock: number | null | undefined }) {
  return (
    <span className="badge badge-rubro" title="Stock" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
      <Icono n="paquete" />
      <span className="solo-lector">Stock:</span>
      {stock ?? '—'}
    </span>
  );
}
