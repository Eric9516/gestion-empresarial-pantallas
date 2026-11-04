import { useEffect, useRef, useState, type ReactNode } from 'react';
import Modal from '../../components/Modal';
import { useEquiposQuery } from './useEquipos';
import { Icono } from '@/components/Icono';

const MENSAJE_INICIAL = 'Apuntá al código QR pegado en el equipo...';

interface Props {
  open: boolean;
  onClose: () => void;
  onEncontrado: (equipoId: string) => void;
}

// Escanea el QR de un equipo (lleva su código) y abre su ficha. Mismo mecanismo que el
// escáner de repuestos del Depósito (cámara + jsQR), pero busca entre los equipos.
export default function EscanerEquipoModal({ open, onClose, onEncontrado }: Props) {
  const { data: equipos } = useEquiposQuery();
  const equiposRef = useRef(equipos);
  const onEncontradoRef = useRef(onEncontrado);
  useEffect(() => { equiposRef.current = equipos; onEncontradoRef.current = onEncontrado; });

  const videoRef = useRef<HTMLVideoElement>(null);
  const [mensaje, setMensaje] = useState<ReactNode>(MENSAJE_INICIAL);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    let corriendo = false;
    let stream: MediaStream | null = null;
    const canvas = document.createElement('canvas');

    function mostrar(m: ReactNode, esError: boolean) {
      if (cancelado) return;
      setMensaje(m);
      setError(esError);
    }

    mostrar(MENSAJE_INICIAL, false);
    if (!navigator.mediaDevices?.getUserMedia) {
      mostrar('Tu navegador no permite usar la cámara acá (¿estás en https:// o localhost?).', true);
      return;
    }

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelado) { stream.getTracks().forEach(t => t.stop()); return; }
        const video = videoRef.current;
        if (video) { video.srcObject = stream; await video.play(); }
        const jsQR = (await import('jsqr')).default;
        corriendo = true;
        const loop = () => {
          if (!corriendo || cancelado) return;
          const v = videoRef.current;
          if (v && v.readyState === v.HAVE_ENOUGH_DATA) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const leido = jsQR(img.data, img.width, img.height)?.data?.trim();
              if (leido) {
                const eq = equiposRef.current.find(e => e.codigo.trim().toLowerCase() === leido.toLowerCase());
                if (eq) { corriendo = false; onEncontradoRef.current(eq.id); return; }
                mostrar(<><Icono n="fallo" /> No hay ningún equipo con el código "{leido}"</>, true);
              }
            }
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      } catch (e) {
        mostrar('No se pudo usar la cámara: ' + (e instanceof Error ? e.message : String(e)), true);
      }
    })();

    return () => {
      cancelado = true;
      corriendo = false;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={<><Icono n="camara" /> Escanear equipo</>}>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 'var(--radius-sm)', background: '#000', display: 'block' }} />
      <div style={{ textAlign: 'center', fontSize: 13, color: error ? 'var(--danger)' : 'var(--text-muted)', marginTop: 10, minHeight: 18 }}>{mensaje}</div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
        Las etiquetas QR de los equipos se imprimen desde la ficha de cada equipo (botón "Etiqueta QR").
      </p>
    </Modal>
  );
}
