'use client';
import { useState } from 'react';
import PantallaDeRetiros, { type AccionesDeRetiros, type FiltrosDeRetiros } from '@/features/retiros/PantallaDeRetiros';
import { retirosAFilas } from '@/features/retiros/retirosAExcel';
import { exportarExcel } from '@/lib/exportExcel';
import { finDelDiaISO, inicioDelDiaISO } from '@/lib/fechaHoy';
import type { UsuarioBasico } from '@/lib/nombreUsuario';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { usePaginas } from '@/lib/usePaginas';
import { type DatosIniciales, useInicial } from '~/lib/useInicial';
import { marcarRetirosExportados, paginaDeRetiros, retirosAExportar } from '../acciones';
import { ACCIONES_DE_MOVIMIENTO } from '../accionesEnElNavegador';

// La misma pantalla de la app de Vite, con los datos del servidor propio: los filtros viven acá, la base filtra y entrega de a 50.
// Las fechas se pasan a hora del navegador acá (la del servidor es UTC).
type Retiro = Awaited<ReturnType<typeof paginaDeRetiros>>[number];
export default function PantallaDeRetirosEnNext({ admin, puedeDevolver, usuarios, iniciales }:
  { admin: boolean; puedeDevolver: boolean; usuarios: UsuarioBasico[]; iniciales: DatosIniciales<Retiro[]> }) {
  const [filtros, setFiltros] = useState<FiltrosDeRetiros>({ fecha: '', usuario: '', texto: '' });
  const texto = useDebouncedValue(filtros.texto, 300);
  const [version, setVersion] = useState(0);
  const recargar = () => setVersion(v => v + 1);

  const lista = usePaginas(`${filtros.fecha}|${filtros.usuario}|${texto}|${version}`, despuesDe => {
    // sin fecha: los últimos 30 días
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    return paginaDeRetiros({
      texto, usuario: filtros.usuario,
      desde: filtros.fecha ? inicioDelDiaISO(filtros.fecha) : hace30.toISOString(),
      hasta: filtros.fecha ? finDelDiaISO(filtros.fecha) : null,
    }, despuesDe);
  }, 50, useInicial(iniciales));

  async function exportar(filtro: { pendientes: true } | { desde: string; hasta: string }, nombre: string) {
    const { retiros, usuarios: quienes } = await retirosAExportar(filtro);
    if (retiros.length) await exportarExcel(retirosAFilas(retiros, Object.fromEntries(quienes.map(u => [u.id, u]))), 'Retiros', nombre);
    return retiros;
  }
  const acciones: AccionesDeRetiros = {
    exportarPendientes: async () => {
      const retiros = await exportar({ pendientes: true }, `retiros_pendientes_${new Date().toISOString().slice(0, 10)}.xlsx`);
      if (retiros.length) { await marcarRetirosExportados(retiros.map(r => r.id)); recargar(); }
      return retiros.length;
    },
    exportarPeriodo: async (desde, hasta) =>
      (await exportar({ desde: inicioDelDiaISO(desde), hasta: finDelDiaISO(hasta) }, `retiros_${desde}_a_${hasta}.xlsx`)).length,
  };

  const { filas, ...estado } = lista;
  return (
    <PantallaDeRetiros filtros={filtros} onFiltros={setFiltros} acciones={acciones} devolucion={puedeDevolver ? ACCIONES_DE_MOVIMIENTO : undefined}
      datos={{ ...estado, retiros: filas, admin, usuarios }} />
  );
}
