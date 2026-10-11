import { useState, type FormEvent } from 'react';
import Modal from '../../components/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Se monta solo mientras está abierto, así los campos arrancan vacíos cada vez.
interface Props {
  onClose: () => void;
  titulo: string;
  codigosExistentes: string[];
  mensajeDuplicado: string;
  onGuardar: (codigo: string, nombre: string) => Promise<void>;
}

export default function NuevoCodigoModal({ onClose, titulo, codigosExistentes, mensajeDuplicado, onGuardar }: Props) {
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const errorCodigo = !/^[A-Z]{2}$/.test(codigo)
    ? 'Tiene que ser exactamente 2 letras'
    : codigosExistentes.includes(codigo) ? mensajeDuplicado : null;
  const errorNombre = nombre.trim() ? null : 'Escribí un nombre';
  const mostrarCodigo = (intento || codigo.length > 0) && errorCodigo;
  const mostrarNombre = intento && errorNombre;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIntento(true);
    if (errorCodigo || errorNombre) return;
    setGuardando(true);
    try {
      await onGuardar(codigo, nombre.trim());
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={titulo}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="form-nuevo-codigo" variant="success" disabled={guardando}>Crear</Button>
        </>
      }
    >
      <form id="form-nuevo-codigo" onSubmit={e => void handleSubmit(e)} noValidate>
        <div className="form-group">
          <label htmlFor="nuevoCodigo">Código (2 letras) *</label>
          <Input
            id="nuevoCodigo"
            data-autofocus
            type="text"
            maxLength={2}
            autoComplete="off"
            placeholder="Ej: CA"
            value={codigo}
            onChange={e => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            aria-invalid={mostrarCodigo ? true : undefined}
            aria-describedby={mostrarCodigo ? 'nuevoCodigoError' : undefined}
          />
          {mostrarCodigo && <div id="nuevoCodigoError" role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errorCodigo}</div>}
        </div>
        <div className="form-group">
          <label htmlFor="nuevoNombre">Nombre *</label>
          <Input
            id="nuevoNombre"
            type="text"
            autoComplete="off"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            aria-invalid={mostrarNombre ? true : undefined}
            aria-describedby={mostrarNombre ? 'nuevoNombreError' : undefined}
          />
          {mostrarNombre && <div id="nuevoNombreError" role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errorNombre}</div>}
        </div>
      </form>
    </Modal>
  );
}
