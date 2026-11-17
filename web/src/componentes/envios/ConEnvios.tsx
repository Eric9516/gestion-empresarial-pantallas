'use client';
import { useMemo, type ComponentProps, type ReactNode } from 'react';
import RotuloBultosModal from '@/features/rotulos/RotuloBultosModal';
import RotuloForm from '@/features/rotulos/RotuloForm';
import { ContextoDeEnvios, type ServicioDeEnvios } from '@/features/rotulos/servicioDeEnvios';
import { type Inicial, usePedido } from '@/lib/usePedido';
import { registrarError } from '~/componentes/errores/registrar';
import {
  articulosParaRotulo, datosParaEnvios, eliminarFotoDeEnvio, fotosDeEnvio, guardarComentarioDeEnvio, guardarEnvio, leerEnvio, subirFotoDeEnvio, versionesDeEnvio,
} from './acciones';

const conError = async (r: Promise<{ error: string | null }>) => { const { error } = await r; if (error) throw new Error(error); };

/**
 * Las ventanas de Envíos (las mismas de la app de Vite) con el servidor propio. Los datos que comparten (proveedores, comisionistas, diseño)
 * se piden recién cuando hacen falta (`activo`), o vienen con la pantalla (`inicial`). `alCambiar` avisa que se guardó algo (para volver a
 * leer la lista).
 */
export type DatosParaEnvios = Awaited<ReturnType<typeof datosParaEnvios>>;
export default function ConEnvios({ activo = true, inicial, alCambiar, children }:
  { activo?: boolean; inicial?: Inicial<DatosParaEnvios>; alCambiar?: () => void; children: ReactNode }) {
  const datos = usePedido(activo ? 'envios' : null, datosParaEnvios, false, inicial);
  const d = datos.data;
  const servicio = useMemo<ServicioDeEnvios>(() => ({
    proveedores: d?.proveedores,
    comisionistas: d?.comisionistas,
    conComisionistas: d?.conComisionistas ?? false,
    diseno: d?.diseno,
    leerEnvio,
    versiones: versionesDeEnvio,
    guardar: async e => {
      const { envio, error } = await guardarEnvio(e);
      if (error || !envio) throw new Error(error ?? 'No se pudo guardar el envío');
      alCambiar?.();
      return envio;
    },
    guardarComentario: async (id, comentario) => { await conError(guardarComentarioDeEnvio(id, comentario)); alCambiar?.(); },
    fotos: fotosDeEnvio,
    subirFoto: ({ grupoId, foto }) => {
      const envio = new FormData();
      envio.set('grupo', grupoId);
      envio.set('foto', foto, 'foto.jpg');
      return conError(subirFotoDeEnvio(envio));
    },
    eliminarFoto: f => conError(eliminarFotoDeEnvio(f.id)),
    registrarError,
    buscarArticulos: d?.conArticulos ? articulosParaRotulo : undefined,
  }), [d, alCambiar]);
  return <ContextoDeEnvios.Provider value={servicio}>{children}</ContextoDeEnvios.Provider>;
}

/** "Rótulo" en Proveedores. */
export function RotuloEnNext(props: ComponentProps<typeof RotuloForm>) {
  return <ConEnvios activo={props.open}><RotuloForm {...props} /></ConEnvios>;
}

/** "Ver envío" en Reparaciones. */
export function VerEnvioEnNext(props: ComponentProps<typeof RotuloBultosModal>) {
  return <ConEnvios activo={props.open}><RotuloBultosModal {...props} /></ConEnvios>;
}
