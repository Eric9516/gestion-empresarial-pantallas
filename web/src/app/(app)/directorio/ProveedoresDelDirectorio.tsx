'use client';
import type { ReactNode } from 'react';
import { ConfirmProvider } from '@/components/ConfirmProvider';
import { ToastProvider } from '@/components/ToastProvider';

// Lo que comparten las pantallas del Directorio en el navegador: los avisos (toasts) y las preguntas de confirmación.
export default function ProveedoresDelDirectorio({ children }: { children: ReactNode }) {
  return <ToastProvider><ConfirmProvider>{children}</ConfirmProvider></ToastProvider>;
}
