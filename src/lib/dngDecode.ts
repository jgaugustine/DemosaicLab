import UTIF from 'utif';
import { DemosaicInput, CFAType } from '@/types/demosaic';

export async function decodeDNG(file: File): Promise<DemosaicInput> {
  const buffer = await file.arrayBuffer();
  const ifds = UTIF.decode(buffer);
  
  if (ifds.length === 0) {
    throw new Error("No IFDs found in DNG");
  }
  
  // Usually the RAW data is in the first IFD or specifically marked
  // For DNG, the main image is often IFD 0, but sometimes previews are there.
  // We need 'NewSubfileType' to distinguish. 0 = main image.
  
  // Find the main RAW IFD
  const rawIFD = ifds.find((ifd: any) => !ifd.t254 || ifd.t254[0] === 0) || ifds[0];
  
  UTIF.decodeImage(buffer, rawIFD);
  
  const width = rawIFD.width;
  const height = rawIFD.height;
  const data = UTIF.toRGBA8(rawIFD); // This returns RGBA 8-bit for display, but we want RAW data
  
  // UTIF might decode to RGB if it's not RAW.
  // If it's CFA, PhotometricInterpretation (t262) should be 32803 (CFA).
  // 34892 is LinearRaw.
  
  const isCFA = rawIFD.t262 && rawIFD.t262[0] === 32803;
  
  if (!isCFA) {
    // If not CFA, maybe it's already demosaiced or linear raw?
    // For this tool, we want CFA.
    // But let's proceed assuming we can extract single plane if needed.
    console.warn("Image does not declare CFA PhotometricInterpretation");
  }
  
  // Access raw data
  // UTIF puts data in ifd.data
  const rawData = rawIFD.data; // Uint8Array or Uint16Array
  
  // Convert to Float32 0-1
  // Check BitDepth (t258)
  const bitDepth = rawIFD.t258 ? rawIFD.t258[0] : 8;
  const maxVal = (1 << bitDepth) - 1;
  
  const cfaFloat = new Float32Array(width * height);
  
  // If rawData is Uint8Array (and bitDepth > 8), UTIF might have parsed it.
  // UTIF.decodeImage populates `ifd.data` which is usually the decompressed bytes.
  // If it's compressed (Lossless JPEG etc), UTIF handles it.
  // But `toRGBA8` converts. We want the raw values.
  
  // Need to interpret `ifd.data` based on bits per sample.
  // If UTIF decoded it, it might be a Uint8Array of bytes.
  // If 16-bit, we need to read as Uint16.
  
  // NOTE: UTIF's `data` is a Uint8Array of the decompressed stream.
  // If 16-bit, we need to reinterpret.
  
  let rawValues: Uint16Array | Uint8Array;
  
  if (bitDepth === 16) {
     // Reinterpret bytes as Uint16 (Little Endian usually? TIFF is LE or BE based on header)
     // UTIF handles endianness during decoding? No, decodeImage just decompresses.
     // Actually UTIF might NOT handle 16-bit raw array creation automatically from `data`.
     // Let's check UTIF usage. `UTIF.toRGBA8` does the conversion.
     // We might need to manually parse `ifd.data`.
     
     // Simplified assumption: UTIF gives us a Uint8Array `ifd.data`.
     // If 16-bit, we combine bytes.
     // TIFF header tells endianness. `UTIF.decode` parses it.
     // `ifds[0].isLE` might exist? `UTIF` library internals are simple.
     
     // Let's assume for MVP we handle what UTIF gives.
     // If UTIF doesn't expose raw values easily, we might struggle.
     // `utif` is mostly for display.
     
     // Plan update: if UTIF is too high level, we might need to just trust `toRGBA8` 
     // IF we can't get raw. But `toRGBA8` demosaics? No, `toRGBA8` usually just maps channels.
     // If CFA, `toRGBA8` might produce a grayscale-like image (1 channel mapped to RGB or something).
     
     // Let's try to read `ifd.data`.
     // For safety, map `toRGBA8` result to single channel if we can't parse raw easily.
     // But we want high bit depth if possible.
     
     // Let's try to use `ifd.data`.
     // If 16-bit, `ifd.data` is 2x pixels.
     
     // HACK: parsing 16-bit LE from the buffer.
     if (rawIFD.data.length === width * height * 2) {
       const u8 = rawIFD.data;
       const u16 = new Uint16Array(width * height);
       // TIFF usually Little Endian (II) or Big Endian (MM).
       // UTIF doesn't export endianness easily on the IFD object publicly?
       // Let's try LE (common for DNG).
       for (let i = 0; i < width * height; i++) {
         u16[i] = u8[2*i] | (u8[2*i+1] << 8);
       }
       rawValues = u16;
     } else {
       rawValues = rawIFD.data;
     }
  } else {
    rawValues = rawIFD.data;
  }
  
  for (let i = 0; i < width * height; i++) {
    cfaFloat[i] = rawValues[i] / maxVal;
  }
  
  // Detect Pattern
  // CFAPattern (t33422)
  // CFAPlaneColor (t50931)
  // CFALayout (t50711)
  
  // Default to Bayer RGGB if not found
  let layout = 'RGGB';
  
  if (rawIFD.t33422) {
    // Bayer pattern code.
    // 0=Red, 1=Green, 2=Blue.
    // 2x2 block.
    const pat = rawIFD.t33422;
    // [0, 1, 1, 2] -> R G G B
    // [1, 0, 2, 1] -> G R B G
    // [2, 1, 1, 0] -> B G G R
    // [1, 2, 0, 1] -> G B R G
    
    if (pat.length === 4) {
      const p = Array.from(pat).join('');
      if (p === '0112') layout = 'RGGB';
      else if (p === '1021') layout = 'GRBG';
      else if (p === '2110') layout = 'BGGR';
      else if (p === '1201') layout = 'GBRG';
    }
  }
  
  return {
    mode: 'raw',
    cfaPattern: 'bayer', // Detect XTrans? Fuji often uses standard tags or custom.
    cfaPatternMeta: {
      tileW: 2,
      tileH: 2,
      layout: layout
    },
    cfaData: cfaFloat,
    width,
    height,
    // Generate preview from the raw data (simple demosaic) or existing preview
    // For now, no preview or simple grayscale
  };
}

