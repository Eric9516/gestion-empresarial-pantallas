import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Reproduce al píxel los botones de siempre (.btn, .btn-primary, etc.). El tamaño
// según dónde esté el botón (pie de ventana, tarjeta) lo define contexto-botones.css.
const botonVariantes = cva(
  'inline-flex items-center gap-[7px] whitespace-nowrap no-underline cursor-pointer border-none border-current font-[family-name:var(--font)] text-[14px] font-bold tracking-[0.2px] px-5 py-2.5 rounded-[var(--radius-sm)] [transition:all_0.18s]',
  {
    variants: {
      variant: {
        base: '',
        primary: 'bg-[var(--blue)] text-white hover:bg-[var(--blue-mid)] hover:-translate-y-px hover:shadow-[0_4px_12px_color-mix(in_srgb,var(--blue)_30%,transparent)]',
        red: 'bg-[var(--red)] text-white hover:bg-[var(--red-light)] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(200,34,42,0.3)]',
        ghost: 'bg-transparent text-[var(--text-mid)] border-[1.5px] border-solid border-[var(--border)] hover:bg-[var(--surface2)] hover:border-[#b0bec5] hover:text-[var(--text)]',
        success: 'bg-[var(--success)] text-white hover:bg-[#1d8a54]',
        dangerGhost: 'bg-transparent text-[var(--danger)] border-[1.5px] border-solid border-transparent px-3 py-[7px] text-[13px] hover:bg-[var(--danger-bg)] hover:border-[var(--danger)]',
      },
      size: {
        default: '',
        sm: 'px-3.5 py-[7px] text-[13px]',
        icon: 'p-2 rounded-[8px] text-[13px]',
        full: 'w-full justify-center p-[13px] text-[15px]',
      },
    },
    defaultVariants: { variant: 'base', size: 'default' },
  },
);

export function Button({ className, variant, size, ...props }: ComponentProps<'button'> & VariantProps<typeof botonVariantes>) {
  return <button data-slot="button" className={cn(botonVariantes({ variant, size }), className)} {...props} />;
}
