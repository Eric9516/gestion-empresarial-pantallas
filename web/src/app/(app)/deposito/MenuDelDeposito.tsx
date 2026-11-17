'use client';
import type { PosicionMenu } from '@/lib/preferencias';
import { useRetiroCart } from '@/features/retiros/RetiroCartContext';
import MenuCelular from '~/componentes/MenuCelular';
import MenuDeSecciones from '~/componentes/MenuDeSecciones';
import type { DatosDeUsuario } from '~/componentes/MenuDeUsuario';
import type { ItemDeMenu, SeccionDeMenu } from '~/componentes/menu';

interface Props { secciones: SeccionDeMenu[]; pie: ItemDeMenu[]; inicio: string; posicion: PosicionMenu; fijo: boolean; usuario: DatosDeUsuario; enCelular?: boolean }

// Los menús del Depósito con el número de "A retirar" (lo que hay en el carrito, que vive en el navegador).
export default function MenuDelDeposito({ secciones, pie, inicio, posicion, fijo, usuario, enCelular }: Props) {
  const { cart } = useRetiroCart();
  const conCantidad = secciones.map(s => ({ ...s, items: s.items.map(i => (i.clave === 'carrito' ? { ...i, cantidad: cart.length } : i)) }));
  return enCelular
    ? <MenuCelular secciones={conCantidad} pie={pie} inicio={inicio} usuario={usuario} />
    : <MenuDeSecciones secciones={conCantidad} pie={pie} inicio={inicio} posicion={posicion} fijo={fijo} />;
}
