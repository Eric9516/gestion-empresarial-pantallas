// jsqr no publica tipos propios ni hay @types/jsqr — declaración mínima con lo
// que realmente usamos (jsQR(datos, ancho, alto) -> { data } | null).
declare module 'jsqr' {
  interface QRCode {
    data: string;
  }
  function jsQR(data: Uint8ClampedArray, width: number, height: number): QRCode | null;
  export default jsQR;
}
