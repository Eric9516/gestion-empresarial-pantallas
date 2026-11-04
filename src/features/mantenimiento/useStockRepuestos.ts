import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDatosDemo } from './almacenDemo';
import { leerStockPorCodigos } from './stockDeposito';
import type { RepuestoCritico, RepuestoLinea } from './tipos';

// Cruza los repuestos (críticos, de una OT o de una rutina) con el stock real del Depósito, por código.
// Se piden a la base solo los códigos que usa Mantenimiento (más los que se están cargando en pantalla).
// MODO DE EJEMPLO: al stock del Depósito se le restan los consumos registrados en Mantenimiento (al terminar
// una OT), así se ve el efecto del descuento sin tocar el Depósito real.
// PARA ERIC: con la base, el consumo es un retiro real y este cálculo pasa a ser solo el stock del repuesto.

export interface StockDeRepuesto {
  /** null = ese código no está en el Depósito. */
  stock: number | null;
  ubicacion: string | null;
  enDeposito: boolean;
  /** Hay menos de lo que hace falta. */
  falta: boolean;
}

const k = (codigo: string) => codigo.trim().toLowerCase();

/** `extra`: códigos que no están guardados todavía (por ejemplo, los de una OT que se está editando). */
export function useStockRepuestos(extra: string[] = []) {
  const d = useDatosDemo();
  const codigos = useMemo(() => {
    const todos = [
      ...d.repuestosCriticos.map(r => r.codigo),
      ...d.rutinas.flatMap(r => r.repuestos.map(x => x.codigo)),
      ...d.ordenes.filter(o => o.estado !== 'terminada').flatMap(o => o.repuestos.map(x => x.codigo)),
      ...extra,
    ].map(c => c.trim()).filter(Boolean);
    return [...new Set(todos)].sort();
  }, [d.repuestosCriticos, d.rutinas, d.ordenes, extra]);

  const { data, isLoading } = useQuery({
    queryKey: ['items', 'mantenimiento-stock', codigos.join('|')],
    enabled: codigos.length > 0,
    staleTime: 30_000,
    queryFn: () => leerStockPorCodigos(codigos),
  });
  const porCodigo = useMemo(() => new Map((data ?? []).map(i => [k(i.codigo), i])), [data]);
  const consumido = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of d.consumos) m.set(k(c.codigo), (m.get(k(c.codigo)) ?? 0) + c.cantidad);
    return m;
  }, [d.consumos]);

  return useMemo(() => {
    function stockDeCodigo(codigo: string): { stock: number | null; ubicacion: string | null } {
      const it = porCodigo.get(k(codigo));
      if (!it) return { stock: null, ubicacion: null };
      return { stock: Math.max(0, (it.stock ?? 0) - (consumido.get(k(codigo)) ?? 0)), ubicacion: it.ubicacion };
    }
    return {
      cargando: isLoading && codigos.length > 0,
      stockDeCodigo,
      /** Si el código está cargado en el Depósito (para saber si una línea se escribió a mano). */
      estaEnDeposito: (codigo: string) => porCodigo.has(k(codigo)),
      /** Para un repuesto crítico: falta si hay menos de lo que conviene tener (mínimo 1). */
      stockDe(r: Pick<RepuestoCritico, 'codigo' | 'cantidad'>): StockDeRepuesto {
        const s = stockDeCodigo(r.codigo);
        if (s.stock == null) return { stock: null, ubicacion: null, enDeposito: false, falta: false };
        return { ...s, enDeposito: true, falta: s.stock < Math.max(1, r.cantidad) };
      },
      /** Para una línea de OT o rutina: falta si el stock no alcanza para la cantidad prevista. */
      stockDeLinea(r: Pick<RepuestoLinea, 'codigo' | 'cantidad'>): StockDeRepuesto {
        const s = stockDeCodigo(r.codigo);
        if (!r.codigo.trim() || s.stock == null) return { stock: null, ubicacion: null, enDeposito: false, falta: false };
        return { ...s, enDeposito: true, falta: s.stock < r.cantidad };
      },
    };
  }, [porCodigo, consumido, isLoading, codigos.length]);
}

/** Qué líneas de la lista no tienen stock suficiente (para avisos). */
export function useFaltantes() {
  const { stockDeLinea } = useStockRepuestos();
  // Si el mismo repuesto está en varios renglones, el stock tiene que alcanzar para todos juntos.
  return useCallback((lineas: RepuestoLinea[]) => {
    const total = new Map<string, number>();
    for (const l of lineas) total.set(k(l.codigo), (total.get(k(l.codigo)) ?? 0) + l.cantidad);
    return lineas.filter(l => stockDeLinea({ codigo: l.codigo, cantidad: total.get(k(l.codigo)) ?? l.cantidad }).falta);
  }, [stockDeLinea]);
}
