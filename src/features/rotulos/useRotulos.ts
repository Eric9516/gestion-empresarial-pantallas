import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import type { Database } from '../../lib/database.types';
import { getCurrentCampos, getCurrentDesign, type RotuloCampos, type RotuloDesign } from '../../lib/rotuloDesign';
import type { DocInfo } from '../../lib/rotuloPdf';
import { fetchUsuariosPorIds } from '../../lib/usuarios';
import type { Contacto, Proveedor } from '../proveedores/useProveedores';
import { useConfiguracionQuery } from '../config/useConfiguracion';
import { NOMBRE_EMPRESA_POR_DEFECTO } from '../../lib/empresa';

export type RotuloGenerado = Database['public']['Tables']['rotulos_generados']['Row'];
export type RotuloBulto = Database['public']['Tables']['rotulos_bultos']['Row'];

const QUERY_KEY = ['rotulos_generados'] as const;

export function useRotulosQuery() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rotulos_generados')
        .select('*')
        .eq('vigente', true)
        .eq('eliminado', false)
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });
}

// Lo que se anotó en cada bulto de varios envíos a la vez (para reconocerlos en una lista): id del envío -> detalles.
export function useDetallesDeEnviosQuery(ids: string[]) {
  const key = [...ids].sort();
  return useQuery({
    queryKey: ['rotulos_bultos', 'detalles', key],
    enabled: key.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('rotulos_bultos').select('rotulo_id, numero, detalle').in('rotulo_id', key).order('numero', { ascending: true });
      if (error) throw error;
      const porEnvio = new Map<string, string[]>();
      for (const b of data) if (b.detalle) porEnvio.set(b.rotulo_id, [...(porEnvio.get(b.rotulo_id) ?? []), b.detalle]);
      return porEnvio;
    },
  });
}

// "Creado por" en la pantalla de Envíos: solo trae los perfiles de los autores
// que realmente aparecen en la lista cargada (igual criterio que Papelera).
export function useRotuloAutoresQuery(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ['usuarios_perfil', 'autores', key],
    enabled: key.length > 0,
    queryFn: () => fetchUsuariosPorIds(key),
  });
}

export function useRotuloVersionesQuery(grupoId: string | null) {
  return useQuery({
    queryKey: ['rotulos_generados', 'versiones', grupoId],
    enabled: !!grupoId,
    queryFn: async () => {
      const { data, error } = await supabase.from('rotulos_generados').select('*').eq('grupo_id', grupoId!).order('version', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useRotuloBultosQuery(rotuloId: string | null) {
  return useQuery({
    queryKey: ['rotulos_bultos', rotuloId],
    enabled: !!rotuloId,
    queryFn: async () => {
      const { data, error } = await supabase.from('rotulos_bultos').select('*').eq('rotulo_id', rotuloId!).order('numero', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// Para el modal de edición: la versión vigente + sus bultos de un rótulo puntual.
export function useRotuloParaEditarQuery(id: string | null) {
  return useQuery({
    queryKey: ['rotulos_generados', 'editar', id],
    enabled: !!id,
    queryFn: async () => {
      const { data: rotulo, error } = await supabase.from('rotulos_generados').select('*').eq('id', id!).single();
      if (error) throw error;
      const { data: bultos, error: errBultos } = await supabase.from('rotulos_bultos').select('*').eq('rotulo_id', id!).order('numero', { ascending: true });
      if (errBultos) throw errBultos;
      return { rotulo, bultos: bultos ?? [] };
    },
  });
}

// Una reparación guarda el id del envío al momento de vincularlo; si después el
// envío se edita, nace una versión nueva con otro id. Esto devuelve el id de la
// versión vigente del mismo envío (o el mismo id si ya lo es).
export async function resolverEnvioVigenteId(id: string): Promise<string> {
  const { data: envio, error } = await supabase.from('rotulos_generados').select('id,grupo_id,vigente').eq('id', id).single();
  if (error) throw error;
  if (envio.vigente) return envio.id;
  const { data: vigente, error: errVigente } = await supabase.from('rotulos_generados').select('id').eq('grupo_id', envio.grupo_id).eq('vigente', true).maybeSingle();
  if (errVigente) throw errVigente;
  return vigente?.id ?? envio.id;
}

interface GuardarRotuloInput {
  proveedor: Proveedor;
  contactos: Contacto[];
  w: number;
  h: number;
  bultosDetalle: string[];
  docInfo: DocInfo & { comisionistaId: string };
  extra: string;
  editando: { rotuloId: string; grupoId: string; motivo: string } | null;
}

export interface RotuloGuardado {
  rotulo: RotuloGenerado;
  bultos: RotuloBulto[];
}

// Ya no genera el PDF acá ni lo sube a Storage — eso creía crecer sin límite
// con cada envío. Se guarda un snapshot del diseño de este momento (design,
// campos, logo, pie) y el PDF se arma recién cuando alguien lo pide, con
// generarRotuloBlob() (ver src/lib/generarRotuloPdf.ts).
export function useGuardarRotulo() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { data: config } = useConfiguracionQuery();

  return useMutation({
    mutationFn: async (input: GuardarRotuloInput): Promise<RotuloGuardado> => {
      const { proveedor: p, w, h, bultosDetalle, docInfo, extra, editando } = input;
      const designSnapshot: { design: RotuloDesign; campos: RotuloCampos; pie: string; empresa: string; logo: string } = {
        design: getCurrentDesign(config?.rotulo_design),
        campos: getCurrentCampos(config?.rotulo_campos),
        pie: config?.rotulo_pie || '',
        empresa: config?.empresa_nombre || NOMBRE_EMPRESA_POR_DEFECTO,
        logo: config?.logo_base64 || '',
      };
      const total = bultosDetalle.length;

      const payload = {
        proveedor_id: p.id,
        tipo_documento: docInfo.tipoDoc || null,
        numero_documento: docInfo.numDoc || null,
        valor_declarado: docInfo.valorDeclarado || null,
        comisionista_id: docInfo.comisionistaId || null,
        bulto_total: total,
        extra: extra || null,
        ancho_mm: w,
        alto_mm: h,
        storage_path: null as string | null,
        // El tipo Json generado exige un index signature que RotuloDesign/
        // RotuloCampos (interfaces con forma fija) no tienen — el objeto es
        // JSON-serializable igual, es solo una imprecisión del generador.
        design_snapshot: designSnapshot as unknown as Database['public']['Tables']['rotulos_generados']['Insert']['design_snapshot'],
        creado_por: profile?.id || null,
        vigente: true,
        grupo_id: editando?.grupoId ?? crypto.randomUUID(),
        version: 1,
        motivo_edicion: null as string | null,
        comentario: null as string | null,
      };

      if (editando) {
        const { data: siblings, error: errSiblings } = await supabase.from('rotulos_generados').select('version').eq('grupo_id', editando.grupoId);
        if (errSiblings) throw errSiblings;
        const maxVersion = (siblings ?? []).reduce((m, s) => Math.max(m, s.version), 0);
        payload.version = maxVersion + 1;
        payload.motivo_edicion = editando.motivo;

        // El comentario vive fuera de este formulario (se edita aparte, con su
        // propio ícono) — si no lo copiamos acá, corregir cualquier otro dato
        // del envío lo borraría sin que nadie lo haya tocado.
        const { data: actual, error: errActual } = await supabase.from('rotulos_generados').select('comentario').eq('id', editando.rotuloId).single();
        if (errActual) throw errActual;
        payload.comentario = actual?.comentario ?? null;
        const { error: errPatch } = await supabase.from('rotulos_generados').update({ vigente: false }).eq('grupo_id', editando.grupoId).eq('vigente', true);
        if (errPatch) throw errPatch;
      }

      const { data: inserted, error: errInsert } = await supabase.from('rotulos_generados').insert(payload).select().single();
      if (errInsert) throw errInsert;

      const { data: bultos, error: errBultos } = await supabase.from('rotulos_bultos').insert(
        bultosDetalle.map((detalle, i) => ({ rotulo_id: inserted.id, numero: i + 1, detalle: detalle || null, storage_path: null }))
      ).select();
      if (errBultos) throw errBultos;

      return { rotulo: inserted, bultos: bultos ?? [] };
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

// Comentario del envío: se edita aparte del resto del formulario, desde el
// ícono de comentario de la lista. Guardar con texto vacío lo borra (queda en null).
export function useGuardarComentarioRotulo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, comentario }: { id: string; comentario: string }) => {
      const valor = comentario.trim() || null;
      const { error } = await supabase.from('rotulos_generados').update({ comentario: valor }).eq('id', id);
      if (error) throw error;
      return valor;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

// Baja blanda: manda todo el historial del envío (grupo_id) a la Papelera,
// igual que Proveedores/Repuestos/Reparaciones. El borrado definitivo real
// (con limpieza de Storage) vive en purgarRotuloGrupo, para usar desde la
// Papelera.
export function useEliminarRotuloGrupo() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (grupoId: string) => {
      const { error } = await supabase
        .from('rotulos_generados')
        .update({ eliminado: true, eliminado_por: profile?.id || null, eliminado_at: new Date().toISOString() })
        .eq('grupo_id', grupoId);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

// Borrado definitivo desde la Papelera: recién acá se limpian los PDFs
// históricos en Storage (rótulos viejos que sí llegaron a guardar archivo).
export async function purgarRotuloGrupo(grupoId: string) {
  const { data: versiones, error: errV } = await supabase.from('rotulos_generados').select('id').eq('grupo_id', grupoId);
  if (errV) throw errV;
  const versionIds = (versiones ?? []).map(v => v.id);
  let paths: string[] = [];
  if (versionIds.length) {
    const { data: bultos, error: errB } = await supabase.from('rotulos_bultos').select('storage_path').in('rotulo_id', versionIds);
    if (errB) throw errB;
    paths = (bultos ?? []).map(b => b.storage_path).filter((p): p is string => !!p);
  }
  const { error: errDelete } = await supabase.from('rotulos_generados').delete().eq('grupo_id', grupoId);
  if (errDelete) throw errDelete;
  // Los PDFs en Storage son secundarios: si falla el borrado del archivo no
  // queremos que la fila (ya borrada) parezca "fallida" ante el usuario.
  if (paths.length) await supabase.storage.from('rotulos').remove(paths);
}
