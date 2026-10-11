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

import './styles/index.css';

initSentry();

const queryClient = new QueryClient();

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
