'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { CampoCustom } from '@/features/config/camposCustom';
import type { Comisionista, ComisionistaInput } from '@/features/comisionistas/tipos';
import type { ContactoInput, Proveedor, ProveedorInput } from '@/features/proveedores/tipos';
import type { Profile } from '@/lib/types';
import { comoUsuario } from '~/lib/db';

import { IdONulo, Id, Lista, SiNoONulo, Texto, TextoONulo, entrada } from '~/lib/entrada';
import { mensajeDe } from '~/lib/registroDeErrores';
import type { PoolClient } from 'pg';

// Directorio: proveedores (con sus contactos) y comisionistas. Las mismas reglas que la app de Vite: la base decide quién ve y cambia qué.
// Los registros se leen con to_jsonb (igual que de Supabase) y la versión de cada uno (updated_at) se compara exacta al guardar.

const esId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const texto = (v: unknown, largo: number) => String(v ?? '').trim().slice(0, largo);
type Resultado = { error: string | null; conflicto: boolean };
const conError = (error: string): Resultado => ({ error, conflicto: false });

// Lo que reciben las acciones (lo revisa entrada(): ver ~/lib/entrada)
const t = TextoONulo(300);
const Proveedor = z.object({
  id: IdONulo, version: TextoONulo(60),
  data: z.object({ nombre: t, rubro: t, email: t, direccion: t, localidad: t, provincia: t, codigo_postal: t, horario: t, notas: TextoONulo(5000), activo: SiNoONulo }),
  contactos: Lista(z.object({ id: TextoONulo(60), nombre: t, cargo: t, telefono: t, celular: t, email: t }), 200),
});
const Comisionista = z.object({
  id: IdONulo, version: TextoONulo(60),
  data: z.object({
    nombre: t, zona: t, empresa: t, telefono: t, celular: t, email: t, localidad: t, provincia: t, notas: TextoONulo(5000), activo: SiNoONulo,
    campos_extra: z.record(Texto(100), TextoONulo(2000)).nullish(),
  }),
});

/** "Modificado por": el nombre (o el correo) de quien guarda, como en la app de Vite. */
async function quienModifica(c: PoolClient): Promise<string> {
  const { rows: [p] } = await c.query<Pick<Profile, 'nombre' | 'email'>>('select nombre, email from public.usuarios_perfil where id = auth.uid()');
  return p?.nombre || p?.email || 'Usuario';
}

/** Actualiza solo si la versión es la que se editó (o si nunca se modificó: version null). */
const condicionDeVersion = (version: string | null | undefined, n: number) => (version === null ? 'updated_at is null' : `updated_at = $${n}::timestamptz`);

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------------------------------------------------------------------------

export async function listaDeProveedores(): Promise<Proveedor[]> {
  const usuario = await entrada('listaDeProveedores');
  return comoUsuario(usuario, async c => (await c.query<{ r: Proveedor }>(`
    select to_jsonb(p) || jsonb_build_object('contactos',
      (select coalesce(jsonb_agg(to_jsonb(k) order by k.created_at, k.id), '[]') from public.contactos k where k.proveedor_id = p.id)) as r
    from public.proveedores p where not p.eliminado order by p.nombre`)).rows.map(x => x.r));
}

const CAMPOS_DE_PROVEEDOR = ['nombre', 'rubro', 'email', 'direccion', 'localidad', 'provincia', 'codigo_postal', 'horario', 'notas'] as const;

export async function guardarProveedor(g: { id: string | null; data: ProveedorInput; contactos: ContactoInput[]; version?: string | null }): Promise<Resultado> {
  const usuario = await entrada('guardarProveedor', [Proveedor], [g]);
  if (!texto(g.data?.nombre, 200)) return conError('Completá el nombre');
  if (g.id && !esId(g.id)) return conError('Proveedor no válido');
  const valores = CAMPOS_DE_PROVEEDOR.map(k => texto(g.data[k], k === 'notas' ? 2000 : 300));
  try {
    const r = await comoUsuario(usuario, async (c): Promise<Resultado> => {
      const modificadoPor = await quienModifica(c);
      let id = g.id;
      if (id) {
        const sets = CAMPOS_DE_PROVEEDOR.map((k, i) => `${k} = $${i + 2}`).join(', ');
        const n = CAMPOS_DE_PROVEEDOR.length + 2;
        const sql = `update public.proveedores set ${sets}, activo = $${n}, modificado_por = $${n + 1}, updated_at = now()
                     where id = $1${g.version === undefined ? '' : ` and ${condicionDeVersion(g.version, n + 2)}`}`;
        const { rowCount } = await c.query(sql, [id, ...valores, !!g.data.activo, modificadoPor, ...(g.version ? [g.version] : [])]);
        if (!rowCount) return g.version === undefined ? conError('No se encontró el proveedor') : { error: null, conflicto: true };
      } else {
        const cols = [...CAMPOS_DE_PROVEEDOR, 'activo', 'modificado_por', 'updated_at'];
        const { rows: [nuevo] } = await c.query<{ id: string }>(
          `insert into public.proveedores (${cols.join(', ')}) values (${CAMPOS_DE_PROVEEDOR.map((_, i) => `$${i + 1}`).join(', ')}, $${CAMPOS_DE_PROVEEDOR.length + 1}, $${CAMPOS_DE_PROVEEDOR.length + 2}, now()) returning id`,
          [...valores, !!g.data.activo, modificadoPor]);
        id = nuevo.id;
      }
      // Contactos: los nuevos se agregan, los que siguen se actualizan y recién al final se borran los que ya no están (un corte a mitad nunca
      // deja al proveedor sin contactos). Igual que en la app de Vite.
      const actuales = new Set((await c.query<{ id: string }>('select id from public.contactos where proveedor_id = $1', [id])).rows.map(x => x.id));
      const validos = (g.contactos ?? []).slice(0, 50).filter(k => texto(k.nombre, 200));
      const existentes = validos.filter(k => k.id && actuales.has(k.id));
      const nuevos = validos.filter(k => !k.id || !actuales.has(k.id));
      const quedan = new Set(existentes.map(k => k.id));
      const datos = (k: ContactoInput) => [texto(k.nombre, 200), texto(k.cargo, 120), texto(k.telefono, 60), texto(k.celular, 60), texto(k.email, 200)];
      for (const k of nuevos) await c.query('insert into public.contactos (proveedor_id, nombre, cargo, telefono, celular, email) values ($1, $2, $3, $4, $5, $6)', [id, ...datos(k)]);
      for (const k of existentes) await c.query('update public.contactos set nombre = $2, cargo = $3, telefono = $4, celular = $5, email = $6 where id = $1', [k.id, ...datos(k)]);
      const sobran = [...actuales].filter(x => !quedan.has(x));
      if (sobran.length) await c.query('delete from public.contactos where id = any($1::uuid[])', [sobran]);
      return { error: null, conflicto: false };
    });
    if (!r.error && !r.conflicto) revalidatePath('/directorio', 'layout');
    return r;
  } catch (e) {
    return conError(mensajeDe(e, 'No se pudo guardar el proveedor'));
  }
}

/** Lo manda a la Papelera (no lo borra): queda quién y cuándo. */
export async function eliminarProveedor(id: string): Promise<{ error: string | null }> {
  const usuario = await entrada('eliminarProveedor', [Id], [id]);
  if (!esId(id)) return { error: 'Proveedor no válido' };
  try {
    const { rowCount } = await comoUsuario(usuario, c =>
      c.query('update public.proveedores set eliminado = true, eliminado_por = auth.uid(), eliminado_at = now() where id = $1', [id]));
    if (!rowCount) return { error: 'No podés eliminar este proveedor' };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo eliminar') };
  }
  revalidatePath('/directorio', 'layout');
  return { error: null };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Comisionistas
// ---------------------------------------------------------------------------------------------------------------------------------------------

export async function listaDeComisionistas(): Promise<{ comisionistas: Comisionista[]; camposCustom: CampoCustom[] }> {
  const usuario = await entrada('listaDeComisionistas');
  return comoUsuario(usuario, async c => ({
    comisionistas: (await c.query<{ r: Comisionista }>('select to_jsonb(k) as r from public.comisionistas k order by k.nombre')).rows.map(x => x.r),
    camposCustom: (await c.query<{ campos: CampoCustom[] | null }>('select comisionistas_campos_custom as campos from public.configuracion where id = 1')).rows[0]?.campos ?? [],
  }));
}

const CAMPOS_DE_COMISIONISTA = ['nombre', 'zona', 'empresa', 'telefono', 'celular', 'email', 'localidad', 'provincia', 'notas'] as const;

export async function guardarComisionista(g: { id: string | null; data: ComisionistaInput; version?: string | null }): Promise<Resultado> {
  const usuario = await entrada('guardarComisionista', [Comisionista], [g]);
  if (!texto(g.data?.nombre, 200)) return conError('Completá el nombre');
  if (g.id && !esId(g.id)) return conError('Comisionista no válido');
  const valores = CAMPOS_DE_COMISIONISTA.map(k => texto(g.data[k], k === 'notas' ? 2000 : 300));
  const extra = Object.fromEntries(Object.entries(g.data.campos_extra ?? {}).slice(0, 50).map(([k, v]) => [k.slice(0, 60), texto(v, 500)]));
  try {
    const r = await comoUsuario(usuario, async (c): Promise<Resultado> => {
      const modificadoPor = await quienModifica(c);
      const n = CAMPOS_DE_COMISIONISTA.length;
      if (g.id) {
        const sets = CAMPOS_DE_COMISIONISTA.map((k, i) => `${k} = $${i + 2}`).join(', ');
        const sql = `update public.comisionistas set ${sets}, activo = $${n + 2}, campos_extra = $${n + 3}::jsonb, modificado_por = $${n + 4}, updated_at = now()
                     where id = $1${g.version === undefined ? '' : ` and ${condicionDeVersion(g.version, n + 5)}`}`;
        const { rowCount } = await c.query(sql, [g.id, ...valores, !!g.data.activo, JSON.stringify(extra), modificadoPor, ...(g.version ? [g.version] : [])]);
        if (!rowCount) return g.version === undefined ? conError('No se encontró el comisionista') : { error: null, conflicto: true };
      } else {
        await c.query(`insert into public.comisionistas (${CAMPOS_DE_COMISIONISTA.join(', ')}, activo, campos_extra, modificado_por, updated_at)
                       values (${CAMPOS_DE_COMISIONISTA.map((_, i) => `$${i + 1}`).join(', ')}, $${n + 1}, $${n + 2}::jsonb, $${n + 3}, now())`,
        [...valores, !!g.data.activo, JSON.stringify(extra), modificadoPor]);
      }
      return { error: null, conflicto: false };
    });
    if (!r.error && !r.conflicto) revalidatePath('/directorio', 'layout');
    return r;
  } catch (e) {
    return conError(mensajeDe(e, 'No se pudo guardar el comisionista'));
  }
}

/** Comisionistas no tiene Papelera: se borra (igual que en la app de Vite). */
export async function eliminarComisionista(id: string): Promise<{ error: string | null }> {
  const usuario = await entrada('eliminarComisionista', [Id], [id]);
  if (!esId(id)) return { error: 'Comisionista no válido' };
  try {
    const { rowCount } = await comoUsuario(usuario, c => c.query('delete from public.comisionistas where id = $1', [id]));
    if (!rowCount) return { error: 'No podés eliminar este comisionista' };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo eliminar') };
  }
  revalidatePath('/directorio', 'layout');
  return { error: null };
}
