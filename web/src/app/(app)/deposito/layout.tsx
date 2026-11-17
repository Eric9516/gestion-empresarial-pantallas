import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { NOMBRE_DEPOSITO_POR_DEFECTO } from '@/features/depositos/iconos';
import Area from '~/componentes/Area';
import SelectorDeDeposito from '~/componentes/SelectorDeDeposito';
import { datosDeUsuario, puedeIrAlDeposito, seccionDeAreas } from '~/componentes/areas';
import { clavesDeAvisos, contarAvisos } from '~/lib/avisos';
import { seccionesQueSeVen } from '~/lib/comoTrabaja';
import { contexto } from '~/lib/contexto';
import { empresa } from '~/lib/empresa';
import MenuDelDeposito from './MenuDelDeposito';
import ProveedoresDelDeposito from './ProveedoresDelDeposito';
import { INICIO_DEPOSITO, seccionesDelDeposito } from './secciones';

// El área del Depósito: cabecera, menú de secciones (computadora) y hamburguesa (celular). Las secciones son páginas.
export default async function LayoutDeposito({ children }: { children: ReactNode }) {
  const ctx = await contexto();
  const emp = await empresa(ctx.empresaId);
  // las mismas puertas que DepositoPage: sin acceso o sin el módulo, a la entrada
  if (!puedeIrAlDeposito(ctx)) redirect('/');

  const { secciones, pie } = seccionesDelDeposito(ctx, await seccionesQueSeVen(ctx));
  const avisos = await contarAvisos(ctx.perfil.id, clavesDeAvisos(ctx));
  const posicion = ctx.preferencias.menu_posicion ?? 'lateral';
  const fijo = ctx.preferencias.menu_fijo ?? false;
  const usuario = datosDeUsuario(ctx);
  const menu = { secciones: [...seccionDeAreas(ctx, 'deposito'), ...secciones], pie, inicio: INICIO_DEPOSITO, posicion, fijo, usuario };
  return (
    <ProveedoresDelDeposito usuarioId={ctx.perfil.id}>
      <Area clase="deposito-screen" empresa={emp} colorDeposito={ctx.deposito?.color}
        titulo={ctx.depositos.length > 1
          ? <SelectorDeDeposito depositos={ctx.depositos.map(d => ({ id: d.id, nombre: d.nombre, icono: d.icono }))} actual={ctx.deposito?.id ?? null} preferido={ctx.depositoPreferido} />
          : ctx.deposito?.nombre ?? NOMBRE_DEPOSITO_POR_DEFECTO} usuario={usuario} posicion={posicion} fijo={fijo} avisos={avisos}
        menu={<MenuDelDeposito {...menu} />} menuCelular={<MenuDelDeposito {...menu} enCelular />}>
        {children}
      </Area>
    </ProveedoresDelDeposito>
  );
}
