import { redirect } from 'next/navigation';
import { Icono } from '@/components/Icono';
import { empresa } from '~/lib/empresa';
import { usuarioActual } from '~/lib/sesion';
import { FormularioEntrada } from './FormularioEntrada';

export default async function PaginaEntrar() {
  if (await usuarioActual()) redirect('/');
  const { nombre, logo } = await empresa();
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          {logo
            ? <img src={logo} alt={nombre} />
            : <div className="auth-logo-fallback">{nombre[0]}</div>}
        </div>
        <h1 className="auth-title">{nombre}</h1>
        <div className="auth-subtitle"><Icono n="clave" /> Ingresá con tu cuenta</div>
        <FormularioEntrada />
      </div>
    </main>
  );
}
