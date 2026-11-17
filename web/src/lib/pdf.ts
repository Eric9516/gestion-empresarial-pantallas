import 'server-only';
import { execFile } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';

/**
 * Reacomoda un PDF para verlo por partes ("vista web rápida"): lo que el visor necesita para mostrar la primera página queda al principio del
 * archivo, así aparece enseguida aunque el manual pese 90 MB. No cambia el contenido ni la calidad. Lo hace qpdf (está en la caja del
 * servidor: web/Dockerfile); si no está (en la computadora) o falla, el archivo queda como vino, que igual se puede ver.
 */
export async function optimizarParaVerPorPartes(archivo: string): Promise<boolean> {
  const temporal = `${archivo}.optimizando`;
  const salio = await new Promise<boolean>(listo => {
    execFile('qpdf', ['--linearize', '--object-streams=preserve', archivo, temporal], { timeout: 180_000 }, error => {
      // qpdf termina con 3 cuando corrige algo menor del PDF original: el resultado igual sirve
      const codigo = (error as { code?: number | string } | null)?.code;
      listo(!error || codigo === 3);
    });
  });
  if (!salio) {
    await rm(temporal, { force: true });
    return false;
  }
  await rename(temporal, archivo);
  return true;
}
