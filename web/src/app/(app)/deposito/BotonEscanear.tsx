'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import QrScannerModal from '@/features/scanner/QrScannerModal';
import { buscarPorCodigo } from './acciones';

// El botón flotante de escanear el QR de un artículo (el mismo escáner que la app de Vite). Donde los operarios retiran, cada QR suma el
// artículo a "A retirar"; donde no (lo decide Compras), abre su ficha.
export default function BotonEscanear({ conRetiro }: { conRetiro: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className="fab-scan" onClick={() => setAbierto(true)} aria-label="Escanear QR">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="3" height="3" /><rect x="18" y="14" width="3" height="3" /><rect x="14" y="18" width="3" height="3" /><rect x="18" y="18" width="3" height="3" /></svg>
      </button>
      <QrScannerModal
        open={abierto}
        onClose={() => setAbierto(false)}
        buscarPorCodigo={buscarPorCodigo}
        modo={conRetiro ? 'retirar' : 'ver'}
        onListo={() => { setAbierto(false); router.push('/deposito/a-retirar'); }}
        onVer={a => { setAbierto(false); router.push(`/deposito?ver=${a.id}`, { scroll: false }); }}
      />
    </>
  );
}
