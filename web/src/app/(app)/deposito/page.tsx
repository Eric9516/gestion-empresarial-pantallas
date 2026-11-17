import Link from 'next/link';
import { Icono } from '@/components/Icono';
import { botonVariantes } from '@/components/ui/botonVariantes';
import { isDepositoAdmin, puedeAjustarInventario, tieneAccesoDeposito } from '@/lib/types';
import { usaDelDeposito } from '~/lib/comoTrabaja';
import { contexto } from '~/lib/contexto';
import { datosDeBusqueda, hayBusqueda, LIMITE_DE_BUSQUEDA, repuestoCompleto, TANDA, type Busqueda } from '~/lib/repuestos';
import BotonEscanear from './BotonEscanear';
import BotonNuevoRepuesto from './BotonNuevoRepuesto';
import Buscador from './Buscador';
import DetalleDeRepuesto from './DetalleDeRepuesto';
import ListaDeRepuestos from './ListaDeRepuestos';
import ParaAtender from './ParaAtender';

type Parametros = Promise<Record<string, string | string[] | undefined>>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

// Depósito → Buscar, que es también el inicio: sin buscar nada, muestra lo que pide atención (ParaAtender).
// La búsqueda vive en la dirección (?q=…&familia=…&n=…): se puede recargar, volver atrás o compartir y queda igual.
// El servidor busca y arma la lista; el buscador solo cambia la dirección.
export default async function Buscar({ searchParams }: { searchParams: Parametros }) {
  const p = await searchParams;
  const busqueda: Busqueda = {
    texto: uno(p.q),
    familiaId: uno(p.familia),
    subfamiliaId: uno(p.sub),
    cantidad: Math.min(Math.max(Number(uno(p.n)) || TANDA, TANDA), LIMITE_DE_BUSQUEDA),
  };
  const mostrarStock = uno(p.stock) === '1';
  const ctx = await contexto();
  const { perfil, integ } = ctx;
  // la búsqueda y, si hay uno abierto (?ver=…), el repuesto, a la vez
  const [{ resultados, familias, subfamilias, hayRepuestos }, abierto] = await Promise.all([
    datosDeBusqueda(perfil.id, busqueda),
    uno(p.ver) ? repuestoCompleto(perfil.id, uno(p.ver)) : Promise.resolve(null),
  ]);

  const admin = isDepositoAdmin(perfil);
  const formulario = { familias, subfamilias, puedeCambiarStock: puedeAjustarInventario(perfil), letra: ctx.deposito?.prefijo };
  const sinFiltro = !hayBusqueda(busqueda);
  // si vinieron tantos como se pidieron, puede haber más: otra tanda hasta el tope; en el tope, se pide afinar
  const puedeHaberMas = resultados.length >= busqueda.cantidad;
  const hayOtraTanda = puedeHaberMas && busqueda.cantidad < LIMITE_DE_BUSQUEDA;
  const masResultados = new URLSearchParams(Object.entries({ q: busqueda.texto, familia: busqueda.familiaId, sub: busqueda.subfamiliaId, stock: mostrarStock ? '1' : '' })
    .filter(([, v]) => v));
  masResultados.set('n', String(busqueda.cantidad + TANDA));

  return (
    // paneMantBuscar: el mismo lugar que en la app de Vite, donde aparece el botón flotante de escanear (solo en el celular)
    <div id="paneMantBuscar">
      <div className="section-header">
        <div className="section-title"><Icono n="buscar" /> Buscar artículos</div>
        {admin && <div className="section-actions"><BotonNuevoRepuesto datos={formulario} /></div>}
      </div>

      <Buscador familias={familias} subfamilias={subfamilias} busqueda={busqueda} mostrarStock={mostrarStock} />

      {!sinFiltro && puedeHaberMas && !hayOtraTanda && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          Se muestran los primeros {LIMITE_DE_BUSQUEDA}: afiná la búsqueda (más palabras, familia o subfamilia) para llegar a lo que buscás.
        </p>
      )}

      {sinFiltro && hayRepuestos ? (
        <ParaAtender ctx={ctx} />
      ) : (
        <ListaDeRepuestos repuestos={resultados} mostrarStock={mostrarStock} catalogoVacio={!hayRepuestos} conRetiro={usaDelDeposito(ctx).retiros} />
      )}

      {!sinFiltro && hayOtraTanda && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, margin: '16px 0 8px' }}>
          <Link href={`?${masResultados}`} scroll={false} replace className={botonVariantes({ variant: 'ghost' })}>
            <Icono n="abajo" /> Ver {TANDA} más
          </Link>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Mostrando {resultados.length} · puede haber más</span>
        </div>
      )}

      <BotonEscanear conRetiro={usaDelDeposito(ctx).retiros} />

      {abierto && <DetalleDeRepuesto key={abierto.repuesto.id} repuesto={abierto.repuesto} enReparacion={abierto.enReparacion}
        admin={admin} puedeSubir={tieneAccesoDeposito(perfil)} formulario={formulario} conProveedores={integ.depositoConProveedores} />}
    </div>
  );
}
