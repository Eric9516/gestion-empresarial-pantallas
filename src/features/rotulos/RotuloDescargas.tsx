import { useToast } from '../../components/ToastProvider';
import { generarRotuloBlob } from '../../lib/generarRotuloPdf';
import { abrirPdfBlob, descargarPdfBlob } from '../../lib/pdfBlob';
import { registrarErrorAccion } from '../../lib/errorLogging';
import type { Contacto, Proveedor } from '../proveedores/useProveedores';
import type { RotuloBulto, RotuloGenerado } from './useRotulos';
import { Button } from '@/components/ui/button';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

interface Props {
  rotulo: RotuloGenerado;
  bultos: RotuloBulto[];
  proveedor: Proveedor;
  contactos: Contacto[];
}

// El PDF de cada bulto se arma en el momento, con generarRotuloBlob() — no
// hay ningún archivo guardado en Storage que "descargar", así que tanto Ver
// como Descargar generan el blob recién al tocarlas.
export default function RotuloDescargas({ rotulo, bultos, proveedor, contactos }: Props) {
  const toast = useToast();
  const total = bultos.length;

  async function generar(b: RotuloBulto) {
    try {
      return await generarRotuloBlob(rotulo, b, proveedor, contactos);
    } catch (err) {
      await registrarErrorAccion('Error al generar el PDF de un rótulo', err);
      toast('No se pudo generar el PDF: ' + mensajeDeError(err), 'error');
      return null;
    }
  }

  async function verPdf(b: RotuloBulto) {
    const blob = await generar(b);
    if (blob) abrirPdfBlob(blob);
  }

  async function descargar(b: RotuloBulto) {
    const blob = await generar(b);
    if (blob) descargarPdfBlob(blob, `rotulo_bulto${b.numero}_${rotulo.ancho_mm}x${rotulo.alto_mm}mm.pdf`);
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)', marginBottom: 8 }}><Icono n="exito" /> Guardado — descargá cada bulto</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bultos.map(b => (
          <div key={b.numero} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Bulto {b.numero}/{total}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button type="button" variant="ghost" size="sm" onClick={() => void verPdf(b)}>Vista previa</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => void descargar(b)}>Descargar</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
