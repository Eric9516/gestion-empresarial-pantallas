import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ToastProvider';
import { useConfiguracionQuery } from '../config/useConfiguracion';
import { useModulos } from '../config/useModulos';
import EmpresaPane from '../admin/EmpresaPane';
import RotuloDesignPane from '../admin/RotuloDesignPane';
import ComisionistasCamposPane from '../admin/ComisionistasCamposPane';
import RepuestosPane from '../admin/RepuestosPane';
import FamiliasPane from '../admin/FamiliasPane';
import UsuariosPane from '../admin/UsuariosPane';
import SectoresPanel from '../sectores/SectoresPanel';
import { useCerrarConfiguracionInicial, useConteosIniciales } from './useConfiguracionInicial';
import { Button } from '@/components/ui/button';
import { Icono } from '@/components/Icono';
import type { ReactNode } from 'react';

interface Paso {
  id: string;
  icono: ReactNode;
  titulo: string;
  explicacion: string;
  hecho: boolean;
  Contenido: () => ReactElement;
}

const tieneContenido = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v && typeof v === 'object' && Object.keys(v).length > 0);

// Guía para dejar una instalación nueva lista: cada paso muestra la misma pantalla de Configuración que
// existe por separado, con una explicación. Los pasos dependen de los módulos de la empresa, se pueden
// saltear, y se marcan como hechos solos cuando ya hay datos cargados.
export default function ConfiguracionInicial() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: config } = useConfiguracionQuery();
  const { modulos, integ } = useModulos();
  const { data: conteos, refetch } = useConteosIniciales();
  const cerrar = useCerrarConfiguracionInicial();
  const [actual, setActual] = useState(0);

  const pasos = useMemo<Paso[]>(() => [
    {
      id: 'empresa', icono: <Icono n="empresa" />, titulo: 'Empresa y marca', hecho: !!config?.logo_base64,
      explicacion: 'El nombre, el logo y los datos de contacto aparecen en pantalla y en los PDF. Elegí también los colores de la marca.',
      Contenido: EmpresaPane,
    },
    ...(modulos.envios ? [{
      id: 'rotulo', icono: <Icono n="etiqueta" />, titulo: 'Rótulos de envío', hecho: tieneContenido(config?.rotulo_design) || config?.rotulo_diseno_id != null,
      explicacion: 'Diseñá cómo se imprimen los rótulos de los envíos. Podés guardar varios modelos y elegir uno como predeterminado.',
      Contenido: RotuloDesignPane,
    }] : []),
    ...(modulos.comisionistas ? [{
      id: 'comisionistas', icono: <Icono n="acuerdo" />, titulo: 'Campos de comisionistas', hecho: tieneContenido(config?.comisionistas_campos_custom),
      explicacion: 'Si necesitás guardar datos propios de cada comisionista (además de los básicos), agregalos acá. Es opcional.',
      Contenido: ComisionistasCamposPane,
    }] : []),
    ...(modulos.deposito ? [
      {
        id: 'sectores', icono: <Icono n="fabrica" />, titulo: 'Sectores', hecho: (conteos?.sectores ?? 0) > 0,
        explicacion: 'Las áreas de la empresa. Cada retiro de repuestos se registra a nombre de un sector.',
        Contenido: SectoresPanel,
      },
      {
        id: 'familias', icono: <Icono n="etiqueta" />, titulo: 'Familias de repuestos', hecho: (conteos?.familias ?? 0) > 0,
        explicacion: 'La clasificación de los repuestos. Se puede cargar de una vez desde una planilla de Excel.',
        Contenido: FamiliasPane,
      },
      {
        id: 'repuestos', icono: <Icono n="herramienta" />, titulo: 'Repuestos y stock', hecho: (conteos?.repuestos ?? 0) > 0,
        explicacion: 'Cargá el stock inicial desde Excel, o agregá los repuestos de a uno. Conviene hacerlo después de cargar las familias.',
        Contenido: RepuestosPane,
      },
    ] : []),
    {
      id: 'usuarios', icono: <Icono n="usuarios" />, titulo: 'Usuarios', hecho: (conteos?.usuarios ?? 0) > 1,
      explicacion: `Creá a las primeras personas y dales su rol${modulos.deposito ? ' en el Directorio y en el Depósito' : ''}. Cada una entra con su correo y la contraseña que le pongas, y puede cambiarla después.`,
      Contenido: UsuariosPane,
    },
  ], [config, modulos, conteos]);

  // Al cambiar de paso se vuelven a contar los datos, por si se cargó algo en el anterior.
  useEffect(() => { void refetch(); }, [actual, refetch]);

  const enResumen = actual >= pasos.length;
  const paso = pasos[actual];
  const hechos = pasos.filter(p => p.hecho).length;

  async function terminar(mensaje: string) {
    try {
      await cerrar.mutateAsync();
      toast(mensaje, 'success');
      navigate('/');
    } catch {
      toast('No se pudo cerrar el asistente. Probá de nuevo.', 'error');
    }
  }

  return (
    <div>
      <div className="admin-card" style={{ marginBottom: 14 }}>
        <div className="admin-card-header" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span><Icono n="cohete" /> Configuración inicial</span>
          <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>{hechos} de {pasos.length} pasos listos</span>
        </div>
        <div className="admin-card-body">
          <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 12 }}>
            Te guiamos para dejar la aplicación lista. Podés saltear cualquier paso y volver más tarde: esta pantalla queda siempre en Configuración → General.
          </p>
          <div className="admin-subnav" style={{ marginBottom: 0 }}>
            {pasos.map((p, i) => (
              <button key={p.id} type="button" className={`admin-subtab${!enResumen && i === actual ? ' active' : ''}`} onClick={() => setActual(i)}>
                {p.hecho ? <Icono n="ok" /> : p.icono} {p.titulo}
              </button>
            ))}
            <button type="button" className={`admin-subtab${enResumen ? ' active' : ''}`} onClick={() => setActual(pasos.length)}><Icono n="exito" /> Resumen</button>
          </div>
        </div>
      </div>

      {!enResumen && paso && (
        <>
          <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-mid)' }}>
            <strong style={{ color: 'var(--text)' }}>Paso {actual + 1} de {pasos.length} · {paso.titulo}.</strong>{' '}
            {paso.explicacion} {paso.hecho && <span style={{ color: 'var(--success)', fontWeight: 700 }}><Icono n="ok" /> Ya hay datos cargados.</span>}
          </div>
          <paso.Contenido />
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <Button variant="ghost" disabled={actual === 0} onClick={() => setActual(actual - 1)}><Icono n="volver" /> Anterior</Button>
            <Button variant="ghost" onClick={() => setActual(actual + 1)}>Saltar este paso</Button>
            <Button variant="primary" onClick={() => setActual(actual + 1)}>Siguiente →</Button>
          </div>
        </>
      )}

      {enResumen && (
        <div className="admin-card" style={{ maxWidth: 560 }}>
          <div className="admin-card-header"><Icono n="exito" /> Resumen</div>
          <div className="admin-card-body">
            {pasos.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 14 }}>{p.hecho ? <Icono n="exito" /> : <Icono n="vacio" />} {p.titulo}</span>
                <Button variant="ghost" size="sm" onClick={() => setActual(i)}>{p.hecho ? 'Revisar' : 'Completar'}</Button>
              </div>
            ))}
            {!integ.depositoConProveedores && modulos.deposito && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>Las reparaciones y los proveedores por repuesto no están incluidos en esta instalación.</p>
            )}
            <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: '14px 0' }}>
              {hechos === pasos.length ? '¡Todo listo! La aplicación está configurada.' : 'Lo que falte lo podés completar cuando quieras, desde esta misma pantalla.'}
            </p>
            <Button variant="success" style={{ width: '100%', justifyContent: 'center' }} disabled={cerrar.isPending} onClick={() => void terminar('Configuración inicial terminada')}>
              Terminar y empezar a usar la aplicación
            </Button>
          </div>
        </div>
      )}

      {!enResumen && (
        <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
          ¿Preferís hacerlo más tarde?{' '}
          <button type="button" style={{ background: 'none', border: 'none', color: 'var(--blue-light)', cursor: 'pointer', fontWeight: 700, padding: 0, font: 'inherit' }}
            onClick={() => void terminar('Podés retomar la configuración desde Configuración → General')}>
            Terminar por ahora
          </button>
        </div>
      )}
    </div>
  );
}
