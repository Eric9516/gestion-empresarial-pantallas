import { useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { fechaHoyISO } from '../../lib/fechaHoy';
import { useAlCambiar } from '../../lib/useAlCambiar';
import {
  formatoCantidad, leerCantidad, MOTIVOS, NOMBRE_DE_LA_CLASE, problemaDelMovimiento, resumenDelAjuste, stockResultante,
  type ClaseMovimiento, type TipoAjuste,
} from '../../lib/ajustes';
import { useRepuestosParaElegir } from '../items/useItems';
import { supabase } from '../../lib/supabaseClient';
import { useCrearMovimiento } from './useAjustes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Icono } from '@/components/Icono';
import { mensajeDeError } from '@/lib/errores';

interface Linea {
  item_id: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  stock: number | null;
  tipo: TipoAjuste;
  texto: string; // lo que se escribió en la cantidad
}

export interface RepuestoParaMovimiento { id: string; codigo: string; descripcion: string; stock: number | null; unidad?: string | null }

interface Props {
  open: boolean;
  onClose: () => void;
  /** Con qué tipo se abre (se puede cambiar adentro). */
  claseInicial?: ClaseMovimiento;
  /** Un repuesto que ya viene cargado (por ejemplo, al tocar "Cambiar stock" en su ficha). */
  repuestoInicial?: RepuestoParaMovimiento | null;
}

const OTRO = 'Otro';

// Una carga de stock (entra mercadería: solo suma) o un ajuste (corrige el stock: cada artículo suma o resta), de varios artículos a la vez. Es un documento con su
// número correlativo; cada línea muestra cuánto había y cuánto va a quedar.
export default function NuevoMovimientoModal({ open, onClose, claseInicial = 'carga', repuestoInicial = null }: Props) {
  const crear = useCrearMovimiento();
  const toast = useToast();
  const confirmar = useConfirm();

  const [clase, setClase] = useState<ClaseMovimiento>(claseInicial);
  const [fecha, setFecha] = useState(fechaHoyISO);
  const [motivoElegido, setMotivoElegido] = useState('');
  const [motivoPropio, setMotivoPropio] = useState('');
  const [referencia, setReferencia] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);

  function linea(it: RepuestoParaMovimiento, tipo: TipoAjuste): Linea {
    return { item_id: it.id, codigo: it.codigo, descripcion: it.descripcion, unidad: it.unidad ?? 'Uni', stock: it.stock, tipo, texto: '' };
  }

  // Cada vez que se abre, arranca limpio (con el repuesto que venga pedido, si hay uno).
  useAlCambiar([open, claseInicial, repuestoInicial?.id], () => {
    if (!open) return;
    setClase(claseInicial); setFecha(fechaHoyISO()); setMotivoElegido(''); setMotivoPropio(''); setReferencia(''); setObservaciones(''); setBusqueda('');
    setLineas(repuestoInicial ? [linea(repuestoInicial, claseInicial === 'carga' ? 'suma' : 'resta')] : []);
  });

  function cambiarClase(nueva: ClaseMovimiento) {
    setClase(nueva);
    setMotivoElegido(''); setMotivoPropio('');
    // una carga solo suma
    if (nueva === 'carga') setLineas(prev => prev.map(l => ({ ...l, tipo: 'suma' })));
  }

  const motivo = motivoElegido === OTRO ? motivoPropio : motivoElegido;

  const resultados = useRepuestosParaElegir(busqueda);

  const datos = lineas.map(l => ({ tipo: l.tipo, cantidad: leerCantidad(l.texto), stock: l.stock }));
  const problema = problemaDelMovimiento(clase, datos, motivo);
  const resumen = resumenDelAjuste(datos);
  const unidadesTotales = resumen.unidadesSumadas + resumen.unidadesRestadas;

  function handleClose() { onClose(); }

  // Al agregar se pide el repuesto tal como está AHORA (stock y unidad de medida): lo que se ve en la línea es lo real, no lo de una lista vieja.
  async function agregar(it: { id: string; codigo: string; descripcion: string }) {
    if (lineas.some(l => l.item_id === it.id)) { toast('Ese artículo ya está en la lista', 'error'); return; }
    const { data, error } = await supabase.from('items').select('stock, unidad').eq('id', it.id).single();
    if (error) { toast('No se pudo leer el repuesto: ' + mensajeDeError(error), 'error'); return; }
    setLineas(prev => (prev.some(l => l.item_id === it.id) ? prev : [...prev, linea({ ...it, stock: data.stock, unidad: data.unidad }, clase === 'carga' ? 'suma' : 'resta')]));
    setBusqueda('');
  }

  const cambiar = (id: string, cambio: Partial<Linea>) => setLineas(prev => prev.map(l => (l.item_id === id ? { ...l, ...cambio } : l)));

  async function handleConfirmar() {
    if (problema) { toast(problema, 'error'); return; }
    const partes = [
      resumen.sumas ? `sumar ${formatoCantidad(resumen.unidadesSumadas)} unidades en ${resumen.sumas} artículo${resumen.sumas === 1 ? '' : 's'}` : '',
      resumen.restas ? `restar ${formatoCantidad(resumen.unidadesRestadas)} unidades en ${resumen.restas} artículo${resumen.restas === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(' y ');
    const sigue = await confirmar(
      `Vas a ${partes}. El stock cambia ahora y queda registrado con su número de comprobante, en el Historial y en cada repuesto. No se puede editar ni borrar: si hay un error, un dueño tiene que anularlo.`,
      { titulo: `Confirmar ${NOMBRE_DE_LA_CLASE[clase].toLowerCase()}`, textoConfirmar: clase === 'carga' ? 'Sí, cargar' : 'Sí, ajustar' },
    );
    if (!sigue) return;
    try {
      const r = await crear.mutateAsync({
        clase, fecha, motivo: motivo.trim(), referencia: referencia.trim(), observaciones: observaciones.trim(),
        lineas: lineas.map(l => ({ item_id: l.item_id, tipo: l.tipo, cantidad: leerCantidad(l.texto) as number })),
      });
      toast(`${NOMBRE_DE_LA_CLASE[clase]} registrada: ${r.comprobante}`, 'success');
      handleClose();
    } catch (err) {
      await registrarErrorAccion('Error al registrar un movimiento de stock', err);
      toast('No se pudo registrar: ' + mensajeDeError(err), 'error');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      large
      title={<><Icono n="balanza" /> Nuevo movimiento de stock</>}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
          <Button variant="success" disabled={crear.isPending || !!problema} onClick={() => void handleConfirmar()} title={problema ?? undefined}>
            {crear.isPending ? 'Guardando...' : `${clase === 'carga' ? 'Guardar la carga' : 'Guardar el ajuste'}${lineas.length ? ` (${lineas.length})` : ''}`}
          </Button>
        </>
      }
    >
      <div role="group" aria-label="Tipo de movimiento" style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Button style={{ flex: 1 }} variant={clase === 'carga' ? 'success' : 'ghost'} aria-pressed={clase === 'carga'} onClick={() => cambiarClase('carga')}><Icono n="paquete" /> Carga de stock</Button>
        <Button style={{ flex: 1 }} variant={clase === 'ajuste' ? 'primary' : 'ghost'} aria-pressed={clase === 'ajuste'} onClick={() => cambiarClase('ajuste')}><Icono n="balanza" /> Ajuste</Button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 12 }}>
        {clase === 'carga'
          ? <>Entra mercadería que no viene de una compra (por ejemplo, la devolución de un sector). <strong>Solo suma</strong>.</>
          : <>Para corregir el stock cuando salió o entró material sin anotarse. Cada artículo <strong>suma</strong> o <strong>resta</strong>.</>}
        {' '}Todo queda registrado con su número y no se puede editar ni borrar.
      </p>

      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="mov-fecha">Fecha</label>
          <Input id="mov-fecha" type="date" max={fechaHoyISO()} value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="mov-motivo">Motivo{clase === 'ajuste' ? ' (obligatorio)' : ''}</label>
          <Select id="mov-motivo" value={motivoElegido} onChange={e => setMotivoElegido(e.target.value)}>
            <option value="">{clase === 'carga' ? 'Carga de stock' : 'Elegí un motivo…'}</option>
            {MOTIVOS[clase].map(m => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>
        {motivoElegido === OTRO && (
          <div className="form-group full">
            <label htmlFor="mov-motivo-propio">Escribí el motivo</label>
            <Input id="mov-motivo-propio" type="text" maxLength={500} placeholder="Ej: conteo físico de octubre" value={motivoPropio} onChange={e => setMotivoPropio(e.target.value)} />
          </div>
        )}
        <div className="form-group">
          <label htmlFor="mov-referencia">Referencia (opcional)</label>
          <Input id="mov-referencia" type="text" maxLength={120} placeholder="Remito, pedido…" value={referencia} onChange={e => setReferencia(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="mov-observaciones">Observaciones (opcional)</label>
          <Input id="mov-observaciones" type="text" maxLength={500} placeholder="Ej: caja de rodamientos del estante 3B" value={observaciones} onChange={e => setObservaciones(e.target.value)} />
        </div>
      </div>

      <div className="form-group full" style={{ margin: '8px 0' }}>
        <label htmlFor="mov-buscar">Buscar artículo</label>
        <Input id="mov-buscar" type="text" placeholder="Código, número o descripción..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>
      {busqueda.trim() && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {resultados.length ? resultados.map(it => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: 13, minWidth: 0 }}>
                <strong>{it.codigo}</strong> — {it.descripcion} <span style={{ color: 'var(--text-muted)' }}>(stock {formatoCantidad(it.stock ?? 0)})</span>
              </span>
              <Button variant="primary" size="sm" style={{ flexShrink: 0 }} onClick={() => void agregar(it)}><Icono n="mas" /> Agregar</Button>
            </div>
          )) : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin resultados</p>}
        </div>
      )}

      {!lineas.length && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Todavía no agregaste ningún artículo.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lineas.map(l => {
          const cantidad = leerCantidad(l.texto);
          const queda = cantidad === null ? null : stockResultante(l.stock, l.tipo, cantidad);
          const negativo = queda !== null && queda < 0;
          return (
            <div key={l.item_id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', border: negativo ? '1px solid var(--danger)' : '1px solid transparent' }}>
              <div style={{ flex: 1, minWidth: 180, fontSize: 13 }}>
                <strong>{l.codigo}</strong> — {l.descripcion}
                <div style={{ fontSize: 12, color: negativo ? 'var(--danger)' : 'var(--text-muted)', marginTop: 2 }}>
                  Stock actual {formatoCantidad(l.stock ?? 0)} {l.unidad}
                  {queda !== null && <> → quedará <strong>{formatoCantidad(queda)}</strong>{negativo ? ' (no puede quedar en negativo)' : ''}</>}
                </div>
              </div>
              {clase === 'ajuste' && (
                <div role="group" aria-label={`Tipo de ajuste de ${l.codigo}`} style={{ display: 'flex', gap: 4 }}>
                  <Button size="sm" variant={l.tipo === 'suma' ? 'success' : 'ghost'} aria-pressed={l.tipo === 'suma'} onClick={() => cambiar(l.item_id, { tipo: 'suma' })}><Icono n="mas" /> Suma</Button>
                  <Button size="sm" variant={l.tipo === 'resta' ? 'red' : 'ghost'} aria-pressed={l.tipo === 'resta'} onClick={() => cambiar(l.item_id, { tipo: 'resta' })}><Icono n="menos" /> Resta</Button>
                </div>
              )}
              <label htmlFor={`mov-cant-${l.item_id}`} style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cantidad ({l.unidad}):</label>
              <Input id={`mov-cant-${l.item_id}`} type="text" inputMode="decimal" placeholder="0" style={{ width: 80 }} value={l.texto} onChange={e => cambiar(l.item_id, { texto: e.target.value })} />
              <Button variant="dangerGhost" size="icon" title="Quitar" aria-label={`Quitar ${l.codigo}`} onClick={() => setLineas(prev => prev.filter(x => x.item_id !== l.item_id))}><Icono n="cerrar" /></Button>
            </div>
          );
        })}
      </div>

      {lineas.length > 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 12 }}>
          {lineas.length} línea{lineas.length === 1 ? '' : 's'} · {formatoCantidad(unidadesTotales)} unidades
          {resumen.sumas > 0 && resumen.restas > 0 && <> ({formatoCantidad(resumen.unidadesSumadas)} suman, {formatoCantidad(resumen.unidadesRestadas)} restan)</>}
        </p>
      )}
    </Modal>
  );
}
