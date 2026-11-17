// El armazón de una pantalla mientras el servidor la arma: lo usan los loading.tsx, así al tocar un enlace la pantalla cambia al
// instante (la cabecera y el menú quedan) y no se espera el viaje hasta el servidor para ver que algo pasó.
export default function Cargando() {
  return (
    <div className="cargando" role="status" aria-label="Cargando">
      <div className="cargando-barra cargando-titulo" />
      {[0, 1, 2, 3, 4].map(i => <div key={i} className="cargando-barra cargando-fila" />)}
    </div>
  );
}
