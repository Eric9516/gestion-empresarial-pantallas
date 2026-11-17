import type { ComponentProps } from 'react';
import type { VariantProps } from 'class-variance-authority';
import { botonVariantes } from './botonVariantes';
import { cn } from '@/lib/utils';

export function Button({ className, variant, size, ...props }: ComponentProps<'button'> & VariantProps<typeof botonVariantes>) {
  return <button data-slot="button" data-variant={variant ?? 'base'} className={cn(botonVariantes({ variant, size }), className)} {...props} />;
}
