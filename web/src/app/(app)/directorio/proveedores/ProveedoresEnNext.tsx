'use client';
import { useState } from 'react';
import PantallaDeProveedores from '@/features/proveedores/PantallaDeProveedores';
import { ConflictoDeEdicion } from '@/lib/conflicto';
import type { Proveedor } from '@/features/proveedores/tipos';
import { usePedido } from '@/lib/usePedido';
import { type DatosIniciales, useInicial } from '~/lib/useInicial';
import { RotuloEnNext } from '~/componentes/envios/ConEnvios';
import { eliminarProveedor, guardarProveedor, listaDeProveedores } from '../acciones';

// La misma pantalla de la app de Vite, con los datos y las acciones del servidor propio. "Rótulo", si la empresa usa Envíos.
export default function ProveedoresEnNext({ admin, conEnvios, iniciales }: { admin: boolean; conEnvios: boolean; iniciales: DatosIniciales<Proveedor[]> }) {
  const [revision, setRevision] = useState(0);
  const lista = usePedido(`proveedores|${revision}`, listaDeProveedores, true, useInicial(iniciales));
  const recargar = () => setRevision(v => v + 1);
  return (
    <PantallaDeProveedores
      proveedores={lista.data} isLoading={lista.data === undefined && !lista.error} isError={!!lista.error} admin={admin}
      guardar={async g => {
        const r = await guardarProveedor(g);
        // si alguien lo cambió en el medio, se vuelve a leer la lista (el formulario avisa y se cierra, como en la app de Vite)
        if (r.conflicto) { recargar(); throw new ConflictoDeEdicion('este proveedor'); }
        if (r.error) throw new Error(r.error);
        recargar();
      }}
      eliminar={async id => {
        const { error } = await eliminarProveedor(id);
        if (error) throw new Error(error);
        recargar();
      }}
      Rotulo={conEnvios ? RotuloEnNext : null}
    />
  );
}
