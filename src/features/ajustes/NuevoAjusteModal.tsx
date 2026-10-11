import { useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { registrarErrorAccion } from '../../lib/errorLogging';
import { formatoCantidad, leerCantidad, problemaDelAjuste, resumenDelAjuste, stockResultante, type TipoAjuste } from '../../lib/ajustes';
import { prepararBusqueda, puntajeConBusquedaPreparada, useItemsQuery } from '../items/useItems';
import { useCrearAjuste } from './useAjustes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

interface Linea {
  item_id: string;
  codigo: string;
  descripcion: string;
  stock: number | null;
  tipo: TipoAjuste;
  texto: string; // lo que se escribió en la cantidad
}

// Sumar o restar stock de varios repuestos de una vez. Cada línea muestra cómo va a quedar el stock.
export default function NuevoAjusteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: items } = useItemsQuery();
  const crear = useCrearAjuste();
  const toast = useToast();
  const confirmar = useConfirm();

  const [busqueda, setBusqueda] = useState('');
  const [motivo, setMotivo] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);

  const resultados = useMemo(() => {
    if (!busqueda.trim() || !items) return [];
    const terminos = prepararBusqueda(busqueda);
    return items.filter(it => puntajeConBusquedaPreparada(it, terminos) > 0).slice(0, 15);
  }, [items, busqueda]);

  const datos = lineas.map(l => ({ tipo: l.tipo, cantidad: leerCantidad(l.texto), stock: l.stock }));
  const problema = problemaDelAjuste(datos, motivo);
  const resumen = resumenDelAjuste(datos);

  function handleClose() {
    setBusqueda(''); setMotivo(''); setLineas([]);
    onClose();
  }

  function agregar(it: { id: string; codigo: string; descripcion: string; stock: number | null }) {
    if (lineas.some(l => l.item_id === it.id)) { toast('Ese artículo ya está en la lista', 'error'); return; }
    setLineas(prev => [...prev, { item_id: it.id, codigo: it.codigo, descripcion: it.descripcion, stock: it.stock, tipo: 'resta', texto: '' }]);
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
      `Vas a ${partes}. El stock cambia ahora y queda registrado en el Historial y en cada repuesto. No se puede editar ni borrar: si hay un error, un dueño tiene que anularlo.`,
      { titulo: 'Confirmar ajuste de inventario', textoConfirmar: 'Sí, ajustar' },
    );
    if (!sigue) return;
    try {
      await crear.mutateAsync({
        motivo: motivo.trim(),
        lineas: lineas.map(l => ({ item_id: l.item_id, tipo: l.tipo, cantidad: leerCantidad(l.texto) as number })),
      });
      toast('Ajuste registrado', 'success');
      handleClose();
    } catch (err) {
      await registrarErrorAccion('Error al registrar un ajuste de inventario', err);
      toast('No se pudo ajustar: ' + mensajeDeError(err), 'error');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      large
      title={<><Icono n="balanza" /> Nuevo ajuste de inventario</>}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
          <Button variant="success" disabled={crear.isPending || !!problema} onClick={() => void handleConfirmar()} title={problema ?? undefined}>
            {crear.isPending ? 'Guardando...' : `Confirmar ajuste${lineas.length ? ` (${lineas.length})` : ''}`}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 12 }}>
        Para corregir el stock cuando salió o entró material sin anotarse. Elegí los artículos, indicá si <strong>suman</strong> o <strong>restan</strong> y cuánto.
        Todo queda registrado y no se puede editar ni borrar.
      </p>

      <div className="form-group full" style={{ marginBottom: 8 }}>
        <label htmlFor="ajuste-buscar">Buscar artículo</label>
        <Input id="ajuste-buscar" type="text" placeholder="Código, número o descripción..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>
      {busqueda.trim() && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {resultados.length ? resultados.map(it => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: 13, minWidth: 0 }}>
                <strong>{it.codigo}</strong> — {it.descripcion} <span style={{ color: 'var(--text-muted)' }}>(stock {formatoCantidad(it.stock ?? 0)})</span>
              </span>
              <Button variant="primary" size="sm" style={{ flexShrink: 0 }} onClick={() => agregar(it)}><Icono n="mas" /> Agregar</Button>
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
            <div key={l.item_id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', border: negativo ? '1.5px solid var(--danger)' : '1.5px solid transparent' }}>
              <div style={{ flex: 1, minWidth: 180, fontSize: 13 }}>
                <strong>{l.codigo}</strong> — {l.descripcion}
                <div style={{ fontSize: 12, color: negativo ? 'var(--danger)' : 'var(--text-muted)', marginTop: 2 }}>
                  Stock actual {formatoCantidad(l.stock ?? 0)}
                  {queda !== null && <> → quedará <strong>{formatoCantidad(queda)}</strong>{negativo ? ' (no puede quedar en negativo)' : ''}</>}
                </div>
              </div>
              <div role="group" aria-label={`Tipo de ajuste de ${l.codigo}`} style={{ display: 'flex', gap: 4 }}>
                <Button size="sm" variant={l.tipo === 'suma' ? 'success' : 'ghost'} aria-pressed={l.tipo === 'suma'} onClick={() => cambiar(l.item_id, { tipo: 'suma' })}><Icono n="mas" /> Suma</Button>
                <Button size="sm" variant={l.tipo === 'resta' ? 'red' : 'ghost'} aria-pressed={l.tipo === 'resta'} onClick={() => cambiar(l.item_id, { tipo: 'resta' })}><Icono n="menos" /> Resta</Button>
              </div>
              <label htmlFor={`aj-cant-${l.item_id}`} style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cantidad:</label>
              <Input id={`aj-cant-${l.item_id}`} type="text" inputMode="decimal" placeholder="0" style={{ width: 80 }} value={l.texto} onChange={e => cambiar(l.item_id, { texto: e.target.value })} />
              <Button variant="dangerGhost" size="icon" title="Quitar" onClick={() => setLineas(prev => prev.filter(x => x.item_id !== l.item_id))}><Icono n="cerrar" /></Button>
            </div>
          );
        })}
      </div>

      <div className="form-group full" style={{ marginTop: 16 }}>
        <label htmlFor="ajuste-motivo">Motivo del ajuste (obligatorio)</label>
        <Textarea id="ajuste-motivo" rows={2} maxLength={500} placeholder="Ej: conteo físico de octubre; material retirado sin anotar por mantenimiento..." value={motivo} onChange={e => setMotivo(e.target.value)} />
      </div>
      {lineas.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 8 }}>
          {resumen.sumas > 0 && <><Icono n="mas" /> Suma {formatoCantidad(resumen.unidadesSumadas)} unidades en {resumen.sumas} artículo{resumen.sumas === 1 ? '' : 's'}. </>}
          {resumen.restas > 0 && <><Icono n="menos" /> Resta {formatoCantidad(resumen.unidadesRestadas)} unidades en {resumen.restas} artículo{resumen.restas === 1 ? '' : 's'}.</>}
        </p>
      )}
    </Modal>
  );
}
