import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './components/ToastProvider';
import { ConfirmProvider } from './components/ConfirmProvider';
import ErrorFallback from './components/ErrorFallback';
import { ErrorBoundary } from '@sentry/react';
import { initSentry } from './lib/sentry';
import { registrarError } from './lib/errorLogging';
import App from './App';

// Las tipografías de la marca se sirven desde la propia app (no desde Google): Nunito para todo el texto y Playfair Display solo en negrita para el nombre de la empresa.
// Se bajan solo las letras que se usan (latino) y con `swap`: el texto se ve enseguida con la letra del sistema y cambia en cuanto llega la propia.
import '@fontsource-variable/nunito/wght.css';
import '@fontsource/playfair-display/latin-700.css';
import './styles/index.css';

initSentry();

// Lo que ya se pidió se considera fresco 30 segundos: al pasar de una pantalla a otra o volver a la pestaña no se vuelve a pedir lo mismo al servidor.
// Lo que uno mismo cambia se actualiza igual y al instante (cada cambio invalida lo que toca); los datos que sí tienen que ser siempre nuevos fijan su propio plazo.
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary
      fallback={<ErrorFallback />}
      onError={error => { void registrarError(error instanceof Error ? error.message : String(error), error instanceof Error ? error.stack : null); }}
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <ConfirmProvider>
                <App />
              </ConfirmProvider>
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
