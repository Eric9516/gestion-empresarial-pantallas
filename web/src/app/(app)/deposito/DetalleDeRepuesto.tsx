'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import Copiable from '@/components/Copiable';
import { Icono } from '@/components/Icono';
import { useConfirm } from '@/components/ConfirmProvider';
import { useToast } from '@/components/ToastProvider';
import { Button } from '@/components/ui/button';
import Modal from '@/components/Modal';
import DescargarQrModal from '@/features/items/DescargarQrModal';
import FichaDeStock from '@/features/items/FichaDeStock';
import type { MovimientoFila } from '@/features/items/tipos';
import FotoCarousel from '@/features/items/FotoCarousel';
import ProveedoresDelRepuesto from '@/features/items/ProveedoresDelRepuesto';
import ProveedorDetail from '@/features/proveedores/ProveedorDetail';
import type { Proveedor } from '@/features/proveedores/tipos';
import { clicConTeclado } from '@/lib/clicConTeclado';
import type { EnReparacion, RepuestoDetalle } from '~/lib/repuestos';
import { eliminarRepuesto, movimientos } from './acciones';
import { ACCIONES_DE_FOTOS, ACCIONES_DE_PROVEEDORES_DEL_REPUESTO } from './accionesEnElNavegador';
import FormularioEnNext, { type DatosDelFormulario } from './FormularioEnNext';

const TANDA = 50;
const etiqueta = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' } as const;

// La ficha de stock en su ventana: la primera tanda se pide al abrirla y las anteriores con "Ver movimientos anteriores".
function Movimientos({ repuesto, onClose }: { repuesto: RepuestoDetalle; onClose: () => void }) {
  const [filas, setFilas] = useState<MovimientoFila[] | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [error, setError] = useState(false);
  const [cargando, empezar] = useTransition();
  function pedir(antes: number | null) {
    empezar(async () => {
      try {
        const tanda = await movimientos(repuesto.id, antes);
        setFilas(prev => [...(antes === null ? [] : prev ?? []), ...tanda]);
        setHayMas(tanda.length === TANDA);
      } catch { setError(true); }
    });
  }
  // la primera tanda, al abrir
  useEffect(() => { pedir(null); }, []);
  return (
    <Modal open onClose={onClose} large title={<><Icono n="lista" /> Historial de movimientos — {repuesto.codigo}</>}>
      <FichaDeStock filas={filas ?? []} cargando={filas === null && !error} error={error} hayMas={hayMas} cargandoMas={cargando && filas !== null}
        verMas={() => filas?.length && pedir(filas[filas.length - 1].id)} />
    </Modal>
  );
}

// El detalle del repuesto: fotos, código, familia, ubicación, stock con su historial, lo que está en reparación, la descripción y (para quien
// administra el Depósito) el QR, sus proveedores, editar y eliminar.
interface Props {
  repuesto: RepuestoDetalle;
  enReparacion: EnReparacion[];
  /** Administrador del Depósito: borra fotos, elige la miniatura y elimina el repuesto. */
  admin: boolean;
  /** Cualquiera con acceso al Depósito sube fotos (si no es administrador, quedan pendientes de revisión). */
  puedeSubir: boolean;
  /** Lo que necesita el formulario para editarlo. */
  formulario: DatosDelFormulario;
  /** La empresa usa también Proveedores: el repuesto muestra los suyos. */
  conProveedores: boolean;
}

export default function DetalleDeRepuesto({ repuesto, enReparacion, admin, puedeSubir, formulario, conProveedores }: Props) {
  const [editando, setEditando] = useState(false);
  const toast = useToast();
  const confirmar = useConfirm();
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();
  const [verHistorial, setVerHistorial] = useState(false);
  const [verReparaciones, setVerReparaciones] = useState(false);
  const [verQr, setVerQr] = useState(false);
  const [proveedorVisto, setProveedorVisto] = useState<Proveedor | null>(null);
  const totalEnReparacion = enReparacion.reduce((acc, l) => acc + l.pendiente, 0);

  async function eliminar() {
    if (!(await confirmar(`¿Eliminar "${repuesto.codigo}"? Queda en la Papelera hasta que se confirme la baja definitiva.`, { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    const { error } = await eliminarRepuesto(repuesto.id);
    if (error) { toast(error, 'error'); return; }
    toast('Artículo eliminado', 'error');
    cerrar();
  }

  function cerrar() {
    const p = new URLSearchParams(parametros);
    p.delete('ver');
    router.replace(p.size ? `${ruta}?${p}` : ruta, { scroll: false });
  }

  return (
    <>
      <Modal open onClose={cerrar} title={repuesto.codigo}>
        <div className="item-detail-top">
          <div className="item-detail-foto">
            <FotoCarousel item={repuesto} admin={admin} puedeSubir={puedeSubir} acciones={ACCIONES_DE_FOTOS} />
            {admin && (
              <Button type="button" variant="ghost" size="sm" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }} onClick={() => setVerQr(true)}>
                <Icono n="importar" /> Descargar QR
              </Button>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 200 }} className="detail-grid">
            <div className="detail-item"><label>Código</label><div className="value"><Copiable texto={repuesto.codigo} que="código" /></div></div>
            {repuesto.familias && <div className="detail-item"><label>Familia</label><div className="value">{repuesto.familias.nombre}</div></div>}
            {repuesto.subfamilias && <div className="detail-item"><label>Subfamilia</label><div className="value">{repuesto.subfamilias.nombre}</div></div>}
            {repuesto.ubicacion && <div className="detail-item"><label>Ubicación</label><div className="value">{repuesto.ubicacion}</div></div>}
            {repuesto.stock != null && (
              <div className="detail-item">
                <label>Stock</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div className="value" title="Ver historial de movimientos (retiros, cargas y ajustes)"
                    style={{ cursor: 'pointer', color: 'var(--blue)', display: 'inline-flex', alignItems: 'center', gap: 5, width: 'fit-content' }}
                    {...clicConTeclado(() => setVerHistorial(true))}>
                    {repuesto.stock} <span style={{ fontSize: 12 }}><Icono n="lista" /></span>
                  </div>
                  {totalEnReparacion > 0 && (
                    <button type="button" onClick={() => setVerReparaciones(v => !v)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--warning-bg, #fbf1de)', color: 'var(--warning, #9a6a0a)', border: 'none', fontWeight: 700, fontSize: 12, padding: '4px 10px 4px 9px', borderRadius: 999, cursor: 'pointer' }}>
                      ⟳ {totalEnReparacion} en reparación
                    </button>
                  )}
                </div>
                {verReparaciones && totalEnReparacion > 0 && (
                  <div style={{ marginTop: 8, border: '1.5px dashed var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', background: 'var(--surface2)' }}>
                    {enReparacion.map(l => (
                      <div key={l.id} style={{ fontSize: 12, color: 'var(--text-mid)', padding: '4px 0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span>{l.proveedor} — {l.motivo}</span>
                        <strong style={{ color: 'var(--text)', flexShrink: 0 }}>{l.pendiente} pendiente{l.pendiente === 1 ? '' : 's'}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="detail-section">
          <label style={etiqueta}>Descripción</label>
          <p style={{ marginTop: 4, fontSize: 14, color: 'var(--text-mid)' }}><Copiable texto={repuesto.descripcion} que="descripción" /></p>
        </div>
        {repuesto.detalles && (
          <div className="detail-section">
            <label style={etiqueta}>Detalles</label>
            <p style={{ marginTop: 4, fontSize: 14, color: 'var(--text-mid)', whiteSpace: 'pre-wrap' }}>{repuesto.detalles}</p>
          </div>
        )}
        {repuesto.palabras_clave && (
          <div className="detail-section">
            <label style={etiqueta}>Palabras clave</label>
            <p style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>{repuesto.palabras_clave}</p>
          </div>
        )}
        {admin && conProveedores && (
          <ProveedoresDelRepuesto itemId={repuesto.id} onVerProveedor={setProveedorVisto} acciones={ACCIONES_DE_PROVEEDORES_DEL_REPUESTO} />
        )}
        {admin && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1.5px solid var(--border)' }}>
            <Button variant="ghost" size="sm" onClick={() => setEditando(true)}><Icono n="editar" /> Editar</Button>
            <Button variant="dangerGhost" size="sm" onClick={() => void eliminar()}><Icono n="borrar" /> Eliminar</Button>
          </div>
        )}
      </Modal>
      <DescargarQrModal open={verQr} onClose={() => setVerQr(false)} item={repuesto} />
      <ProveedorDetail proveedor={proveedorVisto} onClose={() => setProveedorVisto(null)} />
      {verHistorial && <Movimientos repuesto={repuesto} onClose={() => setVerHistorial(false)} />}
      <FormularioEnNext open={editando} onClose={() => setEditando(false)} item={repuesto} datos={formulario} />
    </>
  );
}
