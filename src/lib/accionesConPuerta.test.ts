/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// En la app de Next cada acción del servidor ('use server') es una dirección pública: cualquiera con sesión puede llamarla con lo que quiera.
// Por eso todas empiezan con entrada() (web/src/lib/entrada.ts), que exige la sesión, frena el exceso de pedidos y revisa los datos con Zod.
// Esta prueba falla si alguna acción, nueva o vieja, no empieza así.

const WEB = resolve(import.meta.dirname, '..', '..', 'web', 'src');
// Las únicas sin sesión, a propósito: entrar (tiene su propio freno de intentos, en la base) y salir.
const SIN_PUERTA = new Set(['entrar', 'salir']);
// Las que antes miran si hay sesión sin mandar a /entrar (corren solas, de fondo) y recién ahí pasan por la puerta: anotar un error de la
// pantalla no tiene que sacar a nadie de lo que está haciendo.
const PRIMERO_LA_SESION = new Set(['anotarErrorDeLaPantalla']);
const VER_LA_SESION = /^if \(!\(await usuarioActual\(\)\)\) return;$/;

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n: string) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

const deServidor = archivos(WEB).filter(f => /^\s*['"]use server['"]/.test(readFileSync(f, 'utf8')));

describe('acciones del servidor', () => {
  it('hay archivos de acciones', () => {
    expect(deServidor.length).toBeGreaterThan(5);
  });

  it('todas empiezan con entrada()', () => {
    const sinPuerta: string[] = [];
    let revisadas = 0;
    for (const archivo of deServidor) {
      // (en Windows git puede dejar los archivos con fin de línea \r\n)
      const texto = readFileSync(archivo, 'utf8').replace(/\r\n/g, '\n');
      // la primera instrucción de cada función exportada (sin contar los comentarios)
      for (const m of texto.matchAll(/^export async function (\w+)\([^\n]*\{\n((?:.*\n){1,6})/gm)) {
        if (SIN_PUERTA.has(m[1])) continue;
        revisadas += 1;
        const lineas = m[2].split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));
        if (PRIMERO_LA_SESION.has(m[1]) && VER_LA_SESION.test(lineas[0] ?? '')) lineas.shift();
        const primera = lineas[0] ?? '';
        if (!/^(const \w+ = )?await entrada\('/.test(primera) || !primera.includes(`'${m[1]}'`)) sinPuerta.push(`${relative(WEB, archivo)}: ${m[1]}`);
      }
      // nada exportado de otra forma (por ejemplo, export const x = async () => …), que se saltearía la revisión de arriba
      for (const m of texto.matchAll(/^export (const|let|default|function) (\w*)/gm)) sinPuerta.push(`${relative(WEB, archivo)}: export ${m[1]} ${m[2]}`);
    }
    expect(sinPuerta).toEqual([]);
    expect(revisadas).toBeGreaterThan(100);
  });
});
