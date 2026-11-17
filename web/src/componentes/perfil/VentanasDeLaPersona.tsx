'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import SugerenciaModal from '@/components/SugerenciaModal';
import VentanaDePerfil from '@/components/VentanaDePerfil';
import type { AccionesDeSeguridad } from '@/features/perfil/SeccionesDePerfil';
import type { DatosDeUsuario } from '../MenuDeUsuario';
import { cambiarMiContrasena, cerrarOtrasSesiones, enviarSugerencia, guardarMiPerfil } from './acciones';

const hecho = async (r: Promise<{ error: string | null }>) => { const { error } = await r; if (error) throw new Error(error); };

const SEGURIDAD: AccionesDeSeguridad = {
  cambiarContrasena: (_email, actual, nueva) => hecho(cambiarMiContrasena(actual, nueva)),
  cerrarOtras: () => hecho(cerrarOtrasSesiones()),
};

/** "Mi perfil" y "Enviar sugerencia" (las mismas ventanas de la app de Vite), para el menú de la cabecera y el del celular. */
export function useVentanasDeLaPersona(usuario: DatosDeUsuario) {
  const router = useRouter();
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  const [sugerenciaAbierta, setSugerenciaAbierta] = useState(false);
  const ventanas = (
    <>
      <VentanaDePerfil open={perfilAbierto} onClose={() => setPerfilAbierto(false)} profile={usuario.perfil}
        user={{ created_at: usuario.perfil.created_at ?? undefined }} conDeposito={usuario.conDeposito} conMantenimiento={usuario.conMantenimiento} nombreDeposito={usuario.nombreDeposito}
        guardar={async d => { await hecho(guardarMiPerfil(d)); router.refresh(); }} seguridad={SEGURIDAD}
        deLaPlataforma={usuario.cuentaDePlataforma} />
      <SugerenciaModal open={sugerenciaAbierta} onClose={() => setSugerenciaAbierta(false)} enviar={m => hecho(enviarSugerencia(m))} />
    </>
  );
  return { abrirPerfil: () => setPerfilAbierto(true), abrirSugerencia: () => setSugerenciaAbierta(true), ventanas };
}
