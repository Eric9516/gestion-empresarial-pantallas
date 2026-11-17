import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import Area from '~/componentes/Area';
import { datosDeUsuario, puedeIrAMantenimiento, seccionDeAreas } from '~/componentes/areas';
import MenuCelular from '~/componentes/MenuCelular';
import MenuDeSecciones from '~/componentes/MenuDeSecciones';
import { clavesDeAvisos, contarAvisos } from '~/lib/avisos';
import { contexto } from '~/lib/contexto';
import { empresa } from '~/lib/empresa';
import { avisosDeMantenimiento, menuDeMantenimiento } from '~/lib/mantenimiento';
import { rolDeMantenimiento } from '@/lib/types';
import AvisoDeOrdenes from './AvisoDeOrdenes';
import ProveedoresDeMantenimiento from './ProveedoresDeMantenimiento';
import { INICIO_MANTENIMIENTO, seccionesDeMantenimiento } from './secciones';

// El área de Mantenimiento: cabecera (verde, del diseño del socio), menú de secciones (computadora) y hamburguesa (celular).
export default async function LayoutMantenimiento({ children }: { children: ReactNode }) {
  const ctx = await contexto();
  const emp = await empresa(ctx.empresaId);
  // sin el módulo o sin un rol de Mantenimiento, a la entrada
  if (!puedeIrAMantenimiento(ctx)) redirect('/');

  const rol = rolDeMantenimiento(ctx.perfil);
  const [numAvisos, menu] = await Promise.all([avisosDeMantenimiento(ctx.perfil.id), menuDeMantenimiento(ctx.perfil.id, rol)]);
  const { secciones, pie } = seccionesDeMantenimiento(ctx, numAvisos, menu);
  const avisos = await contarAvisos(ctx.perfil.id, clavesDeAvisos(ctx));
  const posicion = ctx.preferencias.menu_posicion ?? 'lateral';
  const fijo = ctx.preferencias.menu_fijo ?? false;
  const usuario = datosDeUsuario(ctx);
  const todas = [...seccionDeAreas(ctx, 'mantenimiento'), ...secciones];
  return (
    <ProveedoresDeMantenimiento>
      <Area clase="app-screen mt-screen" titulo="Mantenimiento" empresa={emp} usuario={usuario} posicion={posicion} fijo={fijo} avisos={avisos}
        menu={<MenuDeSecciones secciones={todas} pie={pie} inicio={INICIO_MANTENIMIENTO} posicion={posicion} fijo={fijo} />}
        menuCelular={<MenuCelular secciones={todas} pie={pie} inicio={INICIO_MANTENIMIENTO} usuario={usuario} />}>
        <AvisoDeOrdenes pendientes={menu.pendientes} rol={rol} />
        {children}
      </Area>
    </ProveedoresDeMantenimiento>
  );
}
