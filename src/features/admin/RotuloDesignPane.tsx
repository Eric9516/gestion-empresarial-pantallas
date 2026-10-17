import { useState } from 'react';
import { useAlCambiar } from '../../lib/useAlCambiar';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import SizeSelector from '../../components/SizeSelector';
import { DEFAULT_CAMPOS, DEFAULT_DESIGN, getCurrentCampos, getCurrentDesign, type RotuloCampos, type RotuloDesign } from '../../lib/rotuloDesign';
import { useConfiguracionQuery } from '../config/useConfiguracion';
import { NOMBRE_EMPRESA_POR_DEFECTO } from '../../lib/empresa';
import RotuloPreview from '../rotulos/RotuloPreview';
import RotuloCamposToggles from '../rotulos/RotuloCamposToggles';
import RotuloDisenosGuardados from '../rotulos/RotuloDisenosGuardados';
import { useGuardarComoModelo, useResetRotuloDesign, useSaveRotuloDesign } from '../rotulos/useRotuloDiseno';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Icono } from '@/components/Icono';

const MOCK_PROVEEDOR = {
  nombre: 'Nombre del Proveedor SA', rubro: 'Ejemplo de rubro', direccion: 'Calle Ejemplo 1234',
  localidad: 'Córdoba', provincia: 'Córdoba', codigo_postal: '5000', horario: 'Lun-Vie 8 a 17hs',
};

const FUENTES = [
  { value: 'Arial,sans-serif', label: 'Arial' },
  { value: 'Georgia,serif', label: 'Georgia' },
  { value: 'Verdana,sans-serif', label: 'Verdana' },
  { value: 'Tahoma,sans-serif', label: 'Tahoma' },
  { value: 'Impact,sans-serif', label: 'Impact' },
];

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <label htmlFor="rotulo-design-pane-1" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 13, fontWeight: 600, margin: 0 }}>{label}</label>
      <input id="rotulo-design-pane-1" type="color" value={value} onChange={e => onChange(e.target.value)} style={{ width: 34, height: 24, border: 'none', borderRadius: 5, cursor: 'pointer', padding: 2 }} />
    </div>
  );
}

function RangeField({ label, value, min, max, unit = 'px', onChange }: { label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div className="form-group" style={{ marginBottom: 8 }}>
      <label htmlFor="rotulo-design-pane-2">{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input id="rotulo-design-pane-2" type="range" min={min} max={max} value={value} onChange={e => onChange(parseInt(e.target.value))} style={{ flex: 1 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)', minWidth: 34 }}>{value}{unit}</span>
      </div>
    </div>
  );
}

export default function RotuloDesignPane() {
  const { data: config } = useConfiguracionQuery();
  const saveDesign = useSaveRotuloDesign();
  const resetDesign = useResetRotuloDesign();
  const guardarComoModelo = useGuardarComoModelo();
  const toast = useToast();
  const confirmar = useConfirm();

  const [rd, setRd] = useState<RotuloDesign>(DEFAULT_DESIGN);
  const [campos, setCampos] = useState<RotuloCampos>(DEFAULT_CAMPOS);
  const [pie, setPie] = useState('');
  const [size, setSize] = useState({ w: 21, h: 29.7 });

  useAlCambiar([config], () => {
    if (!config) return;
    setRd(getCurrentDesign(config.rotulo_design));
    setCampos(getCurrentCampos(config.rotulo_campos));
    setPie(config.rotulo_pie || '');
  });

  function patch(p: Partial<RotuloDesign>) {
    setRd(prev => ({ ...prev, ...p }));
  }

  async function handleGuardar() {
    try {
      await saveDesign.mutateAsync({ rotulo_design: rd, rotulo_pie: pie, rotulo_campos: campos });
      toast('Diseño guardado como predeterminado', 'success');
    } catch {
      toast('Error al guardar diseño', 'error');
    }
  }

  async function handleReset() {
    if (!(await confirmar('¿Restablecer el diseño original?', { textoConfirmar: 'Restablecer' }))) return;
    try {
      await resetDesign.mutateAsync();
      setRd(DEFAULT_DESIGN);
      toast('Diseño restablecido', 'success');
    } catch {
      toast('Error al restablecer', 'error');
    }
  }

  const ratio = size.w / size.h;

  return (
    <div className="admin-card">
      <div className="admin-card-header"><Icono n="etiqueta" /> Editor de Diseño del Rótulo</div>
      <div className="admin-card-body">
        <div className="admin-design-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '75vh', overflowY: 'auto', paddingRight: 4 }}>

            <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--blue)', marginBottom: 10 }}><Icono n="regla" /> Tamaño de vista previa</div>
              <SizeSelector w={size.w} h={size.h} onChange={(w, h) => setSize({ w, h })} />
            </div>

            <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--blue)', marginBottom: 10 }}><Icono n="paleta" /> Colores</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ColorField label="Fondo header" value={rd.headerBg} onChange={v => patch({ headerBg: v })} />
                <ColorField label="Barra decorativa" value={rd.barColor} onChange={v => patch({ barColor: v })} />
                <ColorField label="Color del título" value={rd.titleColor} onChange={v => patch({ titleColor: v })} />
                <ColorField label="Color del texto" value={rd.textColor} onChange={v => patch({ textColor: v })} />
                <ColorField label="Fondo del cuerpo" value={rd.bodyBg} onChange={v => patch({ bodyBg: v })} />
                <ColorField label="Texto nombre empresa" value={rd.empresaColor} onChange={v => patch({ empresaColor: v })} />
                <ColorField label="Marco del rótulo" value={rd.marcoColor} onChange={v => patch({ marcoColor: v })} />
              </div>
            </div>

            <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--blue)', marginBottom: 10 }}><Icono n="imagen" /> Logo</div>
              <RangeField label="Tamaño" value={rd.logoSize} min={20} max={80} onChange={v => patch({ logoSize: v })} />
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="rotulo-design-pane-3">Posición</label>
                <Select id="rotulo-design-pane-3" value={rd.logoPos} onChange={e => patch({ logoPos: e.target.value as RotuloDesign['logoPos'] })}>
                  <option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option>
                </Select>
              </div>
            </div>

            <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--blue)', marginBottom: 10 }}><Icono n="empresa" /> Nombre empresa</div>
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label htmlFor="rotulo-design-pane-4">Fuente</label>
                <Select id="rotulo-design-pane-4" value={rd.empresaFont} onChange={e => patch({ empresaFont: e.target.value })}>
                  {FUENTES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </Select>
              </div>
              <RangeField label="Tamaño" value={rd.empresaSize} min={8} max={32} onChange={v => patch({ empresaSize: v })} />
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="rotulo-design-pane-5">Posición</label>
                <Select id="rotulo-design-pane-5" value={rd.empresaPos} onChange={e => patch({ empresaPos: e.target.value as RotuloDesign['empresaPos'] })}>
                  <option value="left">Junto al logo</option><option value="center">Centro</option><option value="right">Derecha</option><option value="hidden">Ocultar</option>
                </Select>
              </div>
            </div>

            <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--blue)', marginBottom: 10 }}><Icono n="fabrica" /> Nombre proveedor</div>
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label htmlFor="rotulo-design-pane-6">Fuente</label>
                <Select id="rotulo-design-pane-6" value={rd.provFont} onChange={e => patch({ provFont: e.target.value })}>
                  {FUENTES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </Select>
              </div>
              <RangeField label="Tamaño" value={rd.provSize} min={10} max={36} onChange={v => patch({ provSize: v })} />
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="rotulo-design-pane-7">Alineación</label>
                <Select id="rotulo-design-pane-7" value={rd.provAlign} onChange={e => patch({ provAlign: e.target.value as RotuloDesign['provAlign'] })}>
                  <option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option>
                </Select>
              </div>
            </div>

            <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--blue)', marginBottom: 10 }}><Icono n="marco" /> Bordes y líneas</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-mid)', marginBottom: 6 }}>Marco del rótulo</div>
              <div style={{ marginBottom: 12 }}><RangeField label="" value={rd.marcoWidth} min={0} max={8} onChange={v => patch({ marcoWidth: v })} /></div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-mid)', marginBottom: 6 }}>Barra divisoria</div>
              <RangeField label="" value={rd.barHeight} min={0} max={12} onChange={v => patch({ barHeight: v })} />
            </div>

            <div style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--blue)', marginBottom: 10 }}><Icono n="lista" /> Campos visibles</div>
              <RotuloCamposToggles campos={campos} onChange={setCampos} />
              <div className="divider" />
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="rotulo-design-pane-8">Pie de página</label>
                <Input id="rotulo-design-pane-8" type="text" placeholder="Ej: San Marcos Sud, Córdoba" value={pie} onChange={e => setPie(e.target.value)} />
              </div>
            </div>

          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)', marginBottom: 8 }}>Vista previa</div>
            <div style={{ background: '#d0d0d0', borderRadius: 10, padding: 16, aspectRatio: String(ratio), display: 'flex', alignItems: 'stretch', maxWidth: ratio < 1 ? 480 : '100%', margin: ratio < 1 ? '0 auto' : 0 }}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <RotuloPreview design={rd} campos={campos} pie={pie} empresa={config?.empresa_nombre || NOMBRE_EMPRESA_POR_DEFECTO} logo={config?.logo_base64 || ''} proveedor={MOCK_PROVEEDOR} contactos={[]} />
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', letterSpacing: 0.5 }}>{size.w} × {size.h} cm</div>
          </div>
        </div>

        <RotuloDisenosGuardados
          disenoActivoId={config?.rotulo_diseno_id ?? null}
          onGuardarComoModelo={nombre => guardarComoModelo.mutateAsync({ nombre, design: rd, pie, campos })}
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18, paddingTop: 16, borderTop: '1.5px solid var(--border)' }}>
          <Button variant="ghost" onClick={() => void handleReset()}><Icono n="repetir" /> Restablecer</Button>
          <Button variant="success" onClick={() => void handleGuardar()}>Guardar diseño</Button>
        </div>
      </div>
    </div>
  );
}
