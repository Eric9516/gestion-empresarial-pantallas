import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useConfiguracionQuery } from '../features/config/useConfiguracion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono, type NombreIcono } from '@/components/Icono';

// Los propios módulos de la app (no algo del rubro de un cliente en particular),
// así la pantalla de login queda igual de genérica en cualquier instalación.
const ICONOS: NombreIcono[] = ['fabrica', 'acuerdo', 'paquete', 'herramienta'];

// 8 íconos flotando con posición y velocidad al azar. Se sortean una sola vez al cargar la página (no al dibujar: dibujar tiene que dar siempre lo mismo).
const GOTAS = Array.from({ length: 8 }, (_, i) => ({
  emoji: ICONOS[i % ICONOS.length],
  left: `${Math.random() * 100}%`,
  animationDuration: `${8 + Math.random() * 12}s`,
  animationDelay: `${-Math.random() * 15}s`,
  fontSize: `${24 + Math.random() * 30}px`,
}));

function AuthDecorations() {
  const drops = GOTAS;

  return (
    <div className="auth-decorations" aria-hidden="true">
      {drops.map((d, i) => (
        <div key={i} className="icon-float" style={{ left: d.left, animationDuration: d.animationDuration, animationDelay: d.animationDelay, fontSize: d.fontSize }}>
          <Icono n={d.emoji} tam="1em" trazo={1.5} />
        </div>
      ))}
    </div>
  );
}

export default function LoginPage() {
  const { signIn, authError } = useAuth();
  const { data: config } = useConfiguracionQuery();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nombreEmpresa = config?.empresa_nombre || 'Mi Empresa';
  useEffect(() => { document.title = nombreEmpresa; }, [nombreEmpresa]);

  // authError cubre fallas DESPUÉS del login (ej: no se pudo cargar el perfil,
  // cuenta desactivada) — error local cubre fallas del login en sí. Se muestra
  // el que haya pasado más recientemente.
  const mensaje = error ?? authError;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) { setError('Completá email y contraseña'); return; }
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await signIn(email, password);
    setSubmitting(false);
    if (signInError) setError(signInError);
  }

  return (
    <main className="auth-screen">
      <AuthDecorations />
      <div className="auth-card">
        <div className="auth-logo">
          {config?.logo_base64
            ? <img src={config.logo_base64} alt={nombreEmpresa} />
            : <div className="auth-logo-fallback">{nombreEmpresa[0]}</div>}
        </div>
        <h1 className="auth-title">{nombreEmpresa}</h1>
        <div className="auth-subtitle"><Icono n="clave" /> Ingresá con tu cuenta</div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="loginEmail">Correo electrónico</label>
            <Input id="loginEmail" type="email" placeholder="tu@correo.com" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="loginPass">Contraseña</label>
            <Input id="loginPass" type="password" placeholder="••••••••" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {mensaje && <div className="auth-error">{mensaje}</div>}
          <Button variant="primary" size="full" type="submit" disabled={submitting}>
            {submitting ? 'Ingresando...' : 'Ingresar'}
          </Button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          
          <Icono n="candado" /> Acceso restringido — Solo usuarios autorizados
        </div>
      </div>
    </main>
  );
}
