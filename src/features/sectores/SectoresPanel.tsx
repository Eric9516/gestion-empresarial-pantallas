import { useRef, useState, type FocusEvent, type FormEvent } from 'react';
import { useToast } from '../../components/ToastProvider';
import { useConfirm } from '../../components/ConfirmProvider';
import { useAddSector, useDeleteSector, useRenameSector, useSectoresQuery, useToggleSectorActivo, type Sector } from './useSectores';
import { useMenu } from '../../lib/useMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mensajeDeError } from '@/lib/errores';
import { Icono } from '@/components/Icono';

function SectorMenu({ sector, onModificar, onToggle, onDelete }: { sector: Sector; onModificar: () => void; onToggle: () => void; onDelete: () => void }) {
  const { abierto: open, cerrar, contenedorRef, disparador, menu } = useMenu();

  return (
    <div ref={contenedorRef} style={{ position: 'relative' }}>
      <Button type="button" variant="ghost" size="icon" {...disparador} aria-label="Más acciones"><Icono n="masAcciones" /></Button>
      <div className={`user-dropdown${open ? ' open' : ''}`} style={{ right: 0, left: 'auto' }} {...menu}>
        <button role="menuitem" className="user-dropdown-item" onClick={() => { onModificar(); cerrar(); }}><Icono n="editar" /> Modificar</button>
        <button role="menuitem" className="user-dropdown-item" onClick={() => { onToggle(); cerrar(); }}>
          {sector.activo ? <><Icono n="candado" /> Bloquear</> : <><Icono n="candadoAbierto" /> Desbloquear</>}
        </button>
        <button role="menuitem" className="user-dropdown-item user-dropdown-danger" onClick={() => { onDelete(); cerrar(); }}><Icono n="borrar" /> Eliminar</button>
      </div>
    </div>
  );
}

export default function SectoresPanel() {
  const { data: sectores, isLoading, isError } = useSectoresQuery();
  const addSector = useAddSector();
  const renameSector = useRenameSector();
  const toggleActivo = useToggleSectorActivo();
  const deleteSector = useDeleteSector();
  const toast = useToast();
  const confirmar = useConfirm();

  const [nombre, setNombre] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const savedTimeout = useRef<number | undefined>(undefined);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) return;
    if (sectores?.some(s => s.nombre.toLowerCase() === nombreLimpio.toLowerCase())) {
      toast('Ya existe un sector con ese nombre', 'error');
      return;
    }
    try {
      await addSector.mutateAsync(nombreLimpio);
      setNombre('');
      toast('Sector agregado', 'success');
    } catch (e) {
      toast('Error al agregar: ' + mensajeDeError(e), 'error');
    }
  }

  async function handleRename(sector: Sector, e: FocusEvent<HTMLInputElement>) {
    const nuevoNombre = e.target.value.trim();
    if (!nuevoNombre || nuevoNombre === sector.nombre) return;
    try {
      await renameSector.mutateAsync({ id: sector.id, nombre: nuevoNombre });
      setSavedId(sector.id);
      window.clearTimeout(savedTimeout.current);
      savedTimeout.current = window.setTimeout(() => setSavedId(null), 900);
    } catch {
      toast('Error al guardar el nombre', 'error');
    }
  }

  async function handleToggle(sector: Sector) {
    try {
      await toggleActivo.mutateAsync({ id: sector.id, activo: !sector.activo });
    } catch {
      toast('Error al actualizar el sector', 'error');
    }
  }

  async function handleDelete(sector: Sector) {
    if (!(await confirmar(`¿Eliminar el sector "${sector.nombre}"? Esta acción no se puede deshacer.`, { textoConfirmar: 'Eliminar', peligroso: true }))) return;
    try {
      await deleteSector.mutateAsync(sector.id);
      toast('Sector eliminado', 'success');
    } catch (e) {
      const esConflictoDeUso = (e as { code?: string })?.code === '23503';
      toast(
        esConflictoDeUso
          ? `"${sector.nombre}" ya tiene retiros registrados — no se puede eliminar. Usá "Bloquear" en su lugar.`
          : 'Error al eliminar: ' + mensajeDeError(e),
        'error',
      );
    }
  }

  return (
    <div className="admin-card" style={{ maxWidth: 480 }}>
      <div className="admin-card-header"><Icono n="fabrica" /> Sectores</div>
      <div className="admin-card-body">
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          Es obligatorio elegir un sector al confirmar un retiro. Los nombres se guardan solos al salir del campo.
        </div>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Input type="text" placeholder="Ej: Producción" value={nombre} onChange={e => setNombre(e.target.value)} />
          <Button type="submit" variant="primary" size="sm" disabled={addSector.isPending}>Agregar</Button>
        </form>

        {isLoading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</p>}
        {isError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>Error al cargar los sectores.</p>}
        {!isLoading && !isError && !sectores?.length && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Todavía no hay sectores cargados.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sectores?.map(sector => (
            <div key={sector.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Input
                ref={el => { inputRefs.current[sector.id] = el; }}
                type="text"
                defaultValue={sector.nombre}
                style={{ flex: 1, transition: 'border-color .3s', borderColor: savedId === sector.id ? 'var(--success)' : undefined }}
                onBlur={e => void handleRename(sector, e)}
              />
              <SectorMenu
                sector={sector}
                onModificar={() => inputRefs.current[sector.id]?.focus()}
                onToggle={() => void handleToggle(sector)}
                onDelete={() => void handleDelete(sector)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
