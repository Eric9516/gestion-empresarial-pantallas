import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import ProtectedLayout from './routes/ProtectedLayout';
import GuestOnlyLayout from './routes/GuestOnlyLayout';
import AplicarMarca from './components/AplicarMarca';

// Cada pantalla grande se descarga recién cuando se entra a ella (el login
// queda en el paquete inicial para que abra rápido).
const DirectorioPage = lazy(() => import('./pages/DirectorioPage'));
const MantenimientoPage = lazy(() => import('./pages/MantenimientoPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

export default function App() {
  return (
    <Suspense fallback={<p style={{ padding: 24, color: 'var(--text-muted)' }}>Cargando...</p>}>
      <AplicarMarca />
      <Routes>
        <Route element={<GuestOnlyLayout />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<DirectorioPage />} />
          <Route path="/mantenimiento" element={<MantenimientoPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
