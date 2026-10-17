import { useMemo, useState } from 'react';
import { useAlCambiar } from '../../lib/useAlCambiar';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useAddFamilia, useAddSubfamilia, useFamiliasQuery, useSubfamiliasQuery } from '../familias/useFamilias';
import { useRepuestoFresco, useSaveItem, type Item, type ItemInput } from './useItems';
import { ConflictoDeEdicion } from '../../lib/conflicto';
import { useAuth } from '../../auth/AuthContext';
import { puedeAjustarInventario } from '../../lib/types';
import { formatoCantidad } from '../../lib/ajustes';
import NuevoMovimientoModal from '../ajustes/NuevoMovimientoModal';
import { useRepuestosDeSubfamilia } from './useNumeracion';
import NuevoCodigoModal from './NuevoCodigoModal';
import { repuestoConNumero } from '../../lib/numeracion';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  item: Item | null;
}

const emptyInput: ItemInput = { familia_id: '', subfamilia_id: '', numero: '', descripcion: '', ubicacion: '', unidad: 'Uni', stock: null, stock_minimo: null, punto_pedido: null, detalles: '' };

// Unidades de medida más usadas (se puede escribir otra).
const UNIDADES = ['Uni', 'Kg', 'Lt', 'Mt', 'Caja', 'Par', 'Juego', 'Rollo', 'Bolsa'];

// Campo numérico opcional: vacío se guarda como null (y después como 0).
const aNumeroONull = (v: string) => (v === '' ? null : Number(v));

export default function ItemForm({ open, onClose, item }: Props) {
  const toast = useToast();
  const { profile } = useAuth();
  const puedeCambiarStock = puedeAjustarInventario(profile);
  const [cambiandoStock, setCambiandoStock] = useState(false);
  const { data: familias } = useFamiliasQuery();
  const { data: subfamilias } = useSubfamiliasQuery();
  const saveItem = useSaveItem();
  const addFamilia = useAddFamilia();
  const addSubfamilia = useAddSubfamilia();

  const [input, setInput] = useState<ItemInput>(emptyInput);
  const [saving, setSaving] = useState(false);
  const [nuevoCodigo, setNuevoCodigo] = useState<'familia' | 'subfamilia' | null>(null);
  // Un repuesto que ya estaba cargado sin descripción y se completa desde este mismo formulario.
  const [completando, setCompletando] = useState<Item | null>(null);
  // Mientras el número sea el sugerido (no lo tocó a mano), se vuelve a sugerir al cambiar de subfamilia.
  const [numeroAuto, setNumeroAuto] = useState(true);
  // Al editar se pide el repuesto tal como está AHORA (con su versión): se ve lo último y el guardado sabe sobre qué versión se hizo.
  const idEditando = open ? (completando?.id ?? item?.id) : undefined;
  const esEdicion = !!(completando ?? item);
  const fresco = useRepuestoFresco(idEditando);
  const itemActual = esEdicion ? (fresco.data ?? null) : null;
  const cargandoElRepuesto = esEdicion && !itemActual;

  useAlCambiar([open, itemActual], () => {
    if (!open) { setCompletando(null); return; }
    setNumeroAuto(true);
    setInput(itemActual
      ? {
        familia_id: itemActual.familia_id, subfamilia_id: itemActual.subfamilia_id, numero: itemActual.numero,
        descripcion: itemActual.descripcion, ubicacion: itemActual.ubicacion ?? '', unidad: itemActual.unidad, stock: itemActual.stock,
        stock_minimo: itemActual.stock_minimo, punto_pedido: itemActual.punto_pedido, detalles: itemActual.detalles ?? '',
      }
      : emptyInput);
  });

  const familia = useMemo(() => familias?.find(f => f.id === input.familia_id) ?? null, [familias, input.familia_id]);
  const subfamiliasDeLaFamilia = useMemo(
    () => (subfamilias ?? []).filter(s => s.familia_id === input.familia_id),
    [subfamilias, input.familia_id]
  );
  const subfamilia = useMemo(() => subfamiliasDeLaFamilia.find(s => s.id === input.subfamilia_id) ?? null, [subfamiliasDeLaFamilia, input.subfamilia_id]);

  // Números de la subfamilia elegida (solo al crear): el siguiente al último y los repuestos cargados sin descripción.
  const { data: numeracion } = useRepuestosDeSubfamilia(esEdicion ? '' : input.familia_id, esEdicion ? '' : input.subfamilia_id);
  const siguiente = numeracion?.analisis.siguiente ?? null;

  useAlCambiar([esEdicion, numeroAuto, siguiente], () => {
    if (esEdicion || !numeroAuto || !siguiente) return;
    setInput(prev => (prev.numero === siguiente ? prev : { ...prev, numero: siguiente }));
  });

  const codigoPreview = familia && subfamilia && input.numero
    ? `M${familia.codigo}${subfamilia.codigo}${input.numero.padStart(5, '0')}`
    : '';

  async function crearFamilia(codigo: string, nombre: string) {
    try {
      const nueva = await addFamilia.mutateAsync({ codigo, nombre });
      setInput(prev => ({ ...prev, familia_id: nueva.id, subfamilia_id: '', numero: '' }));
      setNumeroAuto(true);
      setNuevoCodigo(null);
      toast('Familia creada', 'success');
    } catch (e) { toast('Error al crear la familia: ' + mensajeDeError(e), 'error'); }
  }

  function abrirNuevaSubfamilia() {
    if (!input.familia_id) { toast('Elegí primero una familia', 'error'); return; }
    setNuevoCodigo('subfamilia');
  }

  async function crearSubfamilia(codigo: string, nombre: string) {
    try {
      const nueva = await addSubfamilia.mutateAsync({ familia_id: input.familia_id, codigo, nombre });
      setInput(prev => ({ ...prev, subfamilia_id: nueva.id, numero: '' }));
      setNumeroAuto(true);
      setNuevoCodigo(null);
      toast('Subfamilia creada', 'success');
    } catch (e) { toast('Error al crear la subfamilia: ' + mensajeDeError(e), 'error'); }
  }

  async function handleSave() {
    if (!input.familia_id || !input.subfamilia_id || !input.numero.trim() || !input.descripcion.trim()) {
      toast('Familia, subfamilia, número y descripción son obligatorios', 'error');
      return;
    }
    if (!familia || !subfamilia) return;
    // Al crear: que el número no pise a otro repuesto (la base también lo impediría, pero así el aviso es claro).
    if (!esEdicion && numeracion) {
      const usado = repuestoConNumero(numeracion.items, input.numero);
      if (usado) {
        toast(
          (usado.descripcion ?? '').trim()
            ? `Ese número ya lo usa ${usado.codigo} (${usado.descripcion}). Usá el sugerido.`
            : `Ese número ya está cargado sin descripción (${usado.codigo}): usá "Completar" en vez de crear otro.`,
          'error',
        );
        return;
      }
    }
    setSaving(true);
    try {
      const guardado = await saveItem.mutateAsync({ id: itemActual?.id ?? null, input, familia, subfamilia, version: itemActual?.updated_at, numeroAutomatico: numeroAuto, prefijo: itemActual?.codigo.charAt(0) });
      toast(esEdicion ? 'Repuesto actualizado' : `Repuesto agregado: ${guardado.codigo}`, 'success');
      onClose();
    } catch (e) {
      // Si alguien lo cambió mientras se editaba, el formulario se vuelve a llenar solo con lo nuevo y la persona revisa antes de guardar de nuevo.
      toast(e instanceof ConflictoDeEdicion ? mensajeDeError(e) : 'Error al guardar: ' + mensajeDeError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      large
      title={completando ? 'Completar Repuesto' : item ? 'Editar Repuesto' : 'Nuevo Repuesto'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="success" onClick={() => void handleSave()} disabled={saving || cargandoElRepuesto}>Guardar</Button>
        </>
      }
    >
      <fieldset disabled={cargandoElRepuesto} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="item-form-1">Familia *</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <Combobox
              id="item-form-1"
              className="flex-1"
              placeholder="Escribí o elegí de la lista..."
              value={input.familia_id}
              onChange={v => { setInput(prev => ({ ...prev, familia_id: v, subfamilia_id: '', numero: esEdicion ? prev.numero : '' })); setNumeroAuto(true); }}
              opciones={(familias ?? []).map(f => ({ value: f.id, label: `${f.nombre} (${f.codigo})`, buscar: [f.codigo] }))}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setNuevoCodigo('familia')} title="Crear nueva familia"><Icono n="mas" /></Button>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="item-form-2">Subfamilia *</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <Combobox
              id="item-form-2"
              className="flex-1"
              placeholder={input.familia_id ? 'Escribí o elegí de la lista...' : 'Elegí primero la familia'}
              disabled={!input.familia_id}
              value={input.subfamilia_id}
              onChange={v => { setInput(prev => ({ ...prev, subfamilia_id: v, numero: esEdicion ? prev.numero : '' })); setNumeroAuto(true); }}
              opciones={subfamiliasDeLaFamilia.map(s => ({ value: s.id, label: `${s.nombre} (${s.codigo})`, buscar: [s.codigo] }))}
            />
            <Button type="button" variant="ghost" size="sm" onClick={abrirNuevaSubfamilia} title="Crear nueva subfamilia"><Icono n="mas" /></Button>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="item-form-3">Número *</label>
          <Input id="item-form-3" type="text" inputMode="numeric" placeholder="Ej: 23" value={input.numero} onChange={e => { setNumeroAuto(false); setInput(prev => ({ ...prev, numero: e.target.value })); }} />
          {!esEdicion && numeracion && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0' }}>
              {siguiente
                ? <>Sugerido: <strong>{siguiente}</strong>{numeracion.analisis.ultimo ? <> (el siguiente al último de esta subfamilia, {numeracion.analisis.ultimo})</> : ' (esta subfamilia todavía no tiene repuestos)'}.</>
                : 'Esta subfamilia ya usó todos los números (hasta 99999).'}
              {siguiente && input.numero !== siguiente && (
                <> <button type="button" onClick={() => { setNumeroAuto(true); setInput(prev => ({ ...prev, numero: siguiente })); }} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--blue)', textDecoration: 'underline', cursor: 'pointer' }}>Usar el sugerido</button></>
              )}
            </p>
          )}
          {!esEdicion && !!numeracion && numeracion.analisis.totalHuecos > 0 && familia && subfamilia && (
            <p style={{ fontSize: 12, color: '#7a5408', background: '#fbf1de', borderRadius: 'var(--radius-sm)', padding: '6px 8px', margin: '6px 0 0', lineHeight: 1.9 }}>
              {numeracion.analisis.totalHuecos === 1 ? 'Hay 1 número libre en el medio: ' : `Hay ${numeracion.analisis.totalHuecos} números libres en el medio: `}
              {numeracion.analisis.huecos.map(h => (
                <button
                  key={h}
                  type="button"
                  title={`Usar el número ${h}`}
                  onClick={() => { setNumeroAuto(false); setInput(prev => ({ ...prev, numero: h })); }}
                  style={{ margin: '0 4px 0 0', padding: '0 7px', borderRadius: 999, border: '1px solid #c9a14a', background: input.numero === h ? '#c9a14a' : 'transparent', color: input.numero === h ? '#fff' : 'inherit', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}
                >M{familia.codigo}{subfamilia.codigo}{h}</button>
              ))}
              {numeracion.analisis.totalHuecos > numeracion.analisis.huecos.length && <>y {numeracion.analisis.totalHuecos - numeracion.analisis.huecos.length} más. </>}
              Tocá uno para usarlo en vez de seguir con el último.
            </p>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="item-form-4">Código</label>
          <Input id="item-form-4" type="text" disabled placeholder="Se arma solo..." value={codigoPreview} />
        </div>
        {!esEdicion && !!numeracion?.analisis.enBlanco.length && (
          <div className="form-group full" style={{ padding: '10px 12px', background: '#fbf1de', borderRadius: 'var(--radius-sm)', fontSize: 13, color: '#7a5408' }}>
            <strong>Ya hay repuestos cargados sin descripción en esta subfamilia.</strong> Conviene completarlos en vez de crear otro:
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {numeracion.analisis.enBlanco.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span><strong>{r.codigo}</strong> — sin descripción</span>
                  <Button type="button" variant="primary" size="sm" onClick={() => { const completo = numeracion.items.find(i => i.id === r.id); if (completo) setCompletando(completo); }}>Completar este</Button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="form-group full">
          <label htmlFor="item-form-5">Descripción *</label>
          <Textarea id="item-form-5" rows={2} value={input.descripcion} onChange={e => setInput(prev => ({ ...prev, descripcion: e.target.value }))} />
        </div>
        <div className="form-group">
          <label htmlFor="item-form-6">Ubicación</label>
          <Input id="item-form-6" type="text" placeholder="Ej: Estante 3B" value={input.ubicacion} onChange={e => setInput(prev => ({ ...prev, ubicacion: e.target.value }))} />
        </div>
        <div className="form-group">
          <label htmlFor="item-form-7">{esEdicion ? 'Stock' : 'Stock inicial'}</label>
          {esEdicion ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong id="item-form-7" style={{ fontSize: 15 }}>{formatoCantidad(itemActual?.stock ?? 0)} {itemActual?.unidad}</strong>
              {puedeCambiarStock && itemActual && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setCambiandoStock(true)}><Icono n="balanza" /> Cambiar stock…</Button>
              )}
              <p style={{ flexBasis: '100%', fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>El stock cambia con una carga o un ajuste (queda con su comprobante), no se escribe acá.</p>
            </div>
          ) : (
            <>
              <Input id="item-form-7" type="number" min={0} placeholder="0" value={input.stock ?? ''} onChange={e => setInput(prev => ({ ...prev, stock: aNumeroONull(e.target.value) }))} />
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0' }}>Si lo cargás, queda registrado como una carga inicial.</p>
            </>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="item-form-unidad">Unidad de medida</label>
          <Input id="item-form-unidad" type="text" list="item-form-unidades" maxLength={20} placeholder="Uni" value={input.unidad} onChange={e => setInput(prev => ({ ...prev, unidad: e.target.value }))} />
          <datalist id="item-form-unidades">{UNIDADES.map(u => <option key={u} value={u} />)}</datalist>
        </div>
        <div className="form-group">
          <label htmlFor="item-form-8">Stock mínimo (cantidad que quiero tener)</label>
          <Input id="item-form-8" type="number" min={0} placeholder="0 = sin reposición" value={input.stock_minimo ?? ''} onChange={e => setInput(prev => ({ ...prev, stock_minimo: aNumeroONull(e.target.value) }))} />
        </div>
        <div className="form-group">
          <label htmlFor="item-form-9">Punto de pedido (aviso para comprar)</label>
          <Input id="item-form-9" type="number" min={0} placeholder="0" value={input.punto_pedido ?? ''} onChange={e => setInput(prev => ({ ...prev, punto_pedido: aNumeroONull(e.target.value) }))} />
        </div>
        <div className="form-group full">
          <label htmlFor="item-form-10">Detalles</label>
          <Textarea id="item-form-10" rows={2} placeholder="Información relevante que no es la descripción (ej: compatibilidad, repuesto alternativo)" value={input.detalles} onChange={e => setInput(prev => ({ ...prev, detalles: e.target.value }))} />
        </div>
      </div>
      </fieldset>
    </Modal>
    {cambiandoStock && itemActual && (
      <NuevoMovimientoModal
        open
        onClose={() => setCambiandoStock(false)}
        claseInicial="ajuste"
        repuestoInicial={{ id: itemActual.id, codigo: itemActual.codigo, descripcion: itemActual.descripcion, stock: itemActual.stock, unidad: itemActual.unidad }}
      />
    )}
    {nuevoCodigo === 'familia' && (
      <NuevoCodigoModal
        onClose={() => setNuevoCodigo(null)}
        titulo="Nueva familia"
        codigosExistentes={(familias ?? []).map(f => f.codigo)}
        mensajeDuplicado="Ya existe una familia con ese código"
        onGuardar={crearFamilia}
      />
    )}
    {nuevoCodigo === 'subfamilia' && (
      <NuevoCodigoModal
        onClose={() => setNuevoCodigo(null)}
        titulo={`Nueva subfamilia en ${familia?.nombre ?? ''}`}
        codigosExistentes={subfamiliasDeLaFamilia.map(s => s.codigo)}
        mensajeDuplicado={`Ya existe esa subfamilia dentro de "${familia?.nombre}"`}
        onGuardar={crearSubfamilia}
      />
    )}
    </>
  );
}
