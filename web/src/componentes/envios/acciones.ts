'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { disenoDelRotulo, type RotuloSnapshot } from '@/lib/generarRotuloPdf';
import { slugifyProv } from '@/lib/slugify';
import type { UsuarioBasico } from '@/lib/nombreUsuario';
import type { Comisionista } from '@/features/comisionistas/tipos';
import type { Proveedor } from '@/features/proveedores/tipos';
import { MAX_FOTOS_ROTULO } from '@/features/rotulos/fotosDelEnvio';
import type { ArticuloParaRotulo, EnvioAGuardar, EnvioConBultos, FotoDeEnvio } from '@/features/rotulos/servicioDeEnvios';
import type { RotuloBulto, RotuloFoto, RotuloGenerado } from '@/features/rotulos/tipos';
import { borrarArchivo, guardarArchivo, urlPublica } from '~/lib/archivos';
import { contexto } from '~/lib/contexto';
import { comoUsuario } from '~/lib/db';

import { Cantidad, Formulario, Id, Lista, TextoONulo, entrada } from '~/lib/entrada';
import { mensajeDe } from '~/lib/registroDeErrores';
import type { PoolClient } from 'pg';

// Envíos (rótulos): la lista, las ventanas (editor, detalle, versiones, fotos, comentario) y lo que se guarda. Las usan Directorio → Envíos,
// "Rótulo" en Proveedores y "Ver envío" en Reparaciones. La base decide quién ve y cambia qué, igual que con Supabase.

const esId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

// Lo que reciben las acciones (lo revisa entrada(): ver ~/lib/entrada)
const Envio = z.object({
  proveedorId: TextoONulo(60), w: Cantidad, h: Cantidad, bultosDetalle: Lista(TextoONulo(2000), 500), extra: TextoONulo(2000),
  docInfo: z.object({ tipoDoc: TextoONulo(40), numDoc: TextoONulo(100), valorDeclarado: TextoONulo(100), comisionistaId: TextoONulo(60) }).nullish(),
  editando: z.object({ rotuloId: Id, grupoId: Id, motivo: TextoONulo(1000) }).nullish(),
});
const texto = (v: unknown, largo: number) => String(v ?? '').trim().slice(0, largo);
const aviso = (mensaje: string) => Object.assign(new Error(mensaje), { code: 'P0001' });

/** Los envíos vigentes (como en la app de Vite: los últimos 300) y quién creó cada uno. */
export async function listaDeEnvios(): Promise<{ envios: RotuloGenerado[]; autores: Record<string, UsuarioBasico> }> {
  const usuario = await entrada('listaDeEnvios');
  return comoUsuario(usuario, async c => {
    const envios = (await c.query<{ r: RotuloGenerado }>(`
      select to_jsonb(r) - 'design_snapshot' as r from public.rotulos_generados r where r.vigente and not r.eliminado order by r.created_at desc limit 300`)).rows.map(x => x.r);
    const ids = [...new Set(envios.map(e => e.creado_por).filter((v): v is string => !!v))];
    const autores = (await c.query<UsuarioBasico & { id: string }>(
      'select id, nombre, apellido, email from public.usuarios_perfil where id = any($1::uuid[])', [ids])).rows;
    return { envios, autores: Object.fromEntries(autores.map(a => [a.id, a])) };
  });
}

/** Lo que necesitan las ventanas: proveedores (con contactos, para el rótulo), comisionistas y el diseño de ahora. */
export async function datosParaEnvios(): Promise<{ proveedores: Proveedor[]; comisionistas: Comisionista[]; conComisionistas: boolean; diseno: RotuloSnapshot; conArticulos: boolean }> {
  const usuario = await entrada('datosParaEnvios');
  const { integ } = await contexto();
  // si la persona tiene algún depósito, puede agregar artículos del stock a la descripción de los bultos (aparte: sin el Depósito, la función no está)
  const conArticulos = await comoUsuario(usuario, async c =>
    (await c.query<{ x: boolean }>('select public.modulo_activo(\'deposito\') and cardinality(public.mis_depositos()) > 0 as x')).rows[0].x).catch(() => false);
  return comoUsuario(usuario, async c => {
    const proveedores = (await c.query<{ r: Proveedor }>(`
      select to_jsonb(p) || jsonb_build_object('contactos',
        (select coalesce(jsonb_agg(to_jsonb(k) order by k.created_at, k.id), '[]') from public.contactos k where k.proveedor_id = p.id)) as r
      from public.proveedores p where not p.eliminado order by p.nombre`)).rows.map(x => x.r);
    const comisionistas = (await c.query<{ r: Comisionista }>('select to_jsonb(k) as r from public.comisionistas k order by k.nombre')).rows.map(x => x.r);
    const { rows: [config] } = await c.query<Parameters<typeof disenoDelRotulo>[0]>(
      'select rotulo_design, rotulo_campos, rotulo_pie, empresa_nombre, logo_base64 from public.configuracion where id = 1');
    return {
      proveedores, comisionistas, conComisionistas: integ.enviosConComisionistas, conArticulos,
      diseno: disenoDelRotulo(config ?? { rotulo_design: null, rotulo_campos: null, rotulo_pie: null, empresa_nombre: null, logo_base64: null }),
    };
  });
}

/** Artículos del stock (en los depósitos de la persona) para la descripción de un bulto. No toca el stock. */
export async function articulosParaRotulo(texto: string): Promise<ArticuloParaRotulo[]> {
  const usuario = await entrada('articulosParaRotulo', [TextoONulo(200)], [texto]);
  if (!texto?.trim()) return [];
  try {
    return await comoUsuario(usuario, async c => (await c.query<{ id: string; codigo: string; descripcion: string; stock: string | null; unidad: string; deposito: string }>(
      'select * from public.articulos_para_rotulo($1, 12)', [texto.trim().slice(0, 200)])).rows.map(a => ({ ...a, stock: a.stock === null ? null : Number(a.stock) })));
  } catch {
    return [];
  }
}

/** Los rótulos viejos tienen el PDF guardado; los de ahora se arman en el momento. */
const conUrl = (b: RotuloBulto) => ({ ...b, url: b.storage_path ? urlPublica('rotulos', b.storage_path) : null });

async function envioConBultos(c: PoolClient, id: string): Promise<EnvioConBultos> {
  const { rows: [fila] } = await c.query<{ r: RotuloGenerado }>('select to_jsonb(r) as r from public.rotulos_generados r where r.id = $1', [id]);
  if (!fila) throw aviso('No se encontró el envío');
  const bultos = (await c.query<{ r: RotuloBulto }>(
    'select to_jsonb(b) as r from public.rotulos_bultos b where b.rotulo_id = $1 order by b.numero', [id])).rows;
  return { rotulo: fila.r, bultos: bultos.map(b => conUrl(b.r)) };
}

export async function leerEnvio(id: string): Promise<EnvioConBultos> {
  const usuario = await entrada('leerEnvio', [Id], [id]);
  if (!esId(id)) throw new Error('Envío no válido');
  return comoUsuario(usuario, c => envioConBultos(c, id));
}

export async function versionesDeEnvio(grupoId: string): Promise<RotuloGenerado[]> {
  const usuario = await entrada('versionesDeEnvio', [Id], [grupoId]);
  if (!esId(grupoId)) throw new Error('Envío no válido');
  return comoUsuario(usuario, async c => (await c.query<{ r: RotuloGenerado }>(
    'select to_jsonb(r) as r from public.rotulos_generados r where r.grupo_id = $1 order by r.version desc', [grupoId])).rows.map(x => x.r));
}

const TIPOS_DE_DOCUMENTO = new Set(['', 'remito', 'despacho']);
const MAXIMO_DE_BULTOS = 200;

/**
 * Guarda un envío nuevo, o una versión nueva de uno (al editar): la anterior deja de ser la vigente y queda en el historial, con el motivo.
 * Se copia el diseño de ahora, para poder rearmar el mismo PDF más adelante aunque cambie la configuración. Todo junto o nada.
 */
export async function guardarEnvio(e: EnvioAGuardar): Promise<{ envio: EnvioConBultos | null; error: string | null }> {
  const usuario = await entrada('guardarEnvio', [Envio], [e]);
  const w = Number(e?.w), h = Number(e?.h);
  const doc = e?.docInfo ?? {};
  if (!esId(e?.proveedorId)) return { envio: null, error: 'Elegí un proveedor' };
  if (!(w >= 10 && w <= 2000 && h >= 10 && h <= 2000)) return { envio: null, error: 'El tamaño no es válido' };
  const bultos = Array.isArray(e.bultosDetalle) ? e.bultosDetalle.map(d => texto(d, 2000)) : [];
  if (!bultos.length || bultos.length > MAXIMO_DE_BULTOS) return { envio: null, error: `Entre 1 y ${MAXIMO_DE_BULTOS} bultos` };
  if (!TIPOS_DE_DOCUMENTO.has(doc.tipoDoc ?? '')) return { envio: null, error: 'El tipo de documento no es válido' };
  if (doc.comisionistaId && !esId(doc.comisionistaId)) return { envio: null, error: 'El comisionista no es válido' };
  const ed = e.editando;
  if (ed && (!esId(ed.rotuloId) || !esId(ed.grupoId))) return { envio: null, error: 'Envío no válido' };
  if (ed && !texto(ed.motivo, 1000)) return { envio: null, error: 'Contá el motivo de la edición antes de guardar' };
  try {
    const envio = await comoUsuario(usuario, async c => {
      const { rows: [config] } = await c.query<Parameters<typeof disenoDelRotulo>[0]>(
        'select rotulo_design, rotulo_campos, rotulo_pie, empresa_nombre, logo_base64 from public.configuracion where id = 1');
      let grupo: string | null = null, version = 1, comentario: string | null = null;
      if (ed) {
        // la que se editó tiene que seguir siendo la vigente (si otro la cambió en el medio, se avisa en vez de pisarla)
        const { rows: vigentes } = await c.query<{ id: string; comentario: string | null; version: number }>(
          `update public.rotulos_generados set vigente = false where grupo_id = $1 and vigente
           returning id, comentario, (select max(version) from public.rotulos_generados where grupo_id = $1) as version`, [ed.grupoId]);
        if (!vigentes.length) throw aviso('No podés editar este envío');
        const actual = vigentes.find(v => v.id === ed.rotuloId);
        if (!actual) throw aviso('Este envío cambió mientras lo editabas: cerrá y volvé a abrirlo');
        grupo = ed.grupoId;
        version = actual.version + 1;
        // el comentario se edita aparte: la versión nueva lo conserva
        comentario = actual.comentario;
      }
      const { rows: [nuevo] } = await c.query<{ id: string }>(`
        insert into public.rotulos_generados (proveedor_id, tipo_documento, numero_documento, valor_declarado, comisionista_id, bulto_total, extra,
          ancho_mm, alto_mm, design_snapshot, creado_por, vigente, grupo_id, version, motivo_edicion, comentario)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, auth.uid(), true, coalesce($11, gen_random_uuid()), $12, $13, $14) returning id`,
      [e.proveedorId, doc.tipoDoc || null, texto(doc.numDoc, 100) || null, texto(doc.valorDeclarado, 100) || null, doc.comisionistaId || null,
        bultos.length, texto(e.extra, 500) || null, w, h, JSON.stringify(disenoDelRotulo(config)), grupo, version, ed ? texto(ed.motivo, 1000) : null,
        comentario]);
      for (const [i, detalle] of bultos.entries()) {
        await c.query('insert into public.rotulos_bultos (rotulo_id, numero, detalle) values ($1, $2, $3)', [nuevo.id, i + 1, detalle || null]);
      }
      return envioConBultos(c, nuevo.id);
    });
    revalidatePath('/directorio/envios');
    return { envio, error: null };
  } catch (err) {
    return { envio: null, error: mensajeDe(err, 'No se pudo guardar el envío') };
  }
}

export async function guardarComentarioDeEnvio(id: string, comentario: string): Promise<{ error: string | null }> {
  const usuario = await entrada('guardarComentarioDeEnvio', [Id, TextoONulo(5000)], [id, comentario]);
  if (!esId(id)) return { error: 'Envío no válido' };
  try {
    const { rowCount } = await comoUsuario(usuario, c =>
      c.query('update public.rotulos_generados set comentario = $2 where id = $1', [id, texto(comentario, 2000) || null]));
    if (!rowCount) return { error: 'No podés cambiar el comentario de este envío' };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo guardar el comentario') };
  }
  revalidatePath('/directorio/envios');
  return { error: null };
}

/** Manda el envío (todas sus versiones) a la Papelera: queda quién y cuándo. */
export async function eliminarEnvio(grupoId: string): Promise<{ error: string | null }> {
  const usuario = await entrada('eliminarEnvio', [Id], [grupoId]);
  if (!esId(grupoId)) return { error: 'Envío no válido' };
  try {
    const { rowCount } = await comoUsuario(usuario, c => c.query(
      'update public.rotulos_generados set eliminado = true, eliminado_por = auth.uid(), eliminado_at = now() where grupo_id = $1', [grupoId]));
    if (!rowCount) return { error: 'No podés eliminar este envío' };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo eliminar') };
  }
  revalidatePath('/directorio/envios');
  return { error: null };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Fotos del envío: se guardan en la carpeta del proveedor, como en Supabase. Las de antes del pase siguen allá.
// ---------------------------------------------------------------------------------------------------------------------------------------------

export async function fotosDeEnvio(grupoId: string): Promise<FotoDeEnvio[]> {
  const usuario = await entrada('fotosDeEnvio', [Id], [grupoId]);
  if (!esId(grupoId)) throw new Error('Envío no válido');
  return comoUsuario(usuario, async c => (await c.query<{ r: RotuloFoto }>(
    'select to_jsonb(f) as r from public.rotulos_fotos f where f.grupo_id = $1 order by f.created_at', [grupoId])).rows
    .map(({ r }) => ({ ...r, url: urlPublica('rotulos', r.storage_path) })));
}

const MAXIMO_DE_FOTO = 5 * 1024 * 1024;
const esJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8;

export async function subirFotoDeEnvio(datos: FormData): Promise<{ error: string | null }> {
  const usuario = await entrada('subirFotoDeEnvio', [Formulario], [datos]);
  const grupoId = datos.get('grupo'), foto = datos.get('foto');
  if (!esId(grupoId) || !(foto instanceof Blob)) return { error: 'La foto no es válida' };
  if (foto.size > MAXIMO_DE_FOTO) return { error: 'La foto es demasiado grande (más de 5 MB)' };
  const contenido = Buffer.from(await foto.arrayBuffer());
  // el navegador la achica y la manda como JPEG: se mira cómo empieza el archivo, no lo que dice el navegador
  if (!esJpeg(contenido)) return { error: 'El archivo no es una imagen' };
  let ruta: string | null = null;
  // cada empresa en su carpeta
  const carpeta = (await contexto()).empresaId;
  try {
    await comoUsuario(usuario, async c => {
      const { rows: [envio] } = await c.query<{ proveedor_id: string; nombre: string | null; fotos: number }>(`
        select r.proveedor_id, p.nombre, (select count(*)::int from public.rotulos_fotos f where f.grupo_id = r.grupo_id) as fotos
        from public.rotulos_generados r left join public.proveedores p on p.id = r.proveedor_id where r.grupo_id = $1 limit 1`, [grupoId]);
      if (!envio) throw aviso('No se encontró el envío');
      if (envio.fotos >= MAX_FOTOS_ROTULO) throw aviso(`Ya llegaste al máximo de ${MAX_FOTOS_ROTULO} fotos.`);
      ruta = `${carpeta}/${slugifyProv(envio.nombre, envio.proveedor_id)}/fotos/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`;
      // el registro primero: si esta persona no puede subir fotos, la base dice que no y no se escribe nada
      await c.query(`insert into storage.objects (bucket_id, name, owner, metadata) values ('rotulos', $1, auth.uid(), $2)`,
        [ruta, JSON.stringify({ size: contenido.length, mimetype: 'image/jpeg' })]);
      await c.query('insert into public.rotulos_fotos (grupo_id, proveedor_id, storage_path, creado_por) values ($1, $2, $3, auth.uid())',
        [grupoId, envio.proveedor_id, ruta]);
      await guardarArchivo('rotulos', ruta, contenido);
    });
  } catch (e) {
    if (ruta) await borrarArchivo('rotulos', ruta);
    return { error: mensajeDe(e, 'No se pudo subir la foto. Probá de nuevo.') };
  }
  return { error: null };
}

export async function eliminarFotoDeEnvio(id: string): Promise<{ error: string | null }> {
  const usuario = await entrada('eliminarFotoDeEnvio', [Id], [id]);
  if (!esId(id)) return { error: 'La foto no es válida' };
  let ruta: string | null = null;
  try {
    await comoUsuario(usuario, async c => {
      const { rows: [foto] } = await c.query<{ storage_path: string }>('delete from public.rotulos_fotos where id = $1 returning storage_path', [id]);
      if (!foto) throw aviso('No podés eliminar esta foto');
      // el archivo se borra solo si es de acá y la base lo deja (como en Supabase: el administrador); las de antes del pase no se tocan
      const { rowCount } = await c.query(`delete from storage.objects where bucket_id = 'rotulos' and name = $1`, [foto.storage_path]);
      if (rowCount) ruta = foto.storage_path;
    });
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo eliminar la foto') };
  }
  if (ruta) await borrarArchivo('rotulos', ruta);
  return { error: null };
}
