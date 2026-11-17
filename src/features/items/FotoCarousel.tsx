import { useRef, useState } from 'react';
import ImageLightbox from '../../components/ImageLightbox';
import { useConfirm } from '../../components/ConfirmProvider';
import { useToast } from '../../components/ToastProvider';
import { compressImage } from '../../lib/compressImage';
import { useMenu } from '../../lib/useMenu';
import { CAMPOS_POR_SLOT, SLOTS_FOTO, type FotoSlot } from './slotsDeFoto';
import type { Item } from './tipos';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

/** Lo que el carrusel necesita de un repuesto: sus tres fotos y si cada una está pendiente de revisión. */
export type FotosDeRepuesto = Pick<Item, 'id' | FotoSlot | 'foto_pendiente' | 'foto_pendiente_2' | 'foto_pendiente_3'>;

/** Lo que se puede hacer con las fotos; cada app lo hace a su manera (Supabase en la de Vite, el servidor en la de Next). */
export interface AccionesDeFotos {
  /** Sube la foto (ya achicada) a ese lugar. */
  subir: (id: string, slot: FotoSlot, foto: Blob) => Promise<void>;
  borrar: (id: string, slot: FotoSlot, url: string) => Promise<void>;
  /** La foto de ese lugar pasa a ser la miniatura (intercambia con la actual). */
  usarComoMiniatura: (id: string, fotos: FotosDeRepuesto, slot: Exclude<FotoSlot, 'foto_url'>) => Promise<void>;
}

interface Props { item: FotosDeRepuesto; admin: boolean; puedeSubir: boolean; acciones: AccionesDeFotos }

// Carrusel de las 3 fotos del repuesto: scroll horizontal nativo con
// "scroll-snap" (sin librerías) — se desliza con el dedo o el mouse, y el
// navegador se encarga de encajar cada foto. La estrella y el menú de
// arriba actúan sobre la foto que esté centrada en ese momento, no las 3
// a la vez; los puntitos de abajo marcan cuál es y permiten saltar directo.
// Cualquier usuario de Mantenimiento puede subir (puedeSubir); solo un admin
// puede borrar una foto ya cargada o elegir cuál es la miniatura — si sube
// un usuario común queda "pendiente" hasta que el dueño la revisa, pero se
// ve igual de inmediato (lo marca el trigger items_trg_fotos_pendientes en la base).
export default function FotoCarousel({ item, admin, puedeSubir, acciones }: Props) {
  const toast = useToast();
  const confirmar = useConfirm();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputCamaraRef = useRef<HTMLInputElement>(null);
  const inputGaleriaRef = useRef<HTMLInputElement>(null);
  const { abierto: menuOpen, cerrar: cerrarMenu, contenedorRef: menuRef, disparador, menu } = useMenu();
  const [activo, setActivo] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const slot: FotoSlot = SLOTS_FOTO[activo];
  const url = item[slot];
  const esPrincipal = slot === 'foto_url';
  const pendiente = item[CAMPOS_POR_SLOT[slot].pendiente];

  function handleScroll() {
    const el = scrollRef.current;
    if (!el || !el.clientWidth) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActivo(Math.max(0, Math.min(SLOTS_FOTO.length - 1, index)));
  }

  function irA(index: number) {
    scrollRef.current?.scrollTo({ left: index * (scrollRef.current.clientWidth || 0), behavior: 'smooth' });
  }

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await acciones.subir(item.id, slot, await compressImage(file));
      toast('Foto actualizada', 'success');
    } catch (err) {
      toast('Error al subir la foto: ' + mensajeDeError(err), 'error');
    } finally {
      e.target.value = '';
    }
  }

  async function handleDelete() {
    if (!url || !(await confirmar('¿Eliminar esta foto?', { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    try {
      await acciones.borrar(item.id, slot, url);
      toast('Foto eliminada', 'success');
    } catch (err) {
      toast('Error al eliminar la foto: ' + mensajeDeError(err), 'error');
    }
  }

  async function handleUsarComoMiniatura() {
    if (slot === 'foto_url') return;
    try {
      await acciones.usarComoMiniatura(item.id, item, slot);
      toast('Miniatura actualizada', 'success');
    } catch {
      toast('Error al actualizar la miniatura', 'error');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, minHeight: 22 }}>
        <button
          type="button"
          onClick={!esPrincipal && admin ? () => void handleUsarComoMiniatura() : undefined}
          title={esPrincipal ? 'Miniatura actual' : admin ? 'Usar como miniatura' : undefined}
          style={{
            background: 'none', border: 'none', padding: 0, fontSize: 20, lineHeight: 1,
            color: esPrincipal ? '#f5b301' : 'var(--border)',
            cursor: !esPrincipal && admin ? 'pointer' : 'default',
          }}
        ><Icono n="estrella" /></button>
        {puedeSubir && (
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button type="button" {...disparador} aria-label="Más acciones" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: 18, lineHeight: 1, color: 'var(--text-muted)' }}><Icono n="masAcciones" tam={18} /></button>
            <div className={`user-dropdown${menuOpen ? ' open' : ''}`} style={{ right: 0, left: 'auto' }} {...menu}>
              <button role="menuitem" className="user-dropdown-item" onClick={() => { cerrarMenu(); inputCamaraRef.current?.click(); }}><Icono n="camara" /> Sacar foto</button>
              <button role="menuitem" className="user-dropdown-item" onClick={() => { cerrarMenu(); inputGaleriaRef.current?.click(); }}><Icono n="imagen" /> Elegir de galería</button>
              {url && admin && (
                <button role="menuitem" className="user-dropdown-item user-dropdown-danger" onClick={() => { cerrarMenu(); void handleDelete(); }}><Icono n="borrar" /> Eliminar foto</button>
              )}
            </div>
          </div>
        )}
      </div>
      {pendiente && (
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--warning, #b8860b)', textAlign: 'center', marginBottom: 3 }}><Icono n="espera" /> Pendiente de revisión</div>
      )}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', borderRadius: 'var(--radius-sm)' }}
      >
        {SLOTS_FOTO.map(s => {
          const fotoUrl = item[s];
          return (
            <div key={s} style={{ flex: '0 0 100%', scrollSnapAlign: 'center' }}>
              {fotoUrl ? (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
                >
                  <img src={fotoUrl} alt="" style={{ width: '100%', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', objectFit: 'cover', aspectRatio: '1' }} />
                </button>
              ) : (
                <div style={{ width: '100%', aspectRatio: '1', borderRadius: 'var(--radius-sm)', border: '1.5px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11, textAlign: 'center', padding: 6 }}>
                  Sin foto
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 6 }}>
        {SLOTS_FOTO.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => irA(i)}
            aria-label={`Ver foto ${i + 1}`}
            style={{ width: 7, height: 7, borderRadius: '50%', padding: 0, border: 'none', cursor: 'pointer', background: i === activo ? 'var(--blue)' : 'var(--border)' }}
          />
        ))}
      </div>
      {lightboxOpen && url && <ImageLightbox url={url} onClose={() => setLightboxOpen(false)} />}
      {puedeSubir && (
        <>
          <input ref={inputCamaraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => void handleChange(e)} />
          <input ref={inputGaleriaRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => void handleChange(e)} />
        </>
      )}
    </div>
  );
}
