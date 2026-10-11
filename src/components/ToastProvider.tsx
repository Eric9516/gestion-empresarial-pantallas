import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icono } from '@/components/Icono';

type ToastType = 'success' | 'error';
interface ToastState { message: string; type: ToastType; show: boolean }

const ToastContext = createContext<((message: string, type?: ToastType) => void) | undefined>(undefined);

const ICONS: Record<ToastType, ReactNode> = { success: <Icono n="ok" />, error: <Icono n="cerrar" /> };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toastState, setToastState] = useState<ToastState>({ message: '', type: 'success', show: false });
  const timeoutRef = useRef<number | undefined>(undefined);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    window.clearTimeout(timeoutRef.current);
    setToastState({ message, type, show: true });
    timeoutRef.current = window.setTimeout(() => {
      setToastState(prev => ({ ...prev, show: false }));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div role="status" aria-live="polite" className={`toast ${toastState.type} ${toastState.show ? 'show' : ''}`}>
        <span style={{ color: toastState.type === 'success' ? 'var(--success)' : 'var(--danger)', fontSize: 16 }}>
          {ICONS[toastState.type]}
        </span>
        {toastState.message}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}
