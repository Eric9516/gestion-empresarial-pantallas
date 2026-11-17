import { redirect } from 'next/navigation';
import { isOwner } from '@/lib/types';
import { leerConfiguracion } from './configuracion/acciones';
import { seccionesDelDirectorio } from './directorio/secciones';
import { puedeIrAlDeposito, puedeIrAlDirectorio, puedeIrAMantenimiento } from '~/componentes/areas';
import { contexto } from '~/lib/contexto';
import { salir } from '../entrar/acciones';

// La entrada: el Directorio (como en la app de siempre) o, si la persona no puede ir ahí, el Depósito o Mantenimiento. Al dueño de una instalación nueva lo
// recibe el asistente de Configuración, hasta que lo cierre.
export default async function Inicio() {
  const ctx = await contexto();
  if (isOwner(ctx.perfil) && (await leerConfiguracion())?.inicial_cerrada_at == null) redirect('/configuracion');
  if (puedeIrAlDirectorio(ctx)) redirect(seccionesDelDirectorio(ctx).inicio ?? '/directorio');
  if (puedeIrAlDeposito(ctx)) redirect('/deposito');
  if (puedeIrAMantenimiento(ctx)) redirect('/mantenimiento/inicio');
  // la cuenta de administración de la plataforma no es de ninguna empresa de clientes: va directo al panel
  if (ctx.esPlataforma) redirect('/plataforma');
  return (
    <main className="seccion-pendiente">
      <h1 className="auth-title">Hola, {ctx.perfil.nombre || ctx.perfil.email}</h1>
      <p>Tu cuenta no tiene acceso a ninguna sección todavía. Pedile al administrador que te habilite.</p>
      <form action={salir} style={{ marginTop: 20 }}><button className="btn btn-ghost" type="submit">Salir</button></form>
    </main>
  );
}
