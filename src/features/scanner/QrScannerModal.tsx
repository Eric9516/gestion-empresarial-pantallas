import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/Modal';
import { buscarRepuestoPorCodigo } from '../items/useItems';
import { useRetiroCart } from '../retiros/RetiroCartContext';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';
import type { ReactNode } from 'react';

const MENSAJE_INICIAL = 'Apuntá al código QR del repuesto...';

interface Props {
  open: boolean;
  onClose: () => void;
  onListo: () => void; // "Listo, ver lista completa" — el padre decide a qué pestaña ir
}

export default function QrScannerModal({ open, onClose, onListo }: Props) {
  const { cart, addItem, removeItem } = useRetiroCart();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // El lector de QR (jsQR) se descarga recién al abrir el escáner.
  const jsQrRef = useRef<typeof import('jsqr').default | null>(null);
  const scanningRef = useRef(false);
  const ultimoCodigoRef = useRef<string | null>(null);
  const ultimoTimestampRef = useRef(0);
  const statusTimeoutRef = useRef<number | undefined>(undefined);

  const [status, setStatus] = useState<ReactNode>(MENSAJE_INICIAL);
  const [statusColor, setStatusColor] = useState<'muted' | 'success' | 'danger'>('muted');

  useEffect(() => {
    if (!open) return;

    setStatus(MENSAJE_INICIAL);
    setStatusColor('muted');

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Tu navegador no permite acceder a la cámara acá (¿estás en https:// o localhost?).');
      setStatusColor('danger');
      return;
    }

    let cancelado = false;

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(async stream => {
        if (cancelado) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        canvasRef.current = canvasRef.current || document.createElement('canvas');
        jsQrRef.current = jsQrRef.current ?? (await import('jsqr')).default;
        if (cancelado) return;
        scanningRef.current = true;
        ultimoCodigoRef.current = null;
        requestAnimationFrame(loopEscaneo);
      })
      .catch((e: Error) => {
        setStatus('No se pudo acceder a la cámara: ' + e.message);
        setStatusColor('danger');
      });

    return () => {
      cancelado = true;
      scanningRef.current = false;
      window.clearTimeout(statusTimeoutRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function loopEscaneo() {
    if (!scanningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQrRef.current?.(imageData.data, imageData.width, imageData.height);
        if (code?.data) procesarCodigo(code.data);
      }
    }
    if (scanningRef.current) requestAnimationFrame(loopEscaneo);
  }

  function procesarCodigo(codigo: string) {
    const ahora = Date.now();
    // Evita agregar 10 veces el mismo mientras el QR sigue en cuadro.
    if (codigo === ultimoCodigoRef.current && ahora - ultimoTimestampRef.current < 2000) return;
    ultimoCodigoRef.current = codigo;
    ultimoTimestampRef.current = ahora;

    // El repuesto se busca por su código en la base (una consulta chica), no en una lista descargada.
    void buscarRepuestoPorCodigo(codigo).then(item => {
      if (!item) {
        setStatus(<><Icono n="fallo" /> Código "{codigo}" no encontrado en el catálogo</>);
        setStatusColor('danger');
      } else {
        addItem(item);
        setStatus(<><Icono n="ok" /> {item.codigo} agregado — seguí escaneando</>);
        setStatusColor('success');
      }
    }).catch(() => {
      setStatus(<><Icono n="fallo" /> No se pudo consultar el catálogo: probá de nuevo</>);
      setStatusColor('danger');
    }).finally(() => {
      window.clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = window.setTimeout(() => {
        setStatus(MENSAJE_INICIAL);
        setStatusColor('muted');
      }, 1800);
    });
  }

  function handleClose() {
    scanningRef.current = false;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    onClose();
  }

  function handleListo() {
    scanningRef.current = false;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    onListo();
  }

  const colorVar = statusColor === 'success' ? 'var(--success)' : statusColor === 'danger' ? 'var(--danger)' : 'var(--text-muted)';

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={<><span className="accent"><Icono n="camara" /></span> Escanear QR</>}
      footer={<Button variant="success" onClick={handleListo}><Icono n="ok" /> Listo, ver lista completa</Button>}
    >
      <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 'var(--radius-sm)', background: '#000', display: 'block' }} />
      <div style={{ textAlign: 'center', fontSize: 13, color: colorVar, marginTop: 10, minHeight: 18 }}>{status}</div>

      <div style={{ fontWeight: 700, fontSize: 13, marginTop: 14, marginBottom: 6 }}>Vas escaneando:</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
        {!cart.length && <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Todavía no escaneaste nada.</p>}
        {cart.map(c => (
          <div key={c.item_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ flex: 1, fontSize: 12, minWidth: 0 }}><strong>{c.codigo}</strong> — {c.descripcion}</div>
            <span className="badge badge-rubro">x{c.cantidad}</span>
            <Button variant="dangerGhost" size="icon" title="Quitar" onClick={() => removeItem(c.item_id)}><Icono n="cerrar" /></Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
