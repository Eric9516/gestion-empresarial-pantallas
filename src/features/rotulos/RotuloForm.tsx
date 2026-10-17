import { useMemo, useState } from 'react';
import { useAlCambiar } from '../../lib/useAlCambiar';
import Modal from '../../components/Modal';
import SizeSelector from '../../components/SizeSelector';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { getCurrentCampos, getCurrentDesign } from '../../lib/rotuloDesign';
import { useComisionistasQuery } from '../comisionistas/useComisionistas';
import { useConfiguracionQuery } from '../config/useConfiguracion';
import { NOMBRE_EMPRESA_POR_DEFECTO } from '../../lib/empresa';
import { useProveedoresQuery } from '../proveedores/useProveedores';
import RotuloBultosFields from './RotuloBultosFields';
import RotuloDescargas from './RotuloDescargas';
import RotuloPreview from './RotuloPreview';
import { useGuardarRotulo, useRotuloParaEditarQuery, type RotuloGuardado } from './useRotulos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useModulos } from '../config/useModulos';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  proveedorId: string | null; // modo "crear nuevo envío"
  editingId: string | null;   // modo "editar" — id de rotulos_generados (gana sobre proveedorId)
}

const TIPOS_DOC = [
  { value: '', label: 'Sin documento' },
  { value: 'remito', label: 'Remito' },
  { value: 'despacho', label: 'Nota de despacho' },
];

export default function RotuloForm({ open, onClose, proveedorId, editingId }: Props) {
  const toast = useToast();
  const confirmar = useConfirm();
  const { data: config } = useConfiguracionQuery();
  const { data: proveedores } = useProveedoresQuery();
  const { data: comisionistas } = useComisionistasQuery();
  const { integ } = useModulos();
  const { data: editData } = useRotuloParaEditarQuery(editingId);
  const guardarRotulo = useGuardarRotulo();

  const [w, setW] = useState(21);
  const [h, setH] = useState(29.7);
  const [comisionistaId, setComisionistaId] = useState('');
  const [tipoDoc, setTipoDoc] = useState('');
  const [numDoc, setNumDoc] = useState('');
  const [valorDeclarado, setValorDeclarado] = useState('');
  const [bultoTotal, setBultoTotal] = useState(1);
  const [bultosDetalle, setBultosDetalle] = useState<string[]>(['']);
  const [extra, setExtra] = useState('');
  const [motivo, setMotivo] = useState('');
  const [descargas, setDescargas] = useState<RotuloGuardado | null>(null);
  const [saving, setSaving] = useState(false);

  useAlCambiar([open, editingId, editData], () => {
    if (!open) return;
    setDescargas(null);
    setMotivo('');
    if (editingId && editData) {
      const { rotulo: r, bultos } = editData;
      setW(r.ancho_mm ? r.ancho_mm / 10 : 21);
      setH(r.alto_mm ? r.alto_mm / 10 : 29.7);
      setComisionistaId(r.comisionista_id || '');
      setTipoDoc(r.tipo_documento || '');
      setNumDoc(r.numero_documento || '');
      setValorDeclarado(r.valor_declarado || '');
      const total = bultos.length || r.bulto_total || 1;
      setBultoTotal(total);
      setBultosDetalle(Array.from({ length: total }, (_, i) => bultos[i]?.detalle || ''));
      setExtra(r.extra || '');
    } else if (!editingId) {
      setW(21); setH(29.7); setComisionistaId(''); setTipoDoc(''); setNumDoc('');
      setValorDeclarado(''); setBultoTotal(1); setBultosDetalle(['']); setExtra('');
    }
  });

  function handleBultoTotalChange(n: number) {
    const total = Math.max(1, n || 1);
    setBultoTotal(total);
    setBultosDetalle(prev => Array.from({ length: total }, (_, i) => prev[i] || ''));
  }

  const proveedor = useMemo(() => {
    const id = editingId ? editData?.rotulo.proveedor_id : proveedorId;
    return (proveedores ?? []).find(p => p.id === id) ?? null;
  }, [proveedores, proveedorId, editingId, editData]);

  const comisionistasOrdenados = useMemo(
    () => [...(comisionistas ?? [])].sort((a, b) => (a.empresa || a.nombre || '').localeCompare(b.empresa || b.nombre || '')),
    [comisionistas]
  );

  async function handleGuardar() {
    if (!proveedor) return;
    if (editingId && !motivo.trim()) { toast('Contá el motivo de la edición antes de guardar', 'error'); return; }
    if (integ.enviosConComisionistas && !comisionistaId && !(await confirmar('No seleccionaste un comisionista para este envío. ¿Guardar igual?', { textoConfirmar: 'Guardar igual' }))) return;

    setSaving(true);
    try {
      const guardado = await guardarRotulo.mutateAsync({
        proveedor, contactos: proveedor.contactos,
        w: w * 10, h: h * 10,
        bultosDetalle, extra,
        docInfo: { tipoDoc, numDoc, valorDeclarado, comisionistaId },
        editando: editingId && editData ? { rotuloId: editingId, grupoId: editData.rotulo.grupo_id, motivo: motivo.trim() } : null,
      });
      setDescargas(guardado);
      setMotivo('');
      toast('Envío guardado', 'success');
    } catch (e) {
      toast('No se pudo guardar: ' + mensajeDeError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!proveedor) return null;

  const design = getCurrentDesign(config?.rotulo_design);
  const campos = getCurrentCampos(config?.rotulo_campos);

  return (
    <Modal open={open} onClose={onClose} title={<><span className="accent"><Icono n="etiqueta" /></span> Editor de Rótulo</>} large>
      <div className="rotulo-modal-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ marginBottom: 8, display: 'block' }}><Icono n="regla" /> Tamaño</label>
            <SizeSelector w={w} h={h} onChange={(nw, nh) => { setW(nw); setH(nh); }} />
          </div>

          <Separador texto={<><Icono n="lista" /> Envío</>} />
          {integ.enviosConComisionistas && <div className="form-group">
            <label htmlFor="rotulo-form-1">Comisionista (opcional — solo para control interno, no se imprime)</label>
            <Select id="rotulo-form-1" value={comisionistaId} onChange={e => setComisionistaId(e.target.value)}>
              <option value="">Sin comisionista</option>
              {comisionistasOrdenados.map(c => <option key={c.id} value={c.id}>{c.empresa || c.nombre}</option>)}
            </Select>
          </div>}
          <div className="form-group">
            <label htmlFor="rotulo-form-2">Documento (opcional)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <Select id="rotulo-form-2" style={{ flex: 1 }} value={tipoDoc} onChange={e => setTipoDoc(e.target.value)}>
                {TIPOS_DOC.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
              <Input type="text" placeholder="N° de documento" style={{ flex: 1 }} value={numDoc} onChange={e => setNumDoc(e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="rotulo-form-3">Valor declarado (opcional)</label>
            <Input id="rotulo-form-3" type="text" placeholder="Ej: $150.000" value={valorDeclarado} onChange={e => setValorDeclarado(e.target.value)} />
          </div>

          <Separador texto={<><Icono n="paquete" /> Bultos</>} />
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="rotulo-form-4">¿Cuántos bultos tiene este envío?</label>
            <Input id="rotulo-form-4"
              type="number" min={1} value={bultoTotal}
              onChange={e => handleBultoTotalChange(parseInt(e.target.value))}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--surface2)', color: 'var(--text)' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Se genera un PDF distinto por cada bulto, cada uno con su propia descripción.</div>
          </div>
          <RotuloBultosFields detalles={bultosDetalle} onChange={setBultosDetalle} />

          <Separador texto={<><Icono n="nota" /> Notas</>} />
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="rotulo-form-5">Texto adicional (opcional)</label>
            <Input id="rotulo-form-5" type="text" placeholder="Ej: URGENTE — Contactar antes de recibir" value={extra} onChange={e => setExtra(e.target.value)} />
          </div>
          {editingId && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="rotulo-form-6">Motivo de la edición (obligatorio)</label>
              <Textarea id="rotulo-form-6" placeholder="Ej: Se corrigió el número de remito" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} />
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)', marginBottom: 10 }}>Vista previa (bulto 1)</div>
          <div style={{ background: '#d0d0d0', borderRadius: 10, padding: 16 }}>
            <RotuloPreview
              design={design} campos={campos} pie={config?.rotulo_pie || ''} empresa={config?.empresa_nombre || NOMBRE_EMPRESA_POR_DEFECTO} logo={config?.logo_base64 || ''}
              proveedor={proveedor} contactos={proveedor.contactos} detalle={bultosDetalle[0] || ''} extra={extra}
              docInfo={{ tipoDoc, numDoc, valorDeclarado, bultoN: bultosDetalle.length > 1 ? '1' : '', bultoTotal: bultosDetalle.length > 1 ? String(bultosDetalle.length) : '' }}
            />
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>El diseño lo configura el administrador</div>
          {descargas && <RotuloDescargas rotulo={descargas.rotulo} bultos={descargas.bultos} proveedor={proveedor} contactos={proveedor.contactos} />}
        </div>
      </div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="red" onClick={() => void handleGuardar()} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </Modal>
  );
}

function Separador({ texto }: { texto: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>{texto}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}
