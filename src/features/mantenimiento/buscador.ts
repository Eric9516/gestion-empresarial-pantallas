import { formatearFechaSola } from '../../lib/fechaHoy';
import type { Equipo, Intervencion, Manual, RepuestoCritico } from './tipos';

// Buscador de equipos por palabras clave (del diseño del socio). Busca en los datos del equipo y también en su historial, sus repuestos
// críticos y sus manuales. Sin importar tildes ni mayúsculas. Con varias palabras, el equipo tiene que tener TODAS (en cualquier lugar).
// Corre en el servidor (la acción buscarEquipos), con el historial que ya filtró la base.

/** Minúsculas y sin tildes: "Compresión" → "compresion". */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Palabras que aparecen en casi todo y no ayudan a distinguir (igual que en el buscador de repuestos).
const CONECTORAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'en', 'a', 'un', 'una', 'para', 'con', 'sin', 'por']);

export function palabrasDeBusqueda(consulta: string): string[] {
  const todas = normalizar(consulta).split(/[\s,;]+/).filter(Boolean);
  const utiles = todas.filter(p => !CONECTORAS.has(p));
  return utiles.length ? utiles : todas;
}

interface Campo {
  /** Dónde está ("código", "historial 12/09/2026"...), para explicar por qué apareció. */
  donde: string;
  texto: string;
  /** Cuánto pesa una coincidencia acá (el código y el nombre pesan más que el historial). */
  peso: number;
}

export interface Relacionados {
  intervenciones: Intervencion[];
  repuestos: Pick<RepuestoCritico, 'codigo' | 'descripcion' | 'nota'>[];
  manuales: Pick<Manual, 'nombre'>[];
  /** Si es un sub-equipo, su equipo principal ("bomba pasteurizador 2" encuentra la bomba del PA-02). */
  padre?: Equipo | null;
}

function camposDe(e: Equipo, rel: Relacionados): Campo[] {
  const campos: Campo[] = [
    { donde: 'código', texto: e.codigo, peso: 10 },
    { donde: 'nombre', texto: e.nombre, peso: 8 },
    { donde: 'sector', texto: e.sector, peso: 6 },
    { donde: 'sub-sector', texto: e.subsector, peso: 6 },
    { donde: 'etiquetas', texto: e.etiquetas.join(' '), peso: 6 },
    { donde: 'marca', texto: e.marca, peso: 4 },
    { donde: 'modelo', texto: e.modelo, peso: 4 },
    { donde: 'n.º de serie', texto: e.numeroSerie, peso: 4 },
    { donde: 'ubicación', texto: e.ubicacion, peso: 3 },
    { donde: 'notas', texto: e.notas, peso: 2 },
  ];
  if (rel.padre) campos.push({ donde: 'equipo principal', texto: `${rel.padre.codigo} ${rel.padre.nombre}`, peso: 5 });
  // El historial más nuevo primero, así el motivo muestra la vez más reciente.
  for (const i of [...rel.intervenciones].sort((a, b) => b.fecha.localeCompare(a.fecha))) {
    const c = i.correctivo;
    const texto = [i.tipo, i.descripcion, i.repuestosUsados, ...i.tecnicos.map(t => t.nombre), c?.falla, c?.causa, c?.solucion].filter(Boolean).join(' ');
    campos.push({ donde: `historial ${formatearFechaSola(i.fecha)}`, texto, peso: 2 });
  }
  for (const r of rel.repuestos) campos.push({ donde: 'repuestos críticos', texto: `${r.codigo} ${r.descripcion} ${r.nota}`, peso: 3 });
  for (const m of rel.manuales) campos.push({ donde: 'manuales', texto: m.nombre, peso: 2 });
  return campos.map(c => ({ ...c, texto: normalizar(c.texto) }));
}

export interface ResultadoBusqueda<E extends Equipo = Equipo> {
  equipo: E;
  puntaje: number;
  /** Lugares donde coincidió, sin repetir ("nombre", "historial 12/09/2026"). */
  motivos: string[];
}

/**
 * Filtra y ordena los equipos según lo escrito. Sin palabras, devuelve todos (por nombre).
 * `relacionadosDe` da el historial, repuestos y manuales de cada equipo.
 */
export function buscarEquipos<E extends Equipo>(equipos: E[], consulta: string, relacionadosDe: (equipoId: string) => Relacionados): ResultadoBusqueda<E>[] {
  const palabras = palabrasDeBusqueda(consulta);
  if (!palabras.length) {
    return [...equipos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(equipo => ({ equipo, puntaje: 0, motivos: [] }));
  }
  const resultados: ResultadoBusqueda<E>[] = [];
  for (const equipo of equipos) {
    const campos = camposDe(equipo, relacionadosDe(equipo.id));
    let puntaje = 0;
    const motivos: string[] = [];
    let todas = true;
    for (const p of palabras) {
      const encontrados = campos.filter(c => c.texto.includes(p));
      if (!encontrados.length) { todas = false; break; }
      // Suma el mejor lugar donde apareció; una palabra que es exactamente el código suma de más.
      puntaje += Math.max(...encontrados.map(c => c.peso)) + (normalizar(equipo.codigo) === p ? 20 : 0);
      const primero = encontrados.reduce((a, b) => (b.peso > a.peso ? b : a));
      if (!motivos.includes(primero.donde)) motivos.push(primero.donde);
    }
    if (todas) resultados.push({ equipo, puntaje, motivos });
  }
  return resultados.sort((a, b) => b.puntaje - a.puntaje || a.equipo.nombre.localeCompare(b.equipo.nombre, 'es'));
}
