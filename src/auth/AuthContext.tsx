import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { opcionesLicencia } from '../features/config/useModulos';
import { opcionesConfiguracion } from '../features/config/useConfiguracion';
import type { Profile } from '../lib/types';
import { installErrorLogging, setErrorLoggingUser } from '../lib/errorLogging';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateOwnProfile: (data: { nombre: string; apellido: string }) => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

// Espeja loadUserProfile() de auth.js: reintenta unas veces ante fallas de red
// transitorias, pero un perfil bloqueado (activo === false) es definitivo — no
// tiene sentido reintentar eso.
async function fetchProfile(userId: string): Promise<Profile> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, error } = await supabase.from('usuarios_perfil').select('*').eq('id', userId).single();
    if (!error && data) {
      if (data.activo === false) throw new Error('BLOCKED');
      return data;
    }
    lastError = error;
    if (attempt < 3) await new Promise(r => setTimeout(r, 400 * attempt));
  }
  console.error('fetchProfile: se agotaron los reintentos', lastError);
  throw lastError instanceof Error ? lastError : new Error('No se pudo cargar el perfil');
}

// Al abrir la app, la sesión se avisa por dos caminos a la vez (leerla y el aviso de que cambió) y cada uno pedía el perfil por su lado: tres pedidos iguales.
// Mientras uno está en camino, los demás esperan ese mismo.
const perfilesEnCamino = new Map<string, Promise<Profile>>();
function cargarPerfil(userId: string): Promise<Profile> {
  let promesa = perfilesEnCamino.get(userId);
  if (!promesa) {
    promesa = fetchProfile(userId).finally(() => perfilesEnCamino.delete(userId));
    perfilesEnCamino.set(userId, promesa);
  }
  return promesa;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadFromSession(nextUser: User | null) {
      if (!nextUser) {
        if (mounted) { setUser(null); setProfile(null); setLoading(false); }
        return;
      }
      // Se piden ya la licencia y la configuración, a la vez que el perfil: antes esperaban a que el perfil llegara y la pantalla se dibujara.
      void queryClient.prefetchQuery(opcionesLicencia);
      void queryClient.prefetchQuery(opcionesConfiguracion);
      try {
        const prof = await cargarPerfil(nextUser.id);
        if (mounted) { setUser(nextUser); setProfile(prof); setAuthError(null); }
      } catch (e) {
        // Perfil bloqueado o ilegible: no dejamos una sesión "a medias" — pero,
        // a diferencia de antes, ahora SÍ avisamos por qué, en vez de desloguear
        // en silencio (eso hacía parecer que el login "no andaba" sin explicar nada).
        console.error('No se pudo cargar el perfil tras el login:', e);
        const msg = e instanceof Error && e.message === 'BLOCKED'
          ? 'Tu cuenta está desactivada. Contactá al administrador.'
          : 'No se pudo cargar tu perfil. Verificá tu conexión e intentá de nuevo.';
        await supabase.auth.signOut();
        if (mounted) { setUser(null); setProfile(null); setAuthError(msg); }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    supabase.auth.getSession().then(({ data }) => loadFromSession(data.session?.user ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      loadFromSession(session?.user ?? null);
    });

    installErrorLogging();

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [queryClient]);

  useEffect(() => {
    setErrorLoggingUser(user?.id ?? null, user?.email ?? null);
  }, [user]);

  // Si un administrador le cambia los roles o permisos a alguien que ya tiene la
  // app abierta, la pantalla se enteraba recién al volver a iniciar sesión. Acá se
  // vuelve a leer el perfil al volver a la pestaña y cada minuto; solo se actualiza
  // el estado si algo cambió, para no redibujar la app en vano. Si la lectura
  // falla (red, etc.) no se hace nada: el próximo intento corrige.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let activo = true;
    async function refrescar() {
      if (document.visibilityState !== 'visible') return;
      const { data } = await supabase.from('usuarios_perfil').select('*').eq('id', userId as string).single();
      if (!activo || !data) return;
      if (data.activo === false) {
        // Lo bloquearon con la sesión abierta: se lo saca ya, igual que si intentara entrar de nuevo.
        await supabase.auth.signOut();
        setUser(null); setProfile(null);
        setAuthError('Tu cuenta está desactivada. Contactá al administrador.');
        return;
      }
      setProfile(prev => (prev && JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
    }
    const intervalo = window.setInterval(() => void refrescar(), 60_000);
    document.addEventListener('visibilitychange', refrescar);
    window.addEventListener('focus', refrescar);
    return () => {
      activo = false;
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', refrescar);
      window.removeEventListener('focus', refrescar);
    };
  }, [userId]);

  async function signIn(email: string, password: string) {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('signInWithPassword falló:', error);
      return { error: 'Email o contraseña incorrectos' };
    }
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    // Recarga completa a propósito (igual que doLogout() en la app vieja): así
    // ningún botón o pantalla que dependía de permisos del usuario anterior
    // queda visible por accidente para el que entre después en el mismo navegador.
    window.location.reload();
  }

  async function updateOwnProfile(data: { nombre: string; apellido: string }) {
    if (!user) throw new Error('Sesión no disponible');
    const { error } = await supabase.from('usuarios_perfil').update(data).eq('id', user.id);
    if (error) throw error;
    setProfile(prev => (prev ? { ...prev, ...data } : prev));
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, authError, signIn, signOut, updateOwnProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components -- el hook que lee este contexto va junto a su proveedor a propósito
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
