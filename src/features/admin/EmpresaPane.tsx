import { useRef, useState } from 'react';
import { useAlCambiar } from '../../lib/useAlCambiar';
import { useToast } from '../../components/ToastProvider';
import { useConfiguracionQuery, useSaveConfiguracion } from '../config/useConfiguracion';
import { NOMBRE_EMPRESA_POR_DEFECTO } from '../../lib/empresa';
import { COLOR_PRIMARIO_ORIGINAL, esColorValido, textoLegibleConBlanco } from '../../lib/marca';
import ColorMarca from '../../components/ColorMarca';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ZONAS_HORARIAS, ZONA_HORARIA_POR_DEFECTO } from '../../lib/zonasHorarias';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

export default function EmpresaPane() {
  const { data: config } = useConfiguracionQuery();
  const saveConfig = useSaveConfiguracion();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [cuit, setCuit] = useState('');
  const [web, setWeb] = useState('');
  const [logoBase64, setLogoBase64] = useState('');
  const [colorPrimario, setColorPrimario] = useState('');
  const [zonaHoraria, setZonaHoraria] = useState(ZONA_HORARIA_POR_DEFECTO);
  const [saving, setSaving] = useState(false);

  useAlCambiar([config], () => {
    if (!config) return;
    setColorPrimario(esColorValido(config.color_primario) ? config.color_primario : '');
    setZonaHoraria(config.zona_horaria || ZONA_HORARIA_POR_DEFECTO);
    setNombre(config.empresa_nombre ?? '');
    setDireccion(config.empresa_direccion ?? '');
    setTelefono(config.empresa_telefono ?? '');
    setEmail(config.empresa_email ?? '');
    setRazonSocial(config.empresa_razon_social ?? '');
    setCuit(config.empresa_cuit ?? '');
    setWeb(config.empresa_web ?? '');
    setLogoBase64(config.logo_base64 ?? '');
  });

  function abrirSelectorDeLogo() {
    fileInputRef.current?.click();
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setLogoBase64(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!textoLegibleConBlanco(colorPrimario || COLOR_PRIMARIO_ORIGINAL)) {
      toast('El color es demasiado claro para el texto blanco. Elegí uno más oscuro.', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveConfig.mutateAsync({
        empresa_nombre: nombre.trim() || NOMBRE_EMPRESA_POR_DEFECTO,
        empresa_direccion: direccion.trim(),
        empresa_telefono: telefono.trim(),
        empresa_email: email.trim(),
        empresa_razon_social: razonSocial.trim(),
        empresa_cuit: cuit.trim(),
        empresa_web: web.trim(),
        logo_base64: logoBase64,
        color_primario: colorPrimario || null,
        zona_horaria: zonaHoraria,
      });
      toast('Configuración guardada', 'success');
    } catch (e) {
      toast('Error al guardar configuración: ' + mensajeDeError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-card" style={{ maxWidth: 560 }}>
      <div className="admin-card-header"><Icono n="empresa" /> Datos de la Empresa</div>
      <div className="admin-card-body">
        <div className="form-group">
          <label>Logo de la empresa</label>
          <div
            className="logo-upload-area"
            role="button"
            tabIndex={0}
            aria-label="Subir logo de la empresa"
            onClick={abrirSelectorDeLogo}
            onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirSelectorDeLogo(); } }}
            style={{ cursor: 'pointer' }}
          >
            {logoBase64 ? (
              <img src={logoBase64} alt="Logo" style={{ maxHeight: 80 }} />
            ) : (
              <p><Icono n="carpeta" /> Clic para subir logo (PNG, JPG)</p>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoChange} />
        </div>
        <div className="form-group"><label htmlFor="empresa-pane-1">Nombre de la empresa</label><Input id="empresa-pane-1" value={nombre} onChange={e => setNombre(e.target.value)} placeholder={NOMBRE_EMPRESA_POR_DEFECTO} /></div>
        <div className="form-group"><label htmlFor="empresa-pane-rs">Razón social</label><Input id="empresa-pane-rs" maxLength={200} value={razonSocial} onChange={e => setRazonSocial(e.target.value)} placeholder="Como figura en los comprobantes" /></div>
        <div className="form-group"><label htmlFor="empresa-pane-cuit">CUIT</label><Input id="empresa-pane-cuit" maxLength={20} inputMode="numeric" value={cuit} onChange={e => setCuit(e.target.value)} placeholder="30-00000000-0" /></div>
        <div className="form-group"><label htmlFor="empresa-pane-2">Dirección</label><Input id="empresa-pane-2" value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Av. Principal 1234" /></div>
        <div className="form-group"><label htmlFor="empresa-pane-3">Teléfono</label><Input id="empresa-pane-3" type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="(0000) 000-0000" /></div>
        <div className="form-group"><label htmlFor="empresa-pane-4">Email</label><Input id="empresa-pane-4" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contacto@empresa.com" /></div>
        <div className="form-group"><label htmlFor="empresa-pane-web">Sitio web</label><Input id="empresa-pane-web" type="url" maxLength={200} value={web} onChange={e => setWeb(e.target.value)} placeholder="www.empresa.com" /></div>
        <div className="form-group">
          <label htmlFor="empresa-pane-zona">Zona horaria</label>
          <Select id="empresa-pane-zona" value={zonaHoraria} onChange={e => setZonaHoraria(e.target.value)}>
            {ZONAS_HORARIAS.some(z => z.id === zonaHoraria) ? null : <option value={zonaHoraria}>{zonaHoraria}</option>}
            {ZONAS_HORARIAS.map(z => <option key={z.id} value={z.id}>{z.etiqueta}</option>)}
          </Select>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Define qué día es "hoy" para las tareas y para corregir retiros del mismo día.</p>
        </div>
        <div className="form-group">
          <label>Color de la marca</label>
          <ColorMarca etiqueta="Color principal" valor={colorPrimario} original={COLOR_PRIMARIO_ORIGINAL} onChange={setColorPrimario} />
        </div>
        <Button variant="primary" size="sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => void handleSave()} disabled={saving}>Guardar configuración</Button>
      </div>
    </div>
  );
}
