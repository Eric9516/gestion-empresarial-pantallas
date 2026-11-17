'use client';
import { useState } from 'react';
import PantallaDeComisionistas from '@/features/comisionistas/PantallaDeComisionistas';
import { ConflictoDeEdicion } from '@/lib/conflicto';
import { usePedido } from '@/lib/usePedido';
import { type DatosIniciales, useInicial } from '~/lib/useInicial';
import { eliminarComisionista, guardarComisionista, listaDeComisionistas } from '../acciones';

// La misma pantalla de la app de Vite, con los datos y las acciones del servidor propio.
type Lista = Awaited<ReturnType<typeof listaDeComisionistas>>;
export default function ComisionistasEnNext({ admin, iniciales }: { admin: boolean; iniciales: DatosIniciales<Lista> }) {
  const [revision, setRevision] = useState(0);
  const lista = usePedido(`comisionistas|${revision}`, listaDeComisionistas, true, useInicial(iniciales));
  const recargar = () => setRevision(v => v + 1);
  return (
    <PantallaDeComisionistas
      comisionistas={lista.data?.comisionistas} isLoading={lista.data === undefined && !lista.error} isError={!!lista.error} admin={admin}
      camposCustom={lista.data?.camposCustom ?? []}
      guardar={async g => {
        const r = await guardarComisionista(g);
        if (r.conflicto) { recargar(); throw new ConflictoDeEdicion('este comisionista'); }
        if (r.error) throw new Error(r.error);
        recargar();
      }}
      eliminar={async id => {
        const { error } = await eliminarComisionista(id);
        if (error) throw new Error(error);
        recargar();
      }}
    />
  );
}
