import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { campoBase } from './campo';

// Select nativo (se ve y funciona igual en el celular), con el estilo de los demás campos.
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select data-slot="select" className={cn(campoBase, '[&_option]:bg-[var(--white)]', className)} {...props} />;
}
