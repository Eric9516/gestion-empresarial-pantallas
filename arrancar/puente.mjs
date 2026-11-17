// Atiende a la base en memoria (PGlite) por TCP, con el protocolo de PostgreSQL, para que Next se conecte igual que al servidor (con `pg`).
// PGlite es una sola sesión: se atiende una conexión por vez (Next usa una sola en las pruebas: CONEXIONES_DE_LA_BASE=1) y las demás esperan.
// Cada conexión entra como el rol de Next (no como el dueño de la base), así las pruebas ven los mismos permisos que en el servidor.
import { createServer } from 'node:net';

const SSL_O_GSS = new Set([80877103, 80877104]);
const CANCELAR = 80877102;

function mensaje(tipo, cuerpo = Buffer.alloc(0)) {
  const m = Buffer.alloc(5 + cuerpo.length);
  m.write(tipo, 0, 'latin1');
  m.writeInt32BE(4 + cuerpo.length, 1);
  cuerpo.copy(m, 5);
  return m;
}
const entero = n => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const parametro = (k, v) => mensaje('S', Buffer.from(`${k}\0${v}\0`));
/** Los mensajes de una respuesta, uno por uno. */
function partes(r) {
  const b = Buffer.from(r.buffer, r.byteOffset, r.length);
  const lista = [];
  for (let i = 0; i + 5 <= b.length; i += 1 + b.readInt32BE(i + 1)) lista.push(b.subarray(i, i + 1 + b.readInt32BE(i + 1)));
  return lista;
}

export function atenderPorTcp(db, { puerto, rol }) {
  let turno = Promise.resolve();

  const servidor = createServer(socket => {
    let liberar;
    const mio = new Promise(r => { liberar = r; });
    const anterior = turno;
    turno = turno.then(() => mio);
    let pendiente = Buffer.alloc(0);
    let arranco = false;
    let cola = Promise.resolve();
    let cerrado = false;
    let hastaElSync = false;

    const cerrar = () => {
      if (cerrado) return;
      cerrado = true;
      // lo que quedó a medias de esta conexión no pasa a la siguiente
      cola = cola.then(() => db.exec('rollback; reset all')).catch(() => {}).finally(liberar);
    };
    socket.on('close', cerrar);
    socket.on('error', cerrar);

    socket.on('data', datos => {
      pendiente = Buffer.concat([pendiente, datos]);
      for (;;) {
        if (!arranco) {
          if (pendiente.length < 8) return;
          const largo = pendiente.readInt32BE(0);
          if (pendiente.length < largo) return;
          const codigo = pendiente.readInt32BE(4);
          pendiente = pendiente.subarray(largo);
          if (SSL_O_GSS.has(codigo)) { socket.write('N'); continue; }
          if (codigo === CANCELAR) { socket.end(); return; }
          arranco = true;
          cola = cola.then(() => anterior).then(async () => {
            await db.exec(`reset all; set session authorization ${rol}`);
            socket.write(Buffer.concat([
              mensaje('R', entero(0)),
              parametro('server_version', '17.0'), parametro('client_encoding', 'UTF8'), parametro('server_encoding', 'UTF8'),
              parametro('DateStyle', 'ISO, MDY'), parametro('integer_datetimes', 'on'), parametro('standard_conforming_strings', 'on'),
              mensaje('K', Buffer.concat([entero(process.pid), entero(0)])),
              mensaje('Z', Buffer.from('I')),
            ]));
          });
          continue;
        }
        if (pendiente.length < 5) return;
        const total = 1 + pendiente.readInt32BE(1);
        if (pendiente.length < total) return;
        const m = pendiente.subarray(0, total);
        pendiente = pendiente.subarray(total);
        if (m[0] === 0x58) { socket.end(); return; } // 'X': se despide
        cola = cola.then(async () => {
          // Como PostgreSQL: si falla una parte de un pedido de varias (Parse, Bind, Execute… y al final Sync), se avisa el error y lo que
          // llega hasta el Sync se descarta; el "listo" (Z) va recién con el Sync. PGlite lo manda ya con el error y otra vez con el Sync:
          // `pg` tomaría el segundo como el final del pedido siguiente y se caería.
          if (m[0] === 0x53) hastaElSync = false; else if (hastaElSync) return;
          let respuesta = await db.execProtocolRaw(new Uint8Array(m));
          if (m[0] !== 0x53 && m[0] !== 0x51 && partes(respuesta).some(p => p[0] === 0x45)) {
            hastaElSync = true;
            respuesta = Buffer.concat(partes(respuesta).filter(p => p[0] !== 0x5a));
          }
          if (!cerrado && respuesta.length) socket.write(respuesta);
        }).catch(e => { console.error('[puente]', e); socket.destroy(); });
      }
    });
  });

  return new Promise((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(puerto, '127.0.0.1', () => resolve(servidor));
  });
}
