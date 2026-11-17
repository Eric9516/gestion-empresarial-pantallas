'use client';
import type { Familia, Subfamilia } from '@/features/familias/tipos';
import FormularioDeRepuesto from '@/features/items/FormularioDeRepuesto';
import type { Item } from '@/features/items/tipos';
import { ACCIONES_DE_MOVIMIENTO, ACCIONES_DE_REPUESTO } from './accionesEnElNavegador';

/** `letra`: la del depósito en el que se está (la primera letra de los códigos nuevos). */
export interface DatosDelFormulario { familias: Familia[]; subfamilias: Subfamilia[]; puedeCambiarStock: boolean; letra?: string }

// El formulario del repuesto (el mismo de la app de Vite) con las acciones del servidor. Al guardar, el servidor vuelve a dibujar la pantalla.
export default function FormularioEnNext({ open, onClose, item, datos }: { open: boolean; onClose: () => void; item: Item | null; datos: DatosDelFormulario }) {
  return (
    <FormularioDeRepuesto open={open} onClose={onClose} item={item} familias={datos.familias} subfamilias={datos.subfamilias}
      puedeCambiarStock={datos.puedeCambiarStock} letra={datos.letra} acciones={ACCIONES_DE_REPUESTO} accionesDeMovimiento={ACCIONES_DE_MOVIMIENTO} />
  );
}
