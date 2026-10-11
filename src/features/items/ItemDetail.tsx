import { clicConTeclado } from '@/lib/clicConTeclado';
import { useRef, useState } from 'react';
import ImageLightbox from '../../components/ImageLightbox';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { useAuth } from '../../auth/AuthContext';
import { isMantenimientoAdmin, tieneAccesoMantenimiento } from '../../lib/types';
import { useMenu } from '../../lib/useMenu';
import DescargarQrModal from './DescargarQrModal';
import HistorialStockModal from './HistorialStockModal';
import ProveedoresDeItem from './ProveedoresDeItem';
import ProveedorDetail from '../proveedores/ProveedorDetail';
import type { Proveedor } from '../proveedores/useProveedores';
import { CAMPOS_POR_SLOT, SLOTS_FOTO, useDeleteItem, useDeleteItemFoto, useSwapItemFotos, useUploadItemFoto, type FotoSlot, type Item } from './useItems';
import { useLineasPendientesPorItem } from '../reparaciones/useReparaciones';
import { useModulos } from '../config/useModulos';
import { Button } from '@/components/ui/button';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

interface Props {
  item: Item | null;
  onClose: () => void;
  onEdit: () => void;
}

// Carrusel de las 3 fotos del repuesto: scroll horizontal nativo con
// "scroll-snap" (sin librerías) — se desliza con el dedo o el mouse, y el
// navegador se encarga de encajar cada foto. La estrella y el menú de
// arriba actúan sobre la foto que esté centrada en ese momento, no las 3
// a la vez; los puntitos de abajo marcan cuál es y permiten saltar directo.
// Cualquier usuario de Mantenimiento puede subir (puedeSubir); solo un admin
// puede borrar una foto ya cargada o elegir cuál es la miniatura — si sube
// un usuario común queda "pendiente" hasta que el dueño la revisa, pero se
// ve igual de inmediato (lo marca el trigger items_trg_fotos_pendientes en la base).
function FotoCarousel({ item, admin, puedeSubir }: { item: Item; admin: boolean; puedeSubir: boolean }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const uploadFoto = useUploadItemFoto();
  const deleteFoto = useDeleteItemFoto();
  const swapFotos = useSwapItemFotos();
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
      await uploadFoto.mutateAsync({ id: item.id, file, slot });
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
      await deleteFoto.mutateAsync({ id: item.id, fotoUrl: url, slot });
      toast('Foto eliminada', 'success');
    } catch (err) {
      toast('Error al eliminar la foto: ' + mensajeDeError(err), 'error');
    }
  }

  async function handleUsarComoMiniatura() {
    if (slot === 'foto_url') return;
    try {
      await swapFotos.mutateAsync({ id: item.id, item, targetSlot: slot });
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

export default function ItemDetail({ item, onClose, onEdit }: Props) {
  const { profile } = useAuth();
  const toast = useToast();
  const confirmar = useConfirm();
  const deleteItem = useDeleteItem();
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [historialOpen, setHistorialOpen] = useState(false);
  const [verReparaciones, setVerReparaciones] = useState(false);
  const [proveedorVisto, setProveedorVisto] = useState<Proveedor | null>(null);
  const { lineas: lineasEnReparacion } = useLineasPendientesPorItem(item?.id);
  const { integ } = useModulos();

  if (!item) return null;
  const admin = isMantenimientoAdmin(profile);
  const puedeSubir = tieneAccesoMantenimiento(profile);
  const totalEnReparacion = lineasEnReparacion.reduce((acc, l) => acc + l.pendiente, 0);

  async function handleDelete() {
    if (!item || !(await confirmar(`¿Eliminar "${item.codigo}"? Queda en la Papelera hasta que se confirme la baja definitiva.`, { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    try {
      await deleteItem.mutateAsync(item.id);
      toast('Repuesto eliminado', 'error');
      onClose();
    } catch {
      toast('Error al eliminar', 'error');
    }
  }

  return (
    <>
      <Modal open onClose={onClose} title={item.codigo}>
        <div className="item-detail-top">
          <div className="item-detail-foto">
            <FotoCarousel item={item} admin={admin} puedeSubir={puedeSubir} />
            {admin && (
              <Button
                type="button"
                variant="ghost" size="sm"
                style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
                onClick={() => setQrModalOpen(true)}
              >
                
                <Icono n="importar" /> Descargar QR
              </Button>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 200 }} className="detail-grid">
            <div className="detail-item"><label>Código</label><div className="value">{item.codigo}</div></div>
            {item.familias && <div className="detail-item"><label>Familia</label><div className="value">{item.familias.nombre}</div></div>}
            {item.subfamilias && <div className="detail-item"><label>Subfamilia</label><div className="value">{item.subfamilias.nombre}</div></div>}
            {item.ubicacion && <div className="detail-item"><label>Ubicación</label><div className="value">{item.ubicacion}</div></div>}
            {item.stock != null && (
              <div className="detail-item">
                <label>Stock</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div
                    className="value"
                    style={{ cursor: 'pointer', color: 'var(--blue)', display: 'inline-flex', alignItems: 'center', gap: 5, width: 'fit-content' }}
                    title="Ver historial de movimientos (retiros y ajustes)"
                    {...clicConTeclado(() => setHistorialOpen(true))}
                  >
                    {item.stock} <span style={{ fontSize: 12 }}><Icono n="lista" /></span>
                  </div>
                  {totalEnReparacion > 0 && (
                    <button
                      type="button"
                      onClick={() => setVerReparaciones(v => !v)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--warning-bg, #fbf1de)',
                        color: 'var(--warning, #9a6a0a)', border: 'none', fontWeight: 700, fontSize: 12,
                        padding: '4px 10px 4px 9px', borderRadius: 999, cursor: 'pointer',
                      }}
                    >
                      ⟳ {totalEnReparacion} en reparación
                    </button>
                  )}
                </div>
                {verReparaciones && totalEnReparacion > 0 && (
                  <div style={{ marginTop: 8, border: '1.5px dashed var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', background: 'var(--surface2)' }}>
                    {lineasEnReparacion.map(({ reparacion, pendiente }) => (
                      <div key={reparacion.id} style={{ fontSize: 12, color: 'var(--text-mid)', padding: '4px 0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span>{reparacion.proveedores?.nombre} — {reparacion.motivo}</span>
                        <strong style={{ color: 'var(--text)', flexShrink: 0 }}>{pendiente} pendiente{pendiente === 1 ? '' : 's'}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="detail-section">
          <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>Descripción</label>
          <p style={{ marginTop: 4, fontSize: 14, color: 'var(--text-mid)' }}>{item.descripcion}</p>
        </div>
        {item.detalles && (
          <div className="detail-section">
            <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>Detalles</label>
            <p style={{ marginTop: 4, fontSize: 14, color: 'var(--text-mid)', whiteSpace: 'pre-wrap' }}>{item.detalles}</p>
          </div>
        )}
        {admin && integ.depositoConProveedores && <ProveedoresDeItem itemId={item.id} onVerProveedor={setProveedorVisto} />}
        {admin && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1.5px solid var(--border)' }}>
            <Button variant="ghost" size="sm" onClick={onEdit}><Icono n="editar" /> Editar</Button>
            <Button variant="dangerGhost" size="sm" onClick={() => void handleDelete()}><Icono n="borrar" /> Eliminar</Button>
          </div>
        )}
      </Modal>
      <DescargarQrModal open={qrModalOpen} onClose={() => setQrModalOpen(false)} item={item} />
      <HistorialStockModal item={historialOpen ? item : null} onClose={() => setHistorialOpen(false)} />
      <ProveedorDetail proveedor={proveedorVisto} onClose={() => setProveedorVisto(null)} />
    </>
  );
}
