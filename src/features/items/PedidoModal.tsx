import { useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { abrirPdfBlob, descargarPdfBlob } from '../../lib/pdfBlob';
import { generarPedidoBlob, type LineaPedido } from '../../lib/pedidoPdf';
import { useConfiguracionQuery } from '../config/useConfiguracion';
import { NOMBRE_EMPRESA_POR_DEFECTO } from '../../lib/empresa';
import { useProveedoresQuery } from '../proveedores/useProveedores';
import { cantidadAComprar } from './reposicion';
import { useRepuestosParaElegir, type Item } from './useItems';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

// De cada repuesto el pedido necesita solo esto (sirve tanto con el repuesto completo como con un resultado de búsqueda).
export type RepuestoParaPedido = Pick<Item, 'id' | 'codigo' | 'descripcion' | 'stock' | 'stock_minimo' | 'punto_pedido'>;

interface Props {
  items: RepuestoParaPedido[];
  onClose: () => void;
  // Se llama al descargar, con los repuestos que quedaron en el pedido.
  onDescargado?: (ids: string[]) => void;
}

interface LineaEditable extends LineaPedido { id: string }

// Las líneas escritas a mano no son repuestos del sistema: llevan este prefijo
// en el id para no confundirlas al avisar cuáles repuestos entraron al pedido.
const PREFIJO_MANUAL = 'manual-';
const MAX_SUGERENCIAS = 6;

// Suma a la lista un repuesto cualquiera del sistema (buscando entre todos, no
// solo los del informe) o una línea en blanco para escribir a mano.
function AgregarLinea({ yaAgregados, onAgregarItem, onAgregarManual }: {
  yaAgregados: Set<string>; onAgregarItem: (it: RepuestoParaPedido) => void; onAgregarManual: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const encontrados = useRepuestosParaElegir(busqueda.trim().length < 2 ? '' : busqueda, MAX_SUGERENCIAS + 12);

  const sugerencias = useMemo(() => encontrados.filter(it => !yaAgregados.has(it.id)).slice(0, MAX_SUGERENCIAS), [encontrados, yaAgregados]);

  return (
    <div style={{ margin: '4px 0 12px' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Input style={{ flex: '1 1 240px' }} placeholder="Agregar otro artículo: buscá por código o descripción..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <Button type="button" variant="ghost" size="sm" onClick={onAgregarManual}><Icono n="mas" /> Línea manual</Button>
      </div>
      {sugerencias.map(it => (
        <Button
          key={it.id}
          type="button"
          variant="ghost" size="sm"
          style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', marginTop: 4, height: 'auto', whiteSpace: 'normal' }}
          onClick={() => { onAgregarItem(it); setBusqueda(''); }}
        >
          <strong>{it.codigo}</strong>&nbsp;— {it.descripcion}
        </Button>
      ))}
    </div>
  );
}

// Se edita todo antes de generar el PDF: descripción, código, cantidad, quitar
// líneas. Nada de esto se guarda en los repuestos — vale solo para este pedido.
export default function PedidoModal({ items, onClose, onDescargado }: Props) {
  const toast = useToast();
  const { data: config } = useConfiguracionQuery();
  const { data: proveedores } = useProveedoresQuery();

  const [lineas, setLineas] = useState<LineaEditable[]>(() =>
    items.map(it => ({ id: it.id, codigo: it.codigo, descripcion: it.descripcion, cantidad: String(cantidadAComprar(it)) }))
  );
  const [para, setPara] = useState('');
  const [nota, setNota] = useState('');
  const [fecha, setFecha] = useState(fechaHoyISO);
  const [incluirCodigo, setIncluirCodigo] = useState(false);

  function editar(id: string, campo: keyof LineaPedido, valor: string) {
    setLineas(prev => prev.map(l => (l.id === id ? { ...l, [campo]: valor } : l)));
  }

  // Las líneas nuevas van arriba de todo, donde se ve el buscador, y no perdidas al final de una lista larga.
  function agregarItem(it: RepuestoParaPedido) {
    setLineas(prev => [{ id: it.id, codigo: it.codigo, descripcion: it.descripcion, cantidad: '1' }, ...prev]);
  }

  function agregarManual() {
    setLineas(prev => [{ id: `${PREFIJO_MANUAL}${crypto.randomUUID()}`, codigo: '', descripcion: '', cantidad: '1' }, ...prev]);
  }

  const yaAgregados = useMemo(() => new Set(lineas.map(l => l.id)), [lineas]);

  async function generar(): Promise<Blob | null> {
    try {
      return await generarPedidoBlob({
        empresa: config?.empresa_nombre || NOMBRE_EMPRESA_POR_DEFECTO,
        logo: config?.logo_base64 || '',
        fecha, para, nota, incluirCodigo,
        // Una línea manual que quedó totalmente vacía no se imprime.
        lineas: lineas
          .filter(l => l.codigo.trim() || l.descripcion.trim())
          .map(({ codigo, descripcion, cantidad }) => ({ codigo, descripcion, cantidad })),
      });
    } catch (err) {
      await registrarErrorAccion('Error al generar el PDF de la solicitud de presupuesto', err);
      toast('No se pudo generar el PDF: ' + mensajeDeError(err), 'error');
      return null;
    }
  }

  async function handleVer() {
    const blob = await generar();
    if (blob) abrirPdfBlob(blob);
  }

  async function handleDescargar() {
    const blob = await generar();
    if (!blob) return;
    const destino = para.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    descargarPdfBlob(blob, `solicitud_presupuesto${destino ? `_${destino}` : ''}_${fecha}.pdf`);
    onDescargado?.(lineas.filter(l => !l.id.startsWith(PREFIJO_MANUAL)).map(l => l.id));
  }

  const sinLineas = lineas.length === 0;

  return (
    <Modal
      open
      onClose={onClose}
      large
      title={<><Icono n="documento" /> Armar solicitud de presupuesto</>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          <Button variant="ghost" disabled={sinLineas} onClick={() => void handleVer()}><Icono n="ver" /> Ver PDF</Button>
          <Button variant="primary" disabled={sinLineas} onClick={() => void handleDescargar()}><Icono n="exportar" /> Descargar PDF</Button>
        </>
      }
    >
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Editá lo que necesites: los cambios valen solo para esta solicitud y no modifican los repuestos.
      </p>

      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="pedido-modal-1">Para (proveedor)</label>
          <Input id="pedido-modal-1" list="pedido-proveedores" placeholder="Escribí o elegí un proveedor" value={para} onChange={e => setPara(e.target.value)} />
          <datalist id="pedido-proveedores">
            {proveedores?.map(p => <option key={p.id} value={p.nombre} />)}
          </datalist>
        </div>
        <div className="form-group">
          <label htmlFor="pedido-modal-2">Fecha</label>
          <Input id="pedido-modal-2" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        <div className="form-group full">
          <label htmlFor="pedido-modal-3">Nota (opcional)</label>
          <Textarea id="pedido-modal-3" rows={2} placeholder="Ej: Entrega en planta, pedir presupuesto..." value={nota} onChange={e => setNota(e.target.value)} />
        </div>
      </div>

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', margin: '4px 0 10px' }}>
        <input type="checkbox" checked={incluirCodigo} onChange={e => setIncluirCodigo(e.target.checked)} />
        Incluir una columna con el código
      </label>

      <AgregarLinea yaAgregados={yaAgregados} onAgregarItem={agregarItem} onAgregarManual={agregarManual} />

      {sinLineas && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No quedan artículos en la solicitud.</p>}

      {lineas.map(l => (
        <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
          {incluirCodigo && (
            <Input aria-label="Código" style={{ flex: '0 0 130px' }} value={l.codigo} onChange={e => editar(l.id, 'codigo', e.target.value)} />
          )}
          <Textarea aria-label="Descripción" rows={2} style={{ flex: '1 1 220px', minWidth: 0 }} value={l.descripcion} onChange={e => editar(l.id, 'descripcion', e.target.value)} />
          <Input aria-label="Cantidad" type="number" min={0} step="any" style={{ flex: '0 0 84px' }} value={l.cantidad} onChange={e => editar(l.id, 'cantidad', e.target.value)} />
          <Button
            type="button"
            variant="dangerGhost" size="icon"
            title="Quitar de la solicitud"
            onClick={() => setLineas(prev => prev.filter(x => x.id !== l.id))}
          ><Icono n="cerrar" /></Button>
        </div>
      ))}
    </Modal>
  );
}
