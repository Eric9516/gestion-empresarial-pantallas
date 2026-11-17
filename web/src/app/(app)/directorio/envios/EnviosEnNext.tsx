'use client';
import { useCallback, useState } from 'react';
import PantallaDeEnvios from '@/features/rotulos/PantallaDeEnvios';
import { usePedido } from '@/lib/usePedido';
import { eliminarEnvio, listaDeEnvios } from '~/componentes/envios/acciones';
import ConEnvios, { type DatosParaEnvios } from '~/componentes/envios/ConEnvios';
import { type DatosIniciales, useInicial } from '~/lib/useInicial';

// La misma pantalla de la app de Vite, con los datos y las acciones del servidor propio. Después de cada cambio se vuelve a leer la lista.
type Iniciales = { lista: Awaited<ReturnType<typeof listaDeEnvios>>; paraEnvios: DatosParaEnvios };
export default function EnviosEnNext({ admin, iniciales }: { admin: boolean; iniciales: DatosIniciales<Iniciales> }) {
  const [revision, setRevision] = useState(0);
  const { data, fresco } = useInicial(iniciales);
  const lista = usePedido(`envios|${revision}`, listaDeEnvios, true, { data: data.lista, fresco });
  const recargar = useCallback(() => setRevision(v => v + 1), []);
  return (
    <ConEnvios alCambiar={recargar} inicial={{ data: data.paraEnvios, fresco }}>
      <PantallaDeEnvios envios={lista.data?.envios} isLoading={lista.data === undefined && !lista.error} isError={!!lista.error}
        autores={lista.data?.autores} admin={admin}
        eliminar={async grupoId => {
          const { error } = await eliminarEnvio(grupoId);
          if (error) throw new Error(error);
          recargar();
        }} />
    </ConEnvios>
  );
}
