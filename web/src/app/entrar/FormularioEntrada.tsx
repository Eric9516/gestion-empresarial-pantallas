'use client';
import { useActionState } from 'react';
import { Icono } from '@/components/Icono';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { entrar, type EstadoEntrada } from './acciones';

const INICIAL: EstadoEntrada = { error: null, email: '' };

// Igual que la entrada de la app de Vite (mismos componentes). Funciona aunque la página no haya terminado de cargar el JavaScript:
// el formulario se manda igual y el servidor responde.
export function FormularioEntrada() {
  const [estado, enviar, enviando] = useActionState(entrar, INICIAL);
  return (
    <form action={enviar}>
      <div className="form-group">
        <label htmlFor="loginEmail">Correo electrónico</label>
        <Input id="loginEmail" name="email" type="email" placeholder="tu@correo.com" autoComplete="email" required defaultValue={estado.email} />
      </div>
      <div className="form-group">
        <label htmlFor="loginPass">Contraseña</label>
        <Input id="loginPass" name="contrasena" type="password" placeholder="••••••••" autoComplete="current-password" required />
      </div>
      {estado.error && <div className="auth-error" role="alert">{estado.error}</div>}
      <Button variant="primary" size="full" type="submit" disabled={enviando}>
        {enviando ? 'Ingresando...' : 'Ingresar'}
      </Button>
      <div className="auth-pie"><Icono n="candado" /> Acceso restringido — Solo usuarios autorizados</div>
    </form>
  );
}
