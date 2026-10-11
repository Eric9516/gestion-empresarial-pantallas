import { useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { generarRotuloBlob, generarRotuloGrupoBlob } from '../../lib/generarRotuloPdf';
import { abrirPdfBlob } from '../../lib/pdfBlob';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { publicUrl } from '../../lib/storage';
import { useComisionistasQuery } from '../comisionistas/useComisionistas';
import { useProveedoresQuery } from '../proveedores/useProveedores';
import { useRotuloParaEditarQuery } from './useRotulos';
import { Button } from '@/components/ui/button';
import { useModulos } from '../config/useModulos';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  rotuloId: string | null;
}

export default function RotuloBultosModal({ open, onClose, rotuloId }: Props) {
  const { data: editData, isLoading, isError } = useRotuloParaEditarQuery(rotuloId);
  const { data: proveedores } = useProveedoresQuery();
  const { data: comisionistas } = useComisionistasQuery();
  const { integ } = useModulos();
  const toast = useToast();
  const [generandoTodos, setGenerandoTodos] = useState(false);

  const bultos = editData?.bultos ?? [];
  const rotulo = editData?.rotulo;
  const proveedor = proveedores?.find(p => p.id === rotulo?.proveedor_id);
  const comisionista = comisionistas?.find(c => c.id === rotulo?.comisionista_id);

  const datos: { etiqueta: string; valor: string }[] = rotulo ? [
    {
      etiqueta: !rotulo.tipo_documento ? 'Documento' : rotulo.tipo_documento === 'remito' ? 'Remito' : 'Nota de despacho',
      valor: rotulo.numero_documento || '—',
    },
    { etiqueta: 'Fecha', valor: new Date(rotulo.created_at).toLocaleDateString('es-AR') },
    { etiqueta: 'Proveedor', valor: proveedor?.nombre ?? '(proveedor eliminado)' },
    ...(integ.enviosConComisionistas ? [{ etiqueta: 'Comisionista', valor: comisionista ? (comisionista.empresa || comisionista.nombre || '—') : 'Sin comisionista' }] : []),
    ...(rotulo.valor_declarado ? [{ etiqueta: 'Valor declarado', valor: rotulo.valor_declarado }] : []),
  ] : [];

  // Los rótulos viejos tienen el PDF ya guardado (storage_path real) — ese
  // caso no se puede sumar al PDF combinado (son archivos ya armados, no algo
  // que podamos dibujar junto a los demás), así que "Ver todos juntos" solo
  // se ofrece cuando ningún bulto depende de un archivo guardado.
  const puedeVerTodosJuntos = bultos.length > 1 && bultos.every(b => !b.storage_path);

  // Los rótulos viejos tienen el PDF ya guardado (storage_path real); los
  // que se crean de acá en adelante no guardan archivo — se arman al toque.
  async function verPdf(b: { numero: number; detalle: string | null; storage_path: string | null }) {
    if (b.storage_path) { window.open(publicUrl('rotulos', b.storage_path), '_blank'); return; }
    if (!rotulo || !proveedor) return;
    try {
      const blob = await generarRotuloBlob(rotulo, b, proveedor, proveedor.contactos);
      abrirPdfBlob(blob);
    } catch (err) {
      await registrarErrorAccion('Error al generar el PDF de un rótulo', err);
      toast('No se pudo generar el PDF: ' + mensajeDeError(err), 'error');
    }
  }

  async function verTodosJuntos() {
    if (!rotulo || !proveedor) return;
    setGenerandoTodos(true);
    try {
      const blob = await generarRotuloGrupoBlob(rotulo, bultos, proveedor, proveedor.contactos);
      abrirPdfBlob(blob);
    } catch (err) {
      await registrarErrorAccion('Error al generar el PDF combinado de un envío', err);
      toast('No se pudo generar el PDF: ' + mensajeDeError(err), 'error');
    } finally {
      setGenerandoTodos(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={<><span className="accent"><Icono n="paquete" /></span> Detalle del envío</>}>
      {rotulo?.eliminado && (
        <div role="alert" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
          Este envío fue eliminado (está en la Papelera).
        </div>
      )}
      {rotulo && !rotulo.vigente && !rotulo.eliminado && (
        <div role="alert" style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
          Estás viendo una versión anterior de este envío (ya fue modificado).
        </div>
      )}
      {datos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 14, rowGap: 6, fontSize: 13, marginBottom: 14 }}>
          {datos.map(d => (
            <div key={d.etiqueta} style={{ display: 'contents' }}>
              <span style={{ color: 'var(--text-muted)' }}>{d.etiqueta}</span>
              <strong style={{ fontWeight: 600 }}>{d.valor}</strong>
            </div>
          ))}
        </div>
      )}
      {rotulo?.comentario && (
        <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}><Icono n="mensaje" /> Comentario</div>
          {rotulo.comentario}
        </div>
      )}
      {bultos.length > 0 && <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Bultos ({bultos.length})</div>}
      {puedeVerTodosJuntos && (
        <Button
          type="button"
          variant="primary" size="sm"
          style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }}
          disabled={generandoTodos}
          onClick={() => void verTodosJuntos()}
        >
          
          <Icono n="imprimir" /> {generandoTodos ? 'Generando...' : `Ver los ${bultos.length} juntos`}
        </Button>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cargando...</div>}
        {isError && <div style={{ fontSize: 12, color: 'var(--danger)' }}>Error al cargar los bultos.</div>}
        {!isLoading && !isError && !bultos.length && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin bultos.</div>}
        {bultos.map(b => (
          <div key={b.id} style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <strong style={{ fontSize: 13, color: 'var(--blue)' }}>Bulto {b.numero}/{bultos.length}</strong>
              {b.detalle && <div style={{ fontSize: 12, color: 'var(--text-mid)', overflowWrap: 'anywhere' }}>{b.detalle}</div>}
            </div>
            <Button type="button" variant="ghost" size="sm" style={{ whiteSpace: 'nowrap' }} onClick={() => void verPdf(b)}>Ver PDF</Button>
          </div>
        ))}
      </div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>Cerrar</Button>
      </div>
    </Modal>
  );
}
