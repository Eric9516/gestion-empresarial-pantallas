// Importar familias y subfamilias desde la planilla de codificación: leerla y compararla con lo que hay. Lo comparten la app de Vite y la de
// Next (cada una pide los datos y guarda a su manera).

// Columnas de la planilla "CODIFICACION REPUESTOS SYC": B=familia (nombre),
// C=familia (código), D=subfamilia (nombre), E=subfamilia (código). Los datos
// arrancan en la fila 6 (las primeras 5 son título/leyenda). Un nombre de
// familia largo a veces queda partido en dos filas (sin código en la
// segunda) — esa segunda fila se pega al nombre de la fila anterior en vez
// de tratarse como una familia nueva.
const COL_FAM_NOMBRE = 1;
const COL_FAM_CODIGO = 2;
const COL_SUB_NOMBRE = 3;
const COL_SUB_CODIGO = 4;

interface FamiliaLeida {
  nombre: string;
  codigo: string;
  subs: { nombre: string; codigo: string }[];
}

export interface FamiliaNueva { codigo: string; nombre: string }
export interface FamiliaCompletar { id: string; codigo: string; nombre: string }
export interface FamiliaConflicto { id: string; codigo: string; nombreExcel: string; nombreActual: string }
export interface SubfamiliaNueva { familiaCodigo: string; familiaNombre: string; codigo: string; nombre: string }
export interface SubfamiliaCompletar { id: string; familiaId: string; codigo: string; nombre: string }
export interface SubfamiliaConflicto { id: string; familiaId: string; familiaCodigo: string; codigo: string; nombreExcel: string; nombreActual: string }
interface NoProcesado { familiaCodigo: string; codigo: string; nombre: string; motivo: string }

export interface AnalisisFamilias {
  familiasNuevas: FamiliaNueva[];
  familiasCompletar: FamiliaCompletar[];
  familiasConflicto: FamiliaConflicto[];
  subfamiliasNuevas: SubfamiliaNueva[];
  subfamiliasCompletar: SubfamiliaCompletar[];
  subfamiliasConflicto: SubfamiliaConflicto[];
  noProcesados: NoProcesado[];
  totalFamilias: number;
  totalSubfamilias: number;
}

function leerFamilias(filas: unknown[][]): FamiliaLeida[] {
  const familias: FamiliaLeida[] = [];
  let actual: FamiliaLeida | null = null;

  for (const row of filas) {
    const famNombre = String(row[COL_FAM_NOMBRE] ?? '').trim();
    // La planilla trae el código de familia con una letra de prefijo que no
    // se guarda (ej. "MLB"): familias.codigo exige char_length = 2, así que
    // se descarta el primer carácter y se queda solo con las 2 letras reales
    // de familia.
    const famCodigoPlanilla = String(row[COL_FAM_CODIGO] ?? '').trim().toUpperCase();
    const famCodigo = famCodigoPlanilla.length > 2 ? famCodigoPlanilla.slice(1) : famCodigoPlanilla;
    const subNombre = String(row[COL_SUB_NOMBRE] ?? '').trim();
    const subCodigo = String(row[COL_SUB_CODIGO] ?? '').trim().toUpperCase();

    if (famCodigo) {
      actual = { nombre: famNombre, codigo: famCodigo, subs: [] };
      familias.push(actual);
    } else if (famNombre && actual) {
      // Continuación del nombre de la familia anterior (fila sin código propio).
      actual.nombre = `${actual.nombre} ${famNombre}`.trim();
    }

    if (subNombre && actual) {
      actual.subs.push({ nombre: subNombre, codigo: subCodigo });
    }
  }
  return familias;
}

/** Lo que hace falta de la base para analizar la planilla: las familias y subfamilias que ya existen. */
export interface DatosDeFamiliasParaImportar {
  familias: { id: string; codigo: string; nombre: string }[];
  subfamilias: { id: string; codigo: string; nombre: string; familia_id: string }[];
}

/** Lo que se guarda: lo nuevo y lo que se completa (los conflictos que la persona eligió reemplazar van en "completar"). */
export interface LoteDeFamilias {
  familiasNuevas: FamiliaNueva[]; familiasCompletar: FamiliaCompletar[];
  subfamiliasNuevas: SubfamiliaNueva[]; subfamiliasCompletar: SubfamiliaCompletar[];
}

export async function analizarExcelFamilias(file: File, { familias: familiasDb, subfamilias: subfamiliasDb }: DatosDeFamiliasParaImportar): Promise<AnalisisFamilias> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const filas: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 5, defval: '' });

  const familiasExcel = leerFamilias(filas);

  const familiaPorCodigo = new Map((familiasDb ?? []).map(f => [f.codigo, f]));
  const subPorParClave = new Map((subfamiliasDb ?? []).map(s => {
    const fam = (familiasDb ?? []).find(f => f.id === s.familia_id);
    return [`${fam?.codigo ?? ''}|${s.codigo}`, s];
  }));

  const familiasNuevas: FamiliaNueva[] = [];
  const familiasCompletar: FamiliaCompletar[] = [];
  const familiasConflicto: FamiliaConflicto[] = [];
  const subfamiliasNuevas: SubfamiliaNueva[] = [];
  const subfamiliasCompletar: SubfamiliaCompletar[] = [];
  const subfamiliasConflicto: SubfamiliaConflicto[] = [];
  const noProcesados: NoProcesado[] = [];
  let totalSubfamilias = 0;

  const familiasNuevasPorCodigo = new Map<string, FamiliaNueva>();

  for (const fam of familiasExcel) {
    // familias.codigo y subfamilias.codigo exigen exactamente 2 letras — una
    // fila con el código vacío o mal tipeado (ej. "L J" con un espacio de
    // más) rompía el guardado de TODO el lote, porque se insertaban todas
    // juntas en un solo pedido. Ahora esa fila puntual se avisa como "no
    // procesada" (mismo trato que un código duplicado) y el resto se guarda igual.
    if (fam.codigo.length !== 2) {
      noProcesados.push({ familiaCodigo: fam.codigo, codigo: '', nombre: fam.nombre, motivo: `Código de familia inválido ("${fam.codigo}") — tiene que tener exactamente 2 letras` });
      continue;
    }

    const existente = familiaPorCodigo.get(fam.codigo);
    if (!existente) {
      if (!familiasNuevasPorCodigo.has(fam.codigo)) {
        const nueva = { codigo: fam.codigo, nombre: fam.nombre };
        familiasNuevasPorCodigo.set(fam.codigo, nueva);
        familiasNuevas.push(nueva);
      }
    } else if (existente.nombre !== fam.nombre) {
      // Nombre = código todavía === nunca se le puso un nombre real, así que
      // no hay nada que "perder" completándolo. Si ya tiene un nombre real
      // distinto, ahí sí es un conflicto de verdad — se avisa, no se pisa.
      if (existente.nombre === existente.codigo) {
        familiasCompletar.push({ id: existente.id, codigo: fam.codigo, nombre: fam.nombre });
      } else {
        familiasConflicto.push({ id: existente.id, codigo: fam.codigo, nombreExcel: fam.nombre, nombreActual: existente.nombre });
      }
    }

    const codigosVistos = new Set<string>();
    for (const sub of fam.subs) {
      totalSubfamilias++;
      if (sub.codigo.length !== 2) {
        noProcesados.push({
          familiaCodigo: fam.codigo, codigo: sub.codigo, nombre: sub.nombre,
          motivo: sub.codigo ? `Código inválido ("${sub.codigo}") — tiene que tener exactamente 2 letras` : 'No tiene código cargado en la planilla',
        });
        continue;
      }
      if (codigosVistos.has(sub.codigo)) {
        noProcesados.push({ familiaCodigo: fam.codigo, codigo: sub.codigo, nombre: sub.nombre, motivo: `Código repetido dentro de "${fam.nombre}" — se dejó solo la primera aparición` });
        continue;
      }
      codigosVistos.add(sub.codigo);

      const clave = `${fam.codigo}|${sub.codigo}`;
      const existenteSub = subPorParClave.get(clave);
      if (!existenteSub) {
        subfamiliasNuevas.push({ familiaCodigo: fam.codigo, familiaNombre: fam.nombre, codigo: sub.codigo, nombre: sub.nombre });
      } else if (existenteSub.nombre !== sub.nombre) {
        if (existenteSub.nombre === existenteSub.codigo) {
          subfamiliasCompletar.push({ id: existenteSub.id, familiaId: existenteSub.familia_id, codigo: sub.codigo, nombre: sub.nombre });
        } else {
          subfamiliasConflicto.push({ id: existenteSub.id, familiaId: existenteSub.familia_id, familiaCodigo: fam.codigo, codigo: sub.codigo, nombreExcel: sub.nombre, nombreActual: existenteSub.nombre });
        }
      }
    }
  }

  return {
    familiasNuevas, familiasCompletar, familiasConflicto,
    subfamiliasNuevas, subfamiliasCompletar, subfamiliasConflicto,
    noProcesados, totalFamilias: familiasExcel.length, totalSubfamilias,
  };
}
