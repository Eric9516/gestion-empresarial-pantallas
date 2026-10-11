import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { campoBase } from './campo';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(campoBase, 'resize-y min-h-[80px] placeholder:text-[var(--text-muted)] placeholder:font-normal', className)} {...props} />;
}
