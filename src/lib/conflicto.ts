// Cuando dos personas editan lo mismo a la vez: antes ganaba la última en guardar y pisaba en silencio lo de la otra (por ejemplo, volvía a poner un stock viejo).
// Ahora cada guardado dice sobre qué versión se hizo: si en el medio alguien cambió el registro, el guardado no se hace y se avisa con este error.
export class ConflictoDeEdicion extends Error {
  constructor(queEs: string) {
    super(`Alguien modificó ${queEs} mientras lo editabas. Se cargó la versión nueva: revisala y volvé a guardar.`);
    this.name = 'ConflictoDeEdicion';
  }
}
