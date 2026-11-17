import { notFound } from 'next/navigation';
import type { Familia, Subfamilia } from '@/features/familias/tipos';
import { LETRA_PDF_POR_DEFECTO } from '@/lib/preferencias';
import { puedeVerInforme } from '@/lib/types';
import { comoUsuario } from '~/lib/db';
import { contexto } from '~/lib/contexto';
import { datosIniciales } from '~/lib/datosIniciales';
import { empresa } from '~/lib/empresa';
import { pedirInforme } from '../acciones';
import PantallaDeInformeEnNext from './PantallaDeInformeEnNext';

// Depósito → Informe de reposición: es de Compras (y de quien tenga el permiso de verlo); la base decide igual qué ve cada uno.
export default async function Informe() {
  const { perfil, preferencias, modulos, empresaId } = await contexto();
  const emp = await empresa(empresaId);
  if (!puedeVerInforme(perfil)) notFound();
  const [datos, informe] = await Promise.all([comoUsuario(perfil.id, async c => ({
    familias: (await c.query<Familia>('select * from public.familias order by nombre')).rows,
    subfamilias: (await c.query<Subfamilia>('select * from public.subfamilias order by nombre')).rows,
    // para elegir a quién va la solicitud de presupuesto (sin el módulo de proveedores, se escribe a mano)
    proveedores: modulos.proveedores
      ? (await c.query<{ nombre: string }>('select nombre from public.proveedores where not eliminado order by nombre')).rows.map(p => p.nombre)
      : [],
  })), pedirInforme({ texto: '', familiaId: '', estado: '' })]);
  return (
    <PantallaDeInformeEnNext
      {...datos}
      iniciales={datosIniciales(informe)}
      empresa={emp}
      letraPdf={preferencias.pdf_letra ?? LETRA_PDF_POR_DEFECTO}
    />
  );
}
