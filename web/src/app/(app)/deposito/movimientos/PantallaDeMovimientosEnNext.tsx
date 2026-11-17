'use client';
import { useState } from 'react';
import PantallaDeMovimientos, { type AccionesDeMovimientos } from '@/features/ajustes/PantallaDeMovimientos';
import type { FiltrosDeMovimientos } from '@/features/ajustes/tipos';
import { finDelDiaISO, inicioDelDiaISO } from '@/lib/fechaHoy';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { usePaginas } from '@/lib/usePaginas';
import { type DatosIniciales, useInicial } from '~/lib/useInicial';
import { anularMovimiento, paginaDeMovimientos } from '../acciones';
import { ACCIONES_DE_MOVIMIENTO } from '../accionesEnElNavegador';

// La misma pantalla de la app de Vite, con los datos y las acciones del servidor propio.
type Movimiento = Awaited<ReturnType<typeof paginaDeMovimientos>>[number];
export default function PantallaDeMovimientosEnNext({ puedeAnular, iniciales }: { puedeAnular: boolean; iniciales: DatosIniciales<Movimiento[]> }) {
  const [filtros, setFiltros] = useState<FiltrosDeMovimientos>({ texto: '', filtro: 'todos', desde: '', hasta: '' });
  const texto = useDebouncedValue(filtros.texto, 300);
  const [version, setVersion] = useState(0);
  const recargar = () => setVersion(v => v + 1);

  const lista = usePaginas(`${texto}|${filtros.filtro}|${filtros.desde}|${filtros.hasta}|${version}`, despuesDe => paginaDeMovimientos({
    texto, filtro: filtros.filtro,
    desde: filtros.desde ? inicioDelDiaISO(filtros.desde) : null,
    hasta: filtros.hasta ? finDelDiaISO(filtros.hasta) : null,
  }, despuesDe), 50, useInicial(iniciales));

  // las de siempre, y después de crear o anular se vuelve a leer la lista
  const acciones: AccionesDeMovimientos = {
    ...ACCIONES_DE_MOVIMIENTO,
    crear: async m => { const r = await ACCIONES_DE_MOVIMIENTO.crear(m); recargar(); return r; },
    anular: async (id, motivo) => {
      const { error } = await anularMovimiento(id, motivo);
      if (error) throw new Error(error);
      recargar();
    },
  };

  const { filas, ...estado } = lista;
  return <PantallaDeMovimientos puedeAnular={puedeAnular} filtros={filtros} onFiltros={setFiltros} datos={{ ...estado, ajustes: filas }} acciones={acciones} />;
}
