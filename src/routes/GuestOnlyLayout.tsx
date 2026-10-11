import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// Inverso de ProtectedLayout: si ya hay sesión, /login no tiene sentido — te
// manda a la pantalla principal. Sin esto, un login exitoso nunca navegaba a
// ningún lado (el estado se actualizaba bien, pero nada le decía a la ruta que
// cambiara), y quedabas mirando el formulario de login para siempre.
export default function GuestOnlyLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Cargando...</div>;
  }
  if (user) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
