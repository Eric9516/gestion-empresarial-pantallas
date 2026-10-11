import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isOwner, tieneAccesoAdmin } from '../lib/types';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';

// Se muestra cuando la persona no tiene ninguna pantalla disponible: por ejemplo, el dueño
// desactivó todos los módulos a los que ella tiene acceso. Siempre ofrece una salida.
export default function SinModulos() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="loading-screen" style={{ flexDirection: 'column', gap: 12, textAlign: 'center', padding: 24 }}>
      <div style={{ fontSize: 40 }}><Icono n="modulos" /></div>
      <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>No hay módulos disponibles</div>
      <p style={{ maxWidth: 380, color: 'var(--text-mid)', fontSize: 14 }}>
        Los módulos a los que tenés acceso no están activos en esta instalación.
        {isOwner(profile)
          ? ' Si los apagaste vos, podés volver a prenderlos en Configuración → General → Módulos; si tu plan no los incluye, comunicate con quien te brinda el sistema.'
          : ' Los activa el dueño de la empresa o quien te brinda el sistema: comunicate con ellos.'}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {tieneAccesoAdmin(profile) && <Button variant="primary" onClick={() => navigate('/admin')}>Ir a Configuración</Button>}
        <Button variant="ghost" onClick={() => void signOut()}>Cerrar sesión</Button>
      </div>
    </div>
  );
}
