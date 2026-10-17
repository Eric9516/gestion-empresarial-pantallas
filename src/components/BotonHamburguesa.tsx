interface Props {
  onClick: () => void;
  /** Hay algo nuevo en el menú: se muestra un puntito rojo para llamar la atención aunque el menú esté cerrado. */
  aviso?: boolean;
}

export default function BotonHamburguesa({ onClick, aviso = false }: Props) {
  return (
    <button className="hamburger-btn" onClick={onClick} aria-label="Menú" title={aviso ? 'Hay novedades' : undefined}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
      </svg>
      {aviso && <span className="hamburger-aviso" aria-hidden="true" />}
    </button>
  );
}
