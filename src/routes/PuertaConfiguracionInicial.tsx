import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isOwner } from '../lib/types';
import { useConfiguracionQuery } from '../features/config/useConfiguracion';

// La primera vez que entra el dueño de una instalación nueva, lo lleva solo al asistente de
// configuración inicial (en Configuración). Deja de hacerlo cuando el asistente se termina o se
// salta. A los demás usuarios nunca los toca.
export default function PuertaConfiguracionInicial({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { pathname } = useLocation();
  const { data: config } = useConfiguracionQuery();

  const pendiente = isOwner(profile) && !!config && config.inicial_cerrada_at == null;
  if (pendiente && pathname !== '/admin') return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
