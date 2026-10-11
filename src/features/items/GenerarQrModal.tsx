import { useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { generarQRPDF, type FormatoEtiqueta } from '../../lib/generarQrPdf';
import FormatoEtiquetaSelect from './FormatoEtiquetaSelect';
import { prepararBusqueda, puntajeConBusquedaPreparada, useItemsQuery } from './useItems';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icono } from '@/components/Icono';

interface Seleccion {
  item_id: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
}

export default function GenerarQrModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: items } = useItemsQuery();
  const toast = useToast();

  const [busqueda, setBusqueda] = useState('');
  const [seleccion, setSeleccion] = useState<Seleccion[]>([]);
  const [formato, setFormato] = useState<FormatoEtiqueta>('qr_codigo');
  const [pendiente, setPendiente] = useState<{ item_id: string; codigo: string; descripcion: string } | null>(null);
  const [cantidadInput, setCantidadInput] = useState('1');

  const resultados = useMemo(() => {
    if (!busqueda.trim() || !items) return [];
    const terminos = prepararBusqueda(busqueda);
    return items.filter(it => puntajeConBusquedaPreparada(it, terminos) > 0).slice(0, 15);
  }, [items, busqueda]);

  function handleClose() {
    setBusqueda('');
    setSeleccion([]);
    setPendiente(null);
    onClose();
  }

  function abrirCantidad(it: { id: string; codigo: string; descripcion: string }) {
    const existente = seleccion.find(s => s.item_id === it.id);
    setPendiente({ item_id: it.id, codigo: it.codigo, descripcion: it.descripcion });
    setCantidadInput(String(existente?.cantidad ?? 1));
  }

  function confirmarCantidad() {
    const cantidad = parseInt(cantidadInput, 10);
    if (!(cantidad > 0)) { toast('Ingresá un número mayor a 0', 'error'); return; }
    if (!pendiente) return;
    setSeleccion(prev => {
      const existe = prev.some(s => s.item_id === pendiente.item_id);
      if (existe) return prev.map(s => (s.item_id === pendiente.item_id ? { ...s, cantidad } : s));
      return [...prev, { ...pendiente, cantidad }];
    });
    setPendiente(null);
  }

  function actualizarCantidad(itemId: string, value: string) {
    const n = parseInt(value, 10);
    setSeleccion(prev => prev.map(s => (s.item_id === itemId ? { ...s, cantidad: n > 0 ? n : 1 } : s)));
  }

  function quitar(itemId: string) {
    setSeleccion(prev => prev.filter(s => s.item_id !== itemId));
  }

  function handleGenerar() {
    if (!seleccion.length) { toast('Agregá al menos un repuesto', 'error'); return; }
    const items = seleccion.flatMap(s => Array(s.cantidad).fill({ codigo: s.codigo, descripcion: s.descripcion }));
    void generarQRPDF(items, `qr_repuestos_${new Date().toISOString().slice(0, 10)}.pdf`, formato);
    handleClose();
  }

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        large
        title={<><Icono n="etiqueta" /> Generar etiquetas QR</>}
        footer={
          <>
            <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
            <Button variant="success" onClick={handleGenerar}><Icono n="importar" /> Generar PDF</Button>
          </>
        }
      >
        <div className="form-group full" style={{ marginBottom: 12 }}>
          <label htmlFor="generar-qr-modal-1">Buscar repuesto</label>
          <Input id="generar-qr-modal-1" type="text" placeholder="Código o descripción..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        {busqueda.trim() && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {resultados.length ? resultados.map(it => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: 13, minWidth: 0 }}><strong>{it.codigo}</strong> — {it.descripcion}</span>
                <Button variant="primary" size="sm" style={{ flexShrink: 0 }} onClick={() => abrirCantidad(it)}><Icono n="mas" /> Agregar</Button>
              </div>
            )) : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin resultados</p>}
          </div>
        )}

        <FormatoEtiquetaSelect value={formato} onChange={setFormato} />

        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Seleccionados</div>
        {!seleccion.length && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Todavía no agregaste ningún repuesto.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {seleccion.map(s => (
            <div key={s.item_id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160, fontSize: 13 }}><strong>{s.codigo}</strong> — {s.descripcion}</div>
              <label htmlFor={`copias-${s.item_id}`} style={{ fontSize: 12, color: 'var(--text-muted)' }}>Copias:</label>
              <Input id={`copias-${s.item_id}`} type="number" min={1} style={{ width: 64 }} value={s.cantidad} onChange={e => actualizarCantidad(s.item_id, e.target.value)} />
              <Button variant="dangerGhost" size="icon" title="Quitar" onClick={() => quitar(s.item_id)}><Icono n="cerrar" /></Button>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={!!pendiente}
        onClose={() => setPendiente(null)}
        title={`¿Cuántas etiquetas de "${pendiente?.codigo}" querés generar?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendiente(null)}>Cancelar</Button>
            <Button variant="success" onClick={confirmarCantidad}>Agregar</Button>
          </>
        }
      >
        <div className="form-group full">
          <label htmlFor="generar-qr-modal-2">Cantidad</label>
          <Input id="generar-qr-modal-2" type="number" min={1} value={cantidadInput} onChange={e => setCantidadInput(e.target.value)} data-autofocus />
        </div>
      </Modal>
    </>
  );
}
