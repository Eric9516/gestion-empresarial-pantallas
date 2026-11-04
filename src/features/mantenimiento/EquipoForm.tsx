import { useId, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { mensajeDeError } from '../../lib/errores';
import { useEquiposQuery, useGuardarEquipo, useSectoresMantenimiento } from './useEquipos';
import type { Equipo } from './tipos';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Icono } from '@/components/Icono';

interface Props {
  open: boolean;
  onClose: () => void;
  /** null = equipo nuevo. */
  equipo: Equipo | null;
  onCreado?: (id: string) => void;
  /** Para crear un sub-equipo desde la ficha del principal. */
  padre?: Equipo | null;
}

export default function EquipoForm({ open, onClose, equipo, onCreado, padre }: Props) {
  // Se vuelve a montar el formulario cada vez que se abre, así arranca con los datos del equipo.
  return (
    <Modal open={open} onClose={onClose} large title={<><Icono n={equipo ? 'editar' : 'mas'} /> {equipo ? `Editar ${equipo.codigo}` : padre ? `Nuevo sub-equipo de ${padre.codigo}` : 'Nuevo equipo'}</>}>
      {open && <Formulario equipo={equipo} onClose={onClose} onCreado={onCreado} padre={padre} />}
    </Modal>
  );
}

function Formulario({ equipo, onClose, onCreado, padre }: Omit<Props, 'open'>) {
  const uid = useId();
  const toast = useToast();
  const guardar = useGuardarEquipo();
  const { data: equipos } = useEquiposQuery();
  const [padreId, setPadreId] = useState(equipo?.padreId ?? padre?.id ?? '');
  const tieneHijos = !!equipo && equipos.some(e => e.padreId === equipo.id);
  // Equipos que pueden ser principales: los que no son sub-equipos (y no este mismo).
  const principales = useMemo(() => equipos.filter(e => !e.padreId && e.id !== equipo?.id)
    .map(e => ({ value: e.id, label: `${e.codigo} — ${e.nombre}`, buscar: [e.sector] })), [equipos, equipo]);
  const [f, setF] = useState({
    codigo: equipo?.codigo ?? (padre ? `${padre.codigo}-` : ''), nombre: equipo?.nombre ?? '', sector: equipo?.sector ?? padre?.sector ?? '', subsector: equipo?.subsector ?? padre?.subsector ?? '', etiquetas: equipo?.etiquetas.join(', ') ?? '',
    marca: equipo?.marca ?? '', modelo: equipo?.modelo ?? '', numeroSerie: equipo?.numeroSerie ?? '', ubicacion: equipo?.ubicacion ?? '',
    critico: equipo?.critico ?? false, notas: equipo?.notas ?? '',
  });
  const set = (campo: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(p => ({ ...p, [campo]: e.target.value }));

  const listaSectores = useSectoresMantenimiento();
  const sectores = listaSectores.map(s => s.nombre);
  const subsectores = listaSectores.find(s => s.nombre.toLowerCase() === f.sector.trim().toLowerCase())?.subsectores.map(s => s.nombre) ?? [];
  const etiquetasUsadas = useMemo(() => [...new Set(equipos.flatMap(e => e.etiquetas))].sort((a, b) => a.localeCompare(b, 'es')), [equipos]);

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!f.codigo.trim() || !f.nombre.trim()) { toast('Completá el código y el nombre.', 'error'); return; }
    const etiquetas = [...new Set(f.etiquetas.split(',').map(s => s.trim()).filter(Boolean))];
    try {
      const id = await guardar.mutateAsync({ ...f, codigo: f.codigo.trim(), nombre: f.nombre.trim(), sector: f.sector.trim(), subsector: f.sector.trim() ? f.subsector.trim() : '', etiquetas, id: equipo?.id, padreId: padreId || null });
      toast(equipo ? 'Equipo actualizado' : 'Equipo creado', 'success');
      onClose();
      if (!equipo) onCreado?.(id);
    } catch (err) {
      toast(mensajeDeError(err), 'error');
    }
  }

  return (
    <form onSubmit={enviar}>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor={`${uid}-cod`}>Código *</label>
          <Input id={`${uid}-cod`} data-autofocus value={f.codigo} onChange={set('codigo')} placeholder="Ej.: BC-01" />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-nom`}>Nombre *</label>
          <Input id={`${uid}-nom`} value={f.nombre} onChange={set('nombre')} placeholder="Ej.: Bomba de agua" />
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-pad`}>Pertenece a (si es un sub-equipo)</label>
          {tieneHijos ? (
            <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>Es un equipo principal con sub-equipos.</div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <Combobox id={`${uid}-pad`} value={padreId} onChange={id => {
                  setPadreId(id);
                  const p = equipos.find(e => e.id === id);
                  if (p && !f.sector) setF(x => ({ ...x, sector: p.sector, subsector: p.subsector }));
                }} opciones={principales} placeholder="Es un equipo principal" />
              </div>
              {padreId && <Button type="button" variant="ghost" size="sm" onClick={() => setPadreId('')}>Quitar</Button>}
            </div>
          )}
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-sec`}>Sector</label>
          <Input id={`${uid}-sec`} list={`${uid}-sectores`} value={f.sector} onChange={set('sector')} placeholder="Elegí o escribí uno nuevo" />
          <datalist id={`${uid}-sectores`}>{sectores.map(s => <option key={s} value={s} />)}</datalist>
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-sub`}>Sub-sector (opcional)</label>
          <Input id={`${uid}-sub`} list={`${uid}-subsectores`} value={f.subsector} onChange={set('subsector')} disabled={!f.sector.trim()} placeholder={f.sector.trim() ? 'Ej.: Aire comprimido' : 'Elegí primero el sector'} />
          <datalist id={`${uid}-subsectores`}>{subsectores.map(s => <option key={s} value={s} />)}</datalist>
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-ubi`}>Ubicación</label>
          <Input id={`${uid}-ubi`} value={f.ubicacion} onChange={set('ubicacion')} />
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-eti`}>Etiquetas (palabras clave, separadas por coma)</label>
          <Input id={`${uid}-eti`} value={f.etiquetas} onChange={set('etiquetas')} placeholder="bomba, línea 1, frío" />
          {etiquetasUsadas.length > 0 && (
            <div className="mt-tags" style={{ marginTop: 6 }}>
              {etiquetasUsadas.slice(0, 20).map(t => (
                <button key={t} type="button" className="mt-tag" style={{ cursor: 'pointer' }}
                  onClick={() => setF(p => ({ ...p, etiquetas: [...new Set([...p.etiquetas.split(',').map(s => s.trim()).filter(Boolean), t])].join(', ') }))}>
                  + {t}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-mar`}>Marca</label>
          <Input id={`${uid}-mar`} value={f.marca} onChange={set('marca')} />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-mod`}>Modelo</label>
          <Input id={`${uid}-mod`} value={f.modelo} onChange={set('modelo')} />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-ser`}>N.º de serie</label>
          <Input id={`${uid}-ser`} value={f.numeroSerie} onChange={set('numeroSerie')} />
        </div>
        <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontWeight: 700 }}>
            <input type="checkbox" checked={f.critico} onChange={e => setF(p => ({ ...p, critico: e.target.checked }))} style={{ width: 18, height: 18 }} />
            Equipo crítico (si para, para la producción)
          </label>
        </div>
        <div className="form-group full">
          <label htmlFor={`${uid}-not`}>Notas</label>
          <Textarea id={`${uid}-not`} value={f.notas} onChange={set('notas')} />
        </div>
      </div>
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={guardar.isPending}><Icono n="guardar" /> Guardar</Button>
      </div>
    </form>
  );
}
