import type { ReactNode } from 'react';
import { useVistaDeLista } from '../lib/useVistaDeLista';

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  renderCard: (row: T) => ReactNode;
  keyField: (row: T) => string;
  emptyIcon: ReactNode;
  emptyTitle: string;
  emptyDescription: string;
}

// Tabla en desktop, tarjetas en mobile — mismo dato, dos vistas, una sola vez.
// La app vieja repetía esto a mano en cada pantalla (Proveedores, Comisionistas,
// Repuestos, Historial); acá es un solo componente que todas comparten, y por eso
// mismo ninguna se puede "olvidar" la vista mobile como pasó la primera vez.
// El CSS (.table-wrap / .prov-cards) muestra una u otra según el ancho de pantalla, y además solo se dibuja la que se ve (useVistaDeLista, mismo
// punto de corte): con cientos de filas, dibujar las dos duplicaba el trabajo. Si el navegador no permite saber el ancho, se dibujan las dos como antes.
export default function ResponsiveList<T>({ columns, data, renderCard, keyField, emptyIcon, emptyTitle, emptyDescription }: Props<T>) {
  const vista = useVistaDeLista();
  if (!data.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">{emptyIcon}</div>
        <h2>{emptyTitle}</h2>
        <p>{emptyDescription}</p>
      </div>
    );
  }

  return (
    <>
      {vista !== 'tarjetas' && <div className="table-wrap">
        <table>
          <thead>
            <tr>{columns.map(c => <th key={c.header}>{c.header || <span className="sr-only">Acciones</span>}</th>)}</tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={keyField(row)}>
                {columns.map(c => <td key={c.header}>{c.render(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
      {vista !== 'tabla' && <div className="prov-cards">
        {data.map(row => <div key={keyField(row)}>{renderCard(row)}</div>)}
      </div>}
    </>
  );
}
