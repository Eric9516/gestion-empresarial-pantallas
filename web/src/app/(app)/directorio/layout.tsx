import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import Area from '~/componentes/Area';
import { datosDeUsuario, puedeIrAlDirectorio, seccionDeAreas } from '~/componentes/areas';
import MenuCelular from '~/componentes/MenuCelular';
import MenuDeSecciones from '~/componentes/MenuDeSecciones';
import { clavesDeAvisos, contarAvisos } from '~/lib/avisos';
import { contexto } from '~/lib/contexto';
import { empresa } from '~/lib/empresa';
import ProveedoresDelDirectorio from './ProveedoresDelDirectorio';
import { seccionesDelDirectorio } from './secciones';

// El área del Directorio: cabecera, menú de secciones (computadora) y hamburguesa (celular). Las secciones son páginas.
export default async function LayoutDirectorio({ children }: { children: ReactNode }) {
  const ctx = await contexto();
  const emp = await empresa(ctx.empresaId);
  // las mismas puertas que DirectorioPage: con el Directorio desactivado o sin módulos del Directorio, a la entrada
  if (!puedeIrAlDirectorio(ctx)) redirect('/');

  const { secciones, pie, inicio } = seccionesDelDirectorio(ctx);
  const avisos = await contarAvisos(ctx.perfil.id, clavesDeAvisos(ctx));
  const posicion = ctx.preferencias.menu_posicion ?? 'lateral';
  const fijo = ctx.preferencias.menu_fijo ?? false;
  const usuario = datosDeUsuario(ctx);
  const todas = [...seccionDeAreas(ctx, 'directorio'), ...secciones];
  return (
    <ProveedoresDelDirectorio>
      <Area clase="app-screen" titulo="Directorio" empresa={emp} usuario={usuario} posicion={posicion} fijo={fijo} avisos={avisos}
        menu={<MenuDeSecciones secciones={todas} pie={pie} inicio={inicio ?? '/directorio'} posicion={posicion} fijo={fijo} />}
        menuCelular={<MenuCelular secciones={todas} pie={pie} inicio={inicio ?? '/directorio'} usuario={usuario} />}>
        {children}
      </Area>
    </ProveedoresDelDirectorio>
  );
}
