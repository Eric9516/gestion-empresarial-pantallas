'use client';
import type { ReactNode } from 'react';
import { ConfirmProvider } from '@/components/ConfirmProvider';
import { ToastProvider } from '@/components/ToastProvider';
import { RetiroCartProvider } from '@/features/retiros/RetiroCartContext';

// Lo que comparten las pantallas del Depósito en el navegador: los avisos (toasts), las preguntas de confirmación y el carrito de retiro, que se guarda en este
// navegador por persona (el mismo de la app de Vite).
export default function ProveedoresDelDeposito({ usuarioId, children }: { usuarioId: string; children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <RetiroCartProvider usuarioId={usuarioId}>{children}</RetiroCartProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
