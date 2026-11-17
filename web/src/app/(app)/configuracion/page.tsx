import Link from 'next/link';
import type { CSSProperties } from 'react';
import { variablesDeMarca } from '@/lib/marca';
import { redirect } from 'next/navigation';
import { Icono } from '@/components/Icono';
import { resolverModulos } from '@/lib/modulos';
import { LETRA_PDF_POR_DEFECTO } from '@/lib/preferencias';
import { administraEquipos, isDepositoAdmin, puedeAjustarInventario, puedeVerSugerencias, tieneAccesoAdmin } from '@/lib/types';
import { datosDeUsuario } from '~/componentes/areas';
import MenuDeUsuario from '~/componentes/MenuDeUsuario';
import SelectorDeDeposito from '~/componentes/SelectorDeDeposito';
import { contexto } from '~/lib/contexto';
import { comoUsuario } from '~/lib/db';
import { empresa } from '~/lib/empresa';
import ProveedoresDelDirectorio from '../directorio/ProveedoresDelDirectorio';
import { leerConfiguracion, leerFamilias, sugerenciasNuevas } from './acciones';
import ConfiguracionEnNext from './ConfiguracionEnNext';

// Configuración: la misma pantalla de la app de Vite (grupos, pestañas y su contenido), con su cabecera y "Volver". Entra quien administra algo.
export default async function Configuracion({ searchParams }: { searchParams: Promise<{ grupo?: string }> }) {
  const ctx = await contexto();
  const { grupo } = await searchParams;
  if (!tieneAccesoAdmin(ctx.perfil)) redirect('/');
  const { perfil, modulos, integ, preferencias } = ctx;
  // (una consulta tras otra: comparten la conexión)
  const emp = await empresa(ctx.empresaId);
  const config = await leerConfiguracion();
  const licencia = await comoUsuario(perfil.id, async c => {
    const { rows: [l] } = await c.query<{ modulos: unknown; componentes: unknown }>('select modulos, componentes from public.licencia where id = 1');
    const { rows: [p] } = await c.query<{ apagados: unknown }>('select apagados from public.preferencias_modulos where id = 1');
    if (!l) return null;
    const { contratados, apagados } = resolverModulos(l.modulos, l.componentes, p?.apagados ?? {});
    return { contratados, apagados };
  });
  const nuevas = puedeVerSugerencias(perfil) ? await sugerenciasNuevas() : 0;
  const formulario = isDepositoAdmin(perfil) && modulos.deposito
    ? { ...(await leerFamilias()), puedeCambiarStock: puedeAjustarInventario(perfil), letra: ctx.deposito?.prefijo }
    : { familias: [], subfamilias: [], puedeCambiarStock: false };

  return (
    <ProveedoresDelDirectorio>
      <div className="admin-screen" style={variablesDeMarca({ primario: emp.colorPrimario, deposito: ctx.deposito?.color }) as CSSProperties}>
        <header className="app-header">
          <div className="header-logo">
            {emp.logo && <img src={emp.logo} alt={emp.nombre} />}
            <div>
              <div className="header-logo-fallback">{emp.nombre}</div>
              <h1 className="header-title">Configuración</h1>
            </div>
          </div>
          <div className="header-right">
            <Link href="/" className="btn-volver-directorio" style={{ display: 'flex' }}><Icono n="volver" /> <span className="hide-mobile">Volver</span></Link>
            <MenuDeUsuario usuario={datosDeUsuario(ctx)} />
          </div>
        </header>
        <main className="app-main">
          <ConfiguracionEnNext perfil={perfil} config={config} modulos={modulos} integ={integ}
            licencia={licencia ? { ...licencia, leida: true } : { contratados: modulos, apagados: {}, leida: false }}
            letraPdf={preferencias.pdf_letra ?? LETRA_PDF_POR_DEFECTO} sugerenciasNuevas={nuevas} formulario={formulario}
            depositoActual={ctx.deposito?.id ?? null}
            grupoInicial={typeof grupo === 'string' ? grupo : null}
            conExcelDeMantenimiento={modulos.mantenimiento && administraEquipos(perfil)}
            selectorDeDeposito={modulos.deposito && ctx.depositos.length > 0
              ? <SelectorDeDeposito depositos={ctx.depositos.map(d => ({ id: d.id, nombre: d.nombre, icono: d.icono }))} actual={ctx.deposito?.id ?? null}
                  preferido={ctx.depositoPreferido} irA={null} claro />
              : undefined} />
        </main>
      </div>
    </ProveedoresDelDirectorio>
  );
}
