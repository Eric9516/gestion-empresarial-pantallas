import 'server-only';
import { randomUUID } from 'node:crypto';
import type { DatosIniciales } from './useInicial';

// Los datos que una pantalla lee en el servidor y manda junto con ella (así no hace falta un segundo viaje para pedirlos al abrirla).
// El lote distingue esta lectura de la misma pantalla guardada en la memoria del navegador (ver useInicial).
export const datosIniciales = <T>(data: T): DatosIniciales<T> => ({ data, lote: randomUUID() });
