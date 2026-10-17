import { useState } from 'react';
import ImageLightbox from '../../components/ImageLightbox';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { useAprobarFotoPendiente, useFotosPendientesQuery, useRechazarFotoPendiente, type FilaFotoPendiente } from './useFotosPendientes';
import { Button } from '@/components/ui/button';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

export default function FotosPendientesPane() {
  const { data: filas, isLoading, isError } = useFotosPendientesQuery();
  const aprobar = useAprobarFotoPendiente();
  const rechazar = useRechazarFotoPendiente();
  const toast = useToast();
  const confirmar = useConfirm();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  async function handleAprobar(f: FilaFotoPendiente) {
    try {
      await aprobar.mutateAsync({ item_id: f.item_id, slot: f.slot });
      toast('Foto aprobada', 'success');
    } catch (e) {
      toast('Error al aprobar: ' + mensajeDeError(e), 'error');
    }
  }

  async function handleRechazar(f: FilaFotoPendiente) {
    if (!(await confirmar('¿Eliminar esta foto?', { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    try {
      await rechazar.mutateAsync({ item_id: f.item_id, slot: f.slot, fotoUrl: f.foto_url });
      toast('Foto eliminada', 'success');
    } catch (e) {
      toast('Error al eliminar: ' + mensajeDeError(e), 'error');
    }
  }

  if (isLoading) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</p>;
  if (isError) return <p style={{ color: 'var(--danger)', fontSize: 13 }}>Error al cargar las fotos pendientes.</p>;

  if (!filas?.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Icono n="camara" /></div>
        <h2>No hay fotos pendientes</h2>
        <p>Cuando un usuario común del depósito cargue una foto, va a aparecer acá para que la revises.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        Estas fotos ya están visibles en el catálogo. Si las dejás, quedan; si las eliminás, se borran.
      </div>
      {filas.map(f => (
        <div className="admin-card" style={{ marginBottom: 10 }} key={`${f.item_id}-${f.slot}`}>
          <div className="admin-card-body" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setLightboxUrl(f.foto_url)}
              style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', flexShrink: 0 }}
              title="Ver foto completa"
            >
              <img src={f.foto_url} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }} />
            </button>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700 }}>{f.codigo} — {f.descripcion}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Subida por {f.quien} — {f.subida_at ? new Date(f.subida_at).toLocaleString('es-AR') : '—'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" size="sm" onClick={() => void handleAprobar(f)}><Icono n="exito" /> Aprobar</Button>
              <Button variant="dangerGhost" size="sm" onClick={() => void handleRechazar(f)}><Icono n="borrar" /> Eliminar</Button>
            </div>
          </div>
        </div>
      ))}
      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
