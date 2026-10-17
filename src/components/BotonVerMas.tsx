import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';

// Al final de una lista paginada: pide la página siguiente. Solo se ve si puede haber más.
export default function BotonVerMas({ hayMas, cargando, mostrando, onClick }: { hayMas: boolean; cargando: boolean; mostrando: number; onClick: () => void }) {
  if (!hayMas) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, margin: '16px 0 8px' }}>
      <Button variant="ghost" disabled={cargando} onClick={onClick}>
        <Icono n="abajo" /> {cargando ? 'Cargando...' : 'Ver más'}
      </Button>
      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Mostrando {mostrando} · puede haber más</span>
    </div>
  );
}
