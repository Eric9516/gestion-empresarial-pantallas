'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import Copiable from '@/components/Copiable';
import { Icono } from '@/components/Icono';
import ResponsiveList, { type Column } from '@/components/ResponsiveList';
import { useToast } from '@/components/ToastProvider';
import { Button } from '@/components/ui/button';
import type { RepuestoDeLista } from '@/features/items/tipos';
import { useRetiroCart } from '@/features/retiros/RetiroCartContext';
import { clicConTeclado } from '@/lib/clicConTeclado';
import Miniatura from '~/componentes/Miniatura';
import StockDeLista from '@/features/items/StockDeLista';

// conRetiro: los operarios retiran de este depósito (lo decide Compras); si no, la lista no ofrece "Retirar"
interface Props { repuestos: RepuestoDeLista[]; mostrarStock: boolean; catalogoVacio: boolean; conRetiro: boolean }

// Los resultados: tabla en la computadora y tarjetas en el celular (el mismo componente que la app de Vite), con el botón de copiar al lado
// del código y de la descripción y "Retirar". Al tocar un repuesto se abre su detalle (?ver=…, así también se puede compartir o recargar).
export default function ListaDeRepuestos({ repuestos, mostrarStock, catalogoVacio, conRetiro }: Props) {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();
  const { cart, addItem } = useRetiroCart();
  const toast = useToast();
  const enCarrito = useMemo(() => new Set(cart.map(c => c.item_id)), [cart]);

  function ver(id: string) {
    const p = new URLSearchParams(parametros);
    p.set('ver', id);
    router.push(`${ruta}?${p}`, { scroll: false });
  }
  function retirar(it: RepuestoDeLista) {
    addItem(it);
    toast(`${it.codigo} agregado al carrito`, 'success');
  }
  const botonRetirar = (it: RepuestoDeLista) => (
    <Button variant="primary" size="sm" onClick={() => retirar(it)}>
      {enCarrito.has(it.id) ? <><Icono n="ok" /> Agregado</> : <><Icono n="retirar" /> Retirar</>}
    </Button>
  );

  const columnas: Column<RepuestoDeLista>[] = [
    {
      header: 'Código', render: it => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {/* lo que abre el repuesto va aparte del botón de copiar (un botón no puede ir adentro de otro) */}
          <Copiable texto={it.codigo} que="código"><strong style={{ cursor: 'pointer' }} {...clicConTeclado(() => ver(it.id))}>{it.codigo}</strong></Copiable>
          {it.foto_url && <Miniatura onClick={() => ver(it.id)} url={it.foto_url} style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0, cursor: 'pointer' }} />}
        </div>
      ),
    },
    { header: 'Descripción', render: it => <span style={{ cursor: 'pointer' }} onClick={() => ver(it.id)}><Copiable texto={it.descripcion} que="descripción" /></span> },
    ...(mostrarStock ? [{ header: 'Stock', render: (it: RepuestoDeLista) => <span>{it.stock ?? '-'}</span> }] : []),
    ...(conRetiro ? [{ header: '', render: (it: RepuestoDeLista) => <div className="td-actions" style={{ flexWrap: 'nowrap' }}>{botonRetirar(it)}</div> }] : []),
  ];

  const tarjeta = (it: RepuestoDeLista) => (
    <div className="prov-card">
      <div className="prov-card-header" onClick={() => ver(it.id)} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, width: '100%' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="prov-card-name"><Copiable texto={it.codigo} que="código"><span {...clicConTeclado(() => ver(it.id))}>{it.codigo}</span></Copiable></div>
            <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2, lineHeight: '16px', minHeight: 32 }}><Copiable texto={it.descripcion} que="descripción" /></div>
          </div>
          {it.foto_url && <Miniatura url={it.foto_url} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
        </div>
        {mostrarStock && <StockDeLista stock={it.stock} />}
      </div>
      {conRetiro && <div className="prov-card-actions">{botonRetirar(it)}</div>}
    </div>
  );

  return (
    <ResponsiveList
      columns={columnas}
      data={repuestos}
      renderCard={tarjeta}
      keyField={it => it.id}
      emptyIcon={<Icono n="herramienta" />}
      emptyTitle={catalogoVacio ? 'Todavía no hay artículos cargados' : 'Sin resultados'}
      emptyDescription={catalogoVacio ? 'Cargá el primer artículo del depósito.' : 'Probá con otro código, número o filtro.'}
    />
  );
}
