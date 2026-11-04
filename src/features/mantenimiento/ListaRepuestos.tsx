import { useStockRepuestos } from './useStockRepuestos';
import type { RepuestoLinea } from './tipos';
import { Icono } from '@/components/Icono';

interface Props {
  lineas: RepuestoLinea[];
  /** "previsto": OT abierta o rutina, con el stock al lado. "usado": OT terminada o historial. */
  modo: 'previsto' | 'usado';
}

// Lista corta (solo lectura) de repuestos con su componente. En una OT abierta muestra si hay stock.
export default function ListaRepuestos({ lineas, modo }: Props) {
  const { stockDeLinea } = useStockRepuestos();
  if (!lineas.length) return null;
  // Lo que pide toda la lista de cada código (si el mismo repuesto está en dos componentes).
  const total = new Map<string, number>();
  for (const l of lineas) total.set(l.codigo.trim().toLowerCase(), (total.get(l.codigo.trim().toLowerCase()) ?? 0) + l.cantidad);
  return (
    <ul className="mt-lineas-rep">
      {lineas.map(l => {
        const s = modo === 'previsto' ? stockDeLinea({ codigo: l.codigo, cantidad: total.get(l.codigo.trim().toLowerCase()) ?? l.cantidad }) : null;
        const cantidad = modo === 'usado' && l.usado != null ? l.usado : l.cantidad;
        return (
          <li key={l.id}>
            {l.componente && <span className="comp">{l.componente}:</span>}
            <span>{cantidad} ×</span>
            {l.codigo && <span className="cod">{l.codigo}</span>}
            {l.descripcion && <span>{l.descripcion}</span>}
            {modo === 'usado' && l.usado != null && l.usado !== l.cantidad && l.cantidad > 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{l.usado === 0 ? '(no se cambió)' : `(previstos ${l.cantidad})`}</span>
            )}
            {s?.enDeposito && (s.falta
              ? <span className="mt-tag falta"><Icono n="alerta" /> Falta: hay {s.stock}</span>
              : <span className="mt-rep-stock ok" style={{ fontSize: 12 }}>hay {s.stock}</span>)}
            {s && !s.enDeposito && l.codigo && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>(no está en el Depósito)</span>}
          </li>
        );
      })}
    </ul>
  );
}
