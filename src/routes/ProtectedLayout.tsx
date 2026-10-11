import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import PuertaConfiguracionInicial from './PuertaConfiguracionInicial';

export default function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Cargando...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return (
    <PuertaConfiguracionInicial>
      <Outlet />
    </PuertaConfiguracionInicial>
  );
}
