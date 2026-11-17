import type { Deposito } from './tipos';

// Lo que usa un depósito además de lo básico (buscar, recibir mercadería, ajustes y movimientos), en pocas palabras. Lo decide Compras.
export function comoTrabaja(d: Pick<Deposito, 'usa_retiros' | 'usa_reparaciones'>): string {
  const usa = [d.usa_retiros && 'retiros de operarios', d.usa_reparaciones && 'reparaciones'].filter(Boolean);
  return usa.length ? `Con ${usa.join(' y ')}` : 'Solo recibe y ajusta stock';
}
