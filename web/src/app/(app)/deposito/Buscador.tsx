'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Icono } from '@/components/Icono';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { Familia, Subfamilia } from '@/features/familias/tipos';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import type { Busqueda } from '~/lib/repuestos';

interface Props { familias: Familia[]; subfamilias: Subfamilia[]; busqueda: Busqueda; mostrarStock: boolean }

// La barra de búsqueda: cambia la dirección (?q=…) y el servidor trae los resultados. El texto se ve al instante y la búsqueda
// sale cuando la persona hace una pausa; mientras llega, se sigue viendo la lista anterior (no parpadea).
export default function Buscador({ familias, subfamilias, busqueda, mostrarStock }: Props) {
  const router = useRouter();
  const ruta = usePathname();
  const [buscando, empezar] = useTransition();
  const [texto, setTexto] = useState(busqueda.texto);
  const conPausa = useDebouncedValue(texto, 250);

  // Una búsqueda nueva vuelve a la primera tanda y apaga la columna de stock (es puntual a cada búsqueda, como en la app de siempre).
  function ir(cambios: { q?: string; familia?: string; sub?: string; stock?: boolean }) {
    const q = cambios.q ?? busqueda.texto, familia = cambios.familia ?? busqueda.familiaId, sub = cambios.sub ?? busqueda.subfamiliaId;
    const stock = cambios.stock ?? false;
    const p = new URLSearchParams(Object.entries({ q: q.trim(), familia, sub, stock: stock ? '1' : '' }).filter(([, v]) => v));
    empezar(() => router.replace(p.size ? `${ruta}?${p}` : ruta, { scroll: false }));
  }

  useEffect(() => {
    if (conPausa.trim() !== busqueda.texto.trim()) ir({ q: conPausa });
    // solo cuando termina la pausa de lo que se escribe
  }, [conPausa]);

  const subfamiliasDeLaFamilia = useMemo(
    () => subfamilias.filter(s => !busqueda.familiaId || s.familia_id === busqueda.familiaId),
    [subfamilias, busqueda.familiaId],
  );
  const sinFiltro = !texto.trim() && !busqueda.familiaId && !busqueda.subfamiliaId;
  const esperando = buscando || texto.trim() !== conPausa.trim();

  return (
    <>
      <div className="toolbar">
        <div className="search-wrap">
          <Input type="text" placeholder="Código, número o descripción..." aria-label="Buscar" value={texto} onChange={e => setTexto(e.target.value)} autoFocus />
        </div>
        <Select className="filter-select" aria-label="Familia" value={busqueda.familiaId} onChange={e => ir({ familia: e.target.value, sub: '' })}>
          <option value="">Todas las familias</option>
          {familias.map(f => <option key={f.id} value={f.id}>{f.nombre} ({f.codigo})</option>)}
        </Select>
        <Select className="filter-select" aria-label="Subfamilia" value={busqueda.subfamiliaId} onChange={e => ir({ sub: e.target.value })}>
          <option value="">Todas las subfamilias</option>
          {subfamiliasDeLaFamilia.map(s => <option key={s.id} value={s.id}>{s.nombre} ({s.codigo})</option>)}
        </Select>
        {!sinFiltro && (
          <Button variant="ghost" size="sm" onClick={() => ir({ stock: !mostrarStock })}>
            <Icono n="paquete" /> {mostrarStock ? 'Ocultar stock' : 'Stock'}
          </Button>
        )}
      </div>
      {!sinFiltro && esperando && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}><Icono n="buscar" /> Buscando...</p>}
    </>
  );
}
