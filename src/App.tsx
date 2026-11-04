import { lazy, Suspense } from 'react';
import { Navigate, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import ProtectedLayout from './routes/ProtectedLayout';
import GuestOnlyLayout from './routes/GuestOnlyLayout';
import AplicarMarca from './components/AplicarMarca';

// Cada pantalla grande se descarga recién cuando se entra a ella (el login
// queda en el paquete inicial para que abra rápido).
const cargarDirectorio = () => import('./pages/DirectorioPage');
const cargarDeposito = () => import('./pages/DepositoPage');
const cargarMantenimiento = () => import('./pages/MantenimientoPage');
const cargarAdmin = () => import('./pages/AdminPage');
const DirectorioPage = lazy(cargarDirectorio);
const DepositoPage = lazy(cargarDeposito);
const MantenimientoPage = lazy(cargarMantenimiento);
const AdminPage = lazy(cargarAdmin);

// La pantalla que se abrió se empieza a descargar ya, mientras se verifica la sesión (antes se esperaba a saber que había sesión para recién pedir su archivo).
// En /login no se descarga nada de más. Pedir dos veces el mismo archivo no cuesta: el navegador lo guarda.
const RUTA_ABIERTA = window.location.pathname;
if (RUTA_ABIERTA === '/') void cargarDirectorio();
else if (RUTA_ABIERTA.startsWith('/deposito')) void cargarDeposito();
else if (RUTA_ABIERTA.startsWith('/mantenimiento')) void cargarMantenimiento();
else if (RUTA_ABIERTA.startsWith('/admin')) void cargarAdmin();

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
          <Route path="/deposito" element={<DepositoPage />} />
          <Route path="/mantenimiento" element={<MantenimientoPage />} />
          {/* Dirección que usó el módulo Mantenimiento mientras se armaba. */}
          <Route path="/equipos" element={<Navigate to="/mantenimiento" replace />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
