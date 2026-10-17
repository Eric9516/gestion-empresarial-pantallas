import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';
import { mensajeDeError } from '@/lib/errores';
import { useToast } from '../../components/ToastProvider';
import type { Profile } from '../../lib/types';
import { fechaCorta, LARGO_MINIMO_CLAVE, problemaDeLaClave, ROLES_EXPLICADOS, type Permiso } from './permisos';
import { cambiarContrasena, cerrarSesionEnLosDemasEquipos } from './seguridad';

const caja = { background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 } as const;
const titulo = { fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-muted)' } as const;
const fila = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 } as const;
const rotulo = { fontSize: 12, fontWeight: 700, color: 'var(--text-mid)' } as const;

// Lo que la persona puede hacer: solo los permisos que tiene, por su nombre (lo que no tiene no se muestra).
// Lo que significa cada cosa está en el botón de ayuda (signo de pregunta).
export function PermisosDelPerfil({ permisos }: { permisos: Permiso[] }) {
  const autorizados = permisos.filter(p => p.tiene);
  return (
    <div style={caja}>
      <div style={titulo}>Mis permisos</div>
      {autorizados.length === 0 ? (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin permisos especiales</span>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {autorizados.map(p => <span key={p.clave} className="badge badge-active"><Icono n="ok" /> {p.nombre}</span>)}
        </div>
      )}
    </div>
  );
}

export function DatosDeLaCuenta({ profile, user }: { profile: Profile | null; user: User | null }) {
  const filas: [string, string][] = [
    ['Cuenta creada', fechaCorta(profile?.created_at ?? user?.created_at)],
    ...(user?.last_sign_in_at ? [['Esta sesión empezó', fechaCorta(user.last_sign_in_at, true)] as [string, string]] : []),
    ...(profile?.access_expires_at ? [['Acceso vigente hasta', fechaCorta(profile.access_expires_at)] as [string, string]] : []),
  ];
  return (
    <div style={caja}>
      <div style={titulo}>Mi cuenta</div>
      {filas.map(([nombre, valor]) => (
        <div key={nombre} style={fila}>
          <span style={rotulo}>{nombre}</span>
          <span style={{ fontSize: 13, color: 'var(--text)' }}>{valor}</span>
        </div>
      ))}
    </div>
  );
}

export function SeguridadDelPerfil({ email }: { email: string | null | undefined }) {
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  function cerrarFormulario() {
    setAbierto(false); setActual(''); setNueva(''); setRepetida('');
  }

  async function guardar() {
    const problema = problemaDeLaClave(actual, nueva, repetida);
    if (problema) { toast(problema, 'error'); return; }
    if (!email) { toast('No se pudo identificar tu cuenta', 'error'); return; }
    setEnviando(true);
    try {
      await cambiarContrasena(email, actual, nueva);
      toast('Contraseña cambiada', 'success');
      cerrarFormulario();
    } catch (e) {
      toast(mensajeDeError(e), 'error');
    } finally {
      setEnviando(false);
    }
  }

  async function cerrarOtras() {
    setCerrando(true);
    try {
      await cerrarSesionEnLosDemasEquipos();
      toast('Se cerró la sesión en los demás equipos', 'success');
    } catch (e) {
      toast('No se pudo cerrar: ' + mensajeDeError(e), 'error');
    } finally {
      setCerrando(false);
    }
  }

  return (
    <div style={caja}>
      <div style={titulo}>Seguridad</div>
      {!abierto ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => setAbierto(true)}><Icono n="clave" /> Cambiar contraseña</Button>
          <Button variant="ghost" onClick={() => void cerrarOtras()} disabled={cerrando}><Icono n="salir" /> Cerrar sesión en los demás equipos</Button>
        </div>
      ) : (
        <form onSubmit={e => { e.preventDefault(); void guardar(); }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="form-group"><label htmlFor="perfil-clave-actual">Contraseña actual</label><Input id="perfil-clave-actual" type="password" autoComplete="current-password" value={actual} onChange={e => setActual(e.target.value)} data-autofocus /></div>
          <div className="form-group"><label htmlFor="perfil-clave-nueva">Contraseña nueva (al menos {LARGO_MINIMO_CLAVE} caracteres)</label><Input id="perfil-clave-nueva" type="password" autoComplete="new-password" value={nueva} onChange={e => setNueva(e.target.value)} /></div>
          <div className="form-group"><label htmlFor="perfil-clave-repetida">Repetir la contraseña nueva</label><Input id="perfil-clave-repetida" type="password" autoComplete="new-password" value={repetida} onChange={e => setRepetida(e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={cerrarFormulario}>Cancelar</Button>
            <Button type="submit" variant="success" disabled={enviando}>{enviando ? 'Guardando...' : 'Guardar contraseña'}</Button>
          </div>
        </form>
      )}
    </div>
  );
}

// El botoncito con el signo de pregunta, al final: explica qué significa cada rol y cada permiso.
export function AyudaDelPerfil({ permisos }: { permisos: Permiso[] }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setAbierta(a => !a)}
        aria-expanded={abierta}
        aria-controls="perfil-ayuda"
        style={{ all: 'unset', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}
      >
        <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: '50%', border: '1.5px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: 'var(--blue)', background: abierta ? 'var(--surface2)' : 'transparent' }}>
          <Icono n="ayuda" />
        </span>
        ¿Qué significa cada cosa?
      </button>
      {abierta && (
        <div id="perfil-ayuda" style={{ ...caja, marginTop: 8 }}>
          <div style={titulo}>Roles</div>
          <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ROLES_EXPLICADOS.map(r => (
              <div key={r.nombre}><dt style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>{r.nombre}</dt><dd style={{ margin: 0, fontSize: 12, color: 'var(--text-mid)' }}>{r.explicacion}</dd></div>
            ))}
          </dl>
          <div style={{ ...titulo, marginTop: 6 }}>Permisos</div>
          <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {permisos.map(p => (
              <div key={p.clave}><dt style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>{p.nombre}</dt><dd style={{ margin: 0, fontSize: 12, color: 'var(--text-mid)' }}>{p.explicacion}</dd></div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
