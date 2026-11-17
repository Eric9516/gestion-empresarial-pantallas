'use client';
import { useMemo, useState } from 'react';
import PantallaDeReparaciones from '@/features/reparaciones/PantallaDeReparaciones';
import { ContextoDeReparaciones, type ServicioDeReparaciones } from '@/features/reparaciones/servicioDeReparaciones';
import { usePedido } from '@/lib/usePedido';
import { type DatosIniciales, useInicial } from '~/lib/useInicial';
import { VerEnvioEnNext } from '~/componentes/envios/ConEnvios';
import { buscarParaElegir } from '../acciones';
import { ACCIONES_DE_MOVIMIENTO } from '../accionesEnElNavegador';
import { type DatosDeReparaciones, crearReparacion, datosDeReparaciones, editarReparacion, eliminarReparacion, envioVigente, registrarEntrega } from './acciones';

// La misma pantalla de la app de Vite, con los datos y las acciones del servidor propio. Después de cada cambio se vuelven a leer.
export default function ReparacionesEnNext({ iniciales, sePuedenCrear }: { iniciales: DatosIniciales<DatosDeReparaciones>; sePuedenCrear: boolean }) {
  const [revision, setRevision] = useState(0);
  const datos = usePedido(`reparaciones|${revision}`, datosDeReparaciones, true, useInicial(iniciales));

  const servicio = useMemo<ServicioDeReparaciones>(() => {
    const yLeer = async (r: Promise<{ error: string | null }>) => {
      const { error } = await r;
      if (error) throw new Error(error);
      setRevision(v => v + 1);
    };
    const d = datos.data;
    return {
      reparaciones: d?.reparaciones,
      isLoading: d === undefined && !datos.error,
      isError: !!datos.error,
      proveedores: d?.proveedores,
      envios: d?.envios,
      enviosAsignados: d && new Map(d.enviosAsignados),
      detallesDeEnvios: d && new Map(d.detallesDeEnvios),
      crear: r => yLeer(crearReparacion(r)),
      editar: r => yLeer(editarReparacion(r)),
      registrarEntrega: e => yLeer(registrarEntrega(e)),
      eliminar: id => yLeer(eliminarReparacion(id)),
      buscarRepuestos: buscarParaElegir,
      registrarError: ACCIONES_DE_MOVIMIENTO.registrarError,
      resolverEnvioVigente: envioVigente,
      VerEnvio: VerEnvioEnNext,
      sePuedenCrear,
    };
  }, [datos.data, datos.error]);

  return <ContextoDeReparaciones.Provider value={servicio}><PantallaDeReparaciones /></ContextoDeReparaciones.Provider>;
}
