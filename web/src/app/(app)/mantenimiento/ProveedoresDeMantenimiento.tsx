'use client';
import type { ReactNode } from 'react';
import { ConfirmProvider } from '@/components/ConfirmProvider';
import { ToastProvider } from '@/components/ToastProvider';

// Lo que comparten las pantallas de Mantenimiento en el navegador: los avisos (toasts) y las preguntas de confirmación.
export default function ProveedoresDeMantenimiento({ children }: { children: ReactNode }) {
  return <ToastProvider><ConfirmProvider>{children}</ConfirmProvider></ToastProvider>;
}
