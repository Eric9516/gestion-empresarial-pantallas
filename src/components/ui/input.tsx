import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { campoBase } from './campo';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(campoBase, 'placeholder:text-[var(--text-muted)] placeholder:font-normal', className)} {...props} />;
}
