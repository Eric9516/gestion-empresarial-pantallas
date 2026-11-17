import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icono, type NombreIcono } from '@/components/Icono';
import { comprobanteTexto, type ClaseMovimiento } from '@/lib/ajustes';
import { isDepositoAdmin, puedeAjustarInventario, puedeVerInforme } from '@/lib/types';
import { seccionesQueSeVen, usaDelDeposito } from '~/lib/comoTrabaja';
import { comoUsuario } from '~/lib/db';
import type { Contexto } from '~/lib/contexto';
import FaltantesDeMantenimiento, { type Faltante } from './FaltantesDeMantenimiento';

// Una reparación lleva "mucho afuera" desde los 30 días.
const DIAS_AFUERA = 30;

interface Datos {
  reponer: { total: number; sinStock: number } | null;
  reparaciones: { pendientes: number; atrasadas: number } | null;
  retirosDeHoy: number | null;
  cargas: { id: string; clase: ClaseMovimiento; numero: number; punto_venta: number; fecha: string; referencia: string | null }[] | null;
  faltantes: Faltante[];
}

// Lo que pide atención en el depósito, al entrar (en lugar de un buscador vacío). Solo muestra lo que el depósito usa y lo que la persona puede ver,
// y cada tarjeta lleva a su sección. Todo en una sola ida a la base.
export default async function ParaAtender({ ctx }: { ctx: Contexto }) {
  const { perfil, integ } = ctx;
  const usa = usaDelDeposito(ctx);
  const seVe = await seccionesQueSeVen(ctx);
  const verInforme = puedeVerInforme(perfil);
  const verReparaciones = isDepositoAdmin(perfil) && integ.reparaciones && seVe.reparaciones;
  const verCargas = puedeAjustarInventario(perfil);

  const d: Datos = await comoUsuario(perfil.id, async c => ({
    reponer: verInforme
      ? await c.query<{ total: string; total_sin_stock: string }>('select total, total_sin_stock from public.repuestos_a_reponer(null, null, null, 1)')
        .then(r => ({ total: Number(r.rows[0]?.total ?? 0), sinStock: Number(r.rows[0]?.total_sin_stock ?? 0) }))
      : null,
    reparaciones: verReparaciones
      ? await c.query<{ pendientes: number; atrasadas: number }>(`
          select count(*)::int as pendientes, count(*) filter (where r.fecha_salida < current_date - $1::int)::int as atrasadas
          from public.reparaciones r
          where r.activo and r.eliminado_at is null and exists (
            select 1 from public.reparacion_items ri
            where ri.reparacion_id = r.id
              and ri.cantidad > coalesce((select sum(e.cantidad_devuelta) from public.reparacion_entregas e where e.reparacion_item_id = ri.id), 0))`, [DIAS_AFUERA])
        .then(r => r.rows[0])
      : null,
    retirosDeHoy: seVe.retiros
      ? await c.query<{ n: number }>('select count(*)::int as n from public.retiros where created_at >= public.hoy_local()').then(r => r.rows[0].n)
      : null,
    cargas: verCargas
      ? (await c.query<NonNullable<Datos['cargas']>[number]>(`select id, clase, numero, punto_venta, fecha::text as fecha, referencia from public.ajustes_inventario
          where clase = 'carga' and not anulado order by created_at desc limit 3`)).rows
      : null,
    // lo que una OT de Mantenimiento usó y no se pudo descontar (no había stock): para que el Depósito lo revise
    faltantes: ctx.modulos.mantenimiento
      ? (await c.query<Faltante & { faltante: string }>(`select id, ot, fecha::text as fecha, equipo, codigo, descripcion, faltante
          from public.faltantes_de_mantenimiento()`)).rows.map(x => ({ ...x, faltante: Number(x.faltante) }))
      : [],
  }));

  const noUsa = [!usa.retiros && 'retiros de operarios', !usa.reparaciones && integ.reparaciones && 'reparaciones'].filter(Boolean);
  const hayTarjetas = d.reponer || d.reparaciones || d.retirosDeHoy !== null || d.cargas || d.faltantes.length > 0;

  return (
    <section aria-labelledby="para-atender" style={{ marginTop: 8 }}>
      {hayTarjetas && <h2 id="para-atender" className="para-atender-titulo">Para atender</h2>}
      <div className="para-atender">
        <FaltantesDeMantenimiento faltantes={d.faltantes} puedeRevisar={isDepositoAdmin(perfil)} />
        {d.reponer && (
          <Tarjeta href="/deposito/informe" icono="informe" titulo="Para reponer" alerta={d.reponer.sinStock > 0}
            numero={d.reponer.total} unidad={d.reponer.total === 1 ? 'artículo' : 'artículos'}>
            {d.reponer.total === 0 ? 'Nada llegó al punto de pedido.' : d.reponer.sinStock > 0 ? `${d.reponer.sinStock} sin stock.` : 'Llegaron al punto de pedido.'}
          </Tarjeta>
        )}
        {d.reparaciones && (
          <Tarjeta href="/deposito/reparaciones" icono="herramienta" titulo="Reparaciones afuera" alerta={d.reparaciones.atrasadas > 0}
            numero={d.reparaciones.pendientes} unidad={d.reparaciones.pendientes === 1 ? 'pendiente' : 'pendientes'}>
            {d.reparaciones.pendientes === 0 ? 'No hay nada afuera.' : d.reparaciones.atrasadas > 0
              ? `${d.reparaciones.atrasadas} hace más de ${DIAS_AFUERA} días.` : 'Todas salieron hace menos de un mes.'}
          </Tarjeta>
        )}
        {d.retirosDeHoy !== null && (
          <Tarjeta href="/deposito/retiros" icono="lista" titulo="Retiros de hoy" numero={d.retirosDeHoy} unidad={d.retirosDeHoy === 1 ? 'retiro' : 'retiros'}>
            {usa.retiros ? 'Se pueden corregir durante 24 horas.' : 'Los retiros de antes se siguen consultando.'}
          </Tarjeta>
        )}
        {d.cargas && (
          <Tarjeta href="/deposito/movimientos" icono="balanza" titulo="Lo último que entró">
            {d.cargas.length === 0 ? 'Todavía no hay cargas de stock.' : (
              <ul className="para-atender-lista">
                {d.cargas.map(cg => (
                  <li key={cg.id}>
                    <strong>{comprobanteTexto(cg.clase, cg.punto_venta, cg.numero)}</strong>{' '}
                    <span>{cg.fecha.split('-').reverse().slice(0, 2).join('/')}{cg.referencia ? ` · ${cg.referencia}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        )}
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 14 }}>
        Para buscar un artículo, escribí un código, número o descripción, o elegí una familia.
        {noUsa.length > 0 && <> En este depósito no se usan {noUsa.join(' ni ')}: lo define Compras.</>}
      </p>
    </section>
  );
}

function Tarjeta({ href, icono, titulo, numero, unidad, alerta, children }: {
  href: string; icono: NombreIcono; titulo: string; numero?: number; unidad?: string; alerta?: boolean; children: ReactNode;
}) {
  return (
    <Link href={href} className={`para-atender-tarjeta${alerta ? ' alerta' : ''}`}>
      <span className="para-atender-cabeza"><Icono n={icono} /> {titulo}</span>
      {numero !== undefined && <span className="para-atender-numero">{numero} <small>{unidad}</small></span>}
      <span className="para-atender-detalle">{children}</span>
    </Link>
  );
}
