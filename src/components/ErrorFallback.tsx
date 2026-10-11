import { Button } from '@/components/ui/button';

export default function ErrorFallback() {
  return (
    <div role="alert" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>Algo salió mal</div>
      <p style={{ color: 'var(--text-muted)', maxWidth: 360, margin: 0 }}>
        La pantalla tuvo un error inesperado. Ya quedó registrado. Probá recargar la página.
      </p>
      <Button variant="primary" onClick={() => window.location.reload()}>Recargar</Button>
    </div>
  );
}
