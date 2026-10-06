declare module "utif" {
  type Ifd = {
    t256?: number[];
    t257?: number[];
    t258?: number[];
    t259?: number[];
    t262?: number[];
    t273?: number[];
    t277?: number[];
    t278?: number[];
    t279?: number[];
    t284?: number[];
  };
  const UTIF: {
    decode(buffer: ArrayBuffer): Ifd[];
    decodeImage(buffer: ArrayBuffer, ifd: Ifd): void;
    toRGBA8(ifd: Ifd): Uint8Array;
  };
  export default UTIF;
}
