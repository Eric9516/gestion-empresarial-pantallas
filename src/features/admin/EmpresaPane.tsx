import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import { useConfiguracionQuery, useSaveConfiguracion } from '../config/useConfiguracion';
import { NOMBRE_EMPRESA_POR_DEFECTO } from '../../lib/empresa';
import { COLOR_DEPOSITO_ORIGINAL, COLOR_PRIMARIO_ORIGINAL, esColorValido, textoLegibleConBlanco } from '../../lib/marca';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ZONAS_HORARIAS, ZONA_HORARIA_POR_DEFECTO } from '../../lib/zonasHorarias';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

// Selector de un color de marca. Vacío ('') significa "el color original de la app".
function ColorMarca({ etiqueta, valor, original, onChange }: { etiqueta: string; valor: string; original: string; onChange: (v: string) => void }) {
  const efectivo = valor || original;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
      <input
        type="color"
        aria-label={etiqueta}
        value={efectivo}
        onChange={e => onChange(e.target.value)}
        style={{ width: 44, height: 34, padding: 2, border: '1.5px solid var(--border)', borderRadius: 6, background: 'var(--white)', cursor: 'pointer' }}
      />
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{etiqueta}</span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{valor ? efectivo : 'original'}</span>
      {valor && <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>Volver al original</Button>}
      {!textoLegibleConBlanco(efectivo) && (
        <span style={{ width: '100%', fontSize: 12, color: 'var(--danger)' }}>
          Es muy claro: el texto blanco de los encabezados y botones no se leería bien. Elegí uno más oscuro.
        </span>
      )}
    </div>
  );
}

export default function EmpresaPane() {
  const { data: config } = useConfiguracionQuery();
  const saveConfig = useSaveConfiguracion();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [logoBase64, setLogoBase64] = useState('');
  const [colorPrimario, setColorPrimario] = useState('');
  const [colorDeposito, setColorDeposito] = useState('');
  const [zonaHoraria, setZonaHoraria] = useState(ZONA_HORARIA_POR_DEFECTO);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!config) return;
    setColorPrimario(esColorValido(config.color_primario) ? config.color_primario : '');
    setColorDeposito(esColorValido(config.color_deposito) ? config.color_deposito : '');
    setZonaHoraria(config.zona_horaria || ZONA_HORARIA_POR_DEFECTO);
    setNombre(config.empresa_nombre ?? '');
    setDireccion(config.empresa_direccion ?? '');
    setTelefono(config.empresa_telefono ?? '');
    setEmail(config.empresa_email ?? '');
    setLogoBase64(config.logo_base64 ?? '');
  }, [config]);

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
    if (!textoLegibleConBlanco(colorPrimario || COLOR_PRIMARIO_ORIGINAL) || !textoLegibleConBlanco(colorDeposito || COLOR_DEPOSITO_ORIGINAL)) {
      toast('Uno de los colores es demasiado claro para el texto blanco. Elegí uno más oscuro.', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveConfig.mutateAsync({
        empresa_nombre: nombre.trim() || NOMBRE_EMPRESA_POR_DEFECTO,
        empresa_direccion: direccion.trim(),
        empresa_telefono: telefono.trim(),
        empresa_email: email.trim(),
        logo_base64: logoBase64,
        color_primario: colorPrimario || null,
        color_deposito: colorDeposito || null,
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
        <div className="form-group"><label htmlFor="empresa-pane-2">Dirección</label><Input id="empresa-pane-2" value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Av. Principal 1234" /></div>
        <div className="form-group"><label htmlFor="empresa-pane-3">Teléfono</label><Input id="empresa-pane-3" type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="(0000) 000-0000" /></div>
        <div className="form-group"><label htmlFor="empresa-pane-4">Email</label><Input id="empresa-pane-4" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contacto@empresa.com" /></div>
        <div className="form-group">
          <label htmlFor="empresa-pane-zona">Zona horaria</label>
          <Select id="empresa-pane-zona" value={zonaHoraria} onChange={e => setZonaHoraria(e.target.value)}>
            {ZONAS_HORARIAS.some(z => z.id === zonaHoraria) ? null : <option value={zonaHoraria}>{zonaHoraria}</option>}
            {ZONAS_HORARIAS.map(z => <option key={z.id} value={z.id}>{z.etiqueta}</option>)}
          </Select>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Define qué día es "hoy" para las tareas y para corregir retiros del mismo día.</p>
        </div>
        <div className="form-group">
          <label>Colores de la marca</label>
          <ColorMarca etiqueta="Color principal" valor={colorPrimario} original={COLOR_PRIMARIO_ORIGINAL} onChange={setColorPrimario} />
          <ColorMarca etiqueta="Color del Depósito" valor={colorDeposito} original={COLOR_DEPOSITO_ORIGINAL} onChange={setColorDeposito} />
        </div>
        <Button variant="primary" size="sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => void handleSave()} disabled={saving}>Guardar configuración</Button>
      </div>
    </div>
  );
}
