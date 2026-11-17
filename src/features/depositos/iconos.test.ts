import { describe, expect, it } from 'vitest';
import { ICONOS_DEPOSITO, ICONO_DEPOSITO_POR_DEFECTO, iconoDeDeposito } from './iconos';

describe('íconos de depósito', () => {
  it('un ícono de la lista se respeta', () => {
    for (const n of ICONOS_DEPOSITO) expect(iconoDeDeposito(n)).toBe(n);
  });

  it('sin ícono, o con uno que ya no existe, se usa el de depósito', () => {
    expect(iconoDeDeposito(undefined)).toBe(ICONO_DEPOSITO_POR_DEFECTO);
    expect(iconoDeDeposito(null)).toBe(ICONO_DEPOSITO_POR_DEFECTO);
    expect(iconoDeDeposito('')).toBe(ICONO_DEPOSITO_POR_DEFECTO);
    expect(iconoDeDeposito('ya-no-existe')).toBe(ICONO_DEPOSITO_POR_DEFECTO);
  });

  it('la lista no repite íconos', () => {
    expect(new Set(ICONOS_DEPOSITO).size).toBe(ICONOS_DEPOSITO.length);
  });
});
