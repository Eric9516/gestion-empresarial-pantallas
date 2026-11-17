'use client';
import { useState } from 'react';
import type { Familia, Subfamilia } from '@/features/familias/tipos';
import PantallaDeInforme, { type AccionesDelInforme, type FiltrosDelInforme } from '@/features/items/PantallaDeInforme';
import type { LetraPdf } from '@/lib/preferencias';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { usePedido } from '@/lib/usePedido';
import { guardarPreferencias } from '~/lib/preferencias';
import { useLogoParaPdf } from '~/lib/useLogoParaPdf';
import { type DatosIniciales, useInicial } from '~/lib/useInicial';
import { buscarParaElegir, marcarEstadoDeReposicion, pedirInforme } from '../acciones';
import { ACCIONES_DE_MOVIMIENTO } from '../accionesEnElNavegador';

type Informe = Awaited<ReturnType<typeof pedirInforme>>;
interface Props {
  familias: Familia[]; subfamilias: Subfamilia[]; proveedores: string[]; empresa: { nombre: string; logo: string | null }; letraPdf: LetraPdf;
  iniciales: DatosIniciales<Informe>;
}

// La misma pantalla de la app de Vite, con los datos y las acciones del servidor propio.
export default function PantallaDeInformeEnNext({ familias, subfamilias, proveedores, empresa, letraPdf: letraInicial, iniciales }: Props) {
  const [filtros, setFiltros] = useState<FiltrosDelInforme>({ texto: '', familiaId: '', estado: '' });
  const texto = useDebouncedValue(filtros.texto);
  const [version, setVersion] = useState(0);
  const informe = usePedido(`${texto}|${filtros.familiaId}|${filtros.estado}|${version}`, () => pedirInforme({ texto, familiaId: filtros.familiaId, estado: filtros.estado }), true,
    useInicial(iniciales));
  // la letra se ve al instante y queda guardada en el perfil (la sigue a cualquier computadora)
  const [letraPdf, setLetraPdf] = useState(letraInicial);
  // el logo para el PDF del pedido llega aparte (la dirección es la de la cabecera, ya guardada en el navegador)
  const logo = useLogoParaPdf(empresa.logo);

  const acciones: AccionesDelInforme = {
    pedir: pedirInforme,
    marcar: async (ids, estado) => {
      const { error } = await marcarEstadoDeReposicion(ids, estado);
      if (error) throw new Error(error);
      setVersion(v => v + 1);
    },
    registrarError: ACCIONES_DE_MOVIMIENTO.registrarError,
  };

  return (
    <PantallaDeInforme
      familias={familias} subfamilias={subfamilias}
      filtros={filtros} onFiltros={setFiltros} textoBuscado={texto}
      // mientras llega una búsqueda nueva se sigue viendo la anterior (como en la app de Vite)
      datos={{ informe: informe.data, isLoading: informe.data === undefined && !informe.error, isError: !!informe.error }}
      acciones={acciones}
      letraPdf={letraPdf}
      onLetraPdf={l => { setLetraPdf(l); void guardarPreferencias({ pdf_letra: l }); }}
      pedido={{ empresa: { nombre: empresa.nombre, logo }, proveedores, buscarRepuestos: buscarParaElegir, registrarError: ACCIONES_DE_MOVIMIENTO.registrarError }}
    />
  );
}
