export type InputMode = 'lab' | 'synthetic' | 'raw';
export type CFAType = 'bayer' | 'xtrans' | 'foveon';
export type DemosaicAlgorithm = 
  | 'nearest' 
  | 'bilinear' 
  | 'malvar' 
  | 'high_quality' // placeholder for a better algo
  | 'custom'; // placeholder for user custom

export interface DemosaicParams {
  // General params
  noiseLevel?: number;
  
  // Bayer params
  greenBias?: number; // weight for G in some algos
  
  // X-Trans params
  colorSmoothing?: number;
  
  // Foveon params
  mixStrength?: number;
}

export interface PixelRGB {
  r: number;
  g: number;
  b: number;
}

export interface CFAPatternSample {
  x: number;
  y: number;
  channel: 'r' | 'g' | 'b' | 'e1' | 'e2'; // e1/e2 for emerald/other if needed, or just rgb
}

export interface PixelTraceStep {
  description: string;
  formula?: string;
  inputs: { label: string; value: number | PixelRGB }[];
  output: number | PixelRGB;
  weight?: number;
}

export interface ErrorStats {
  mse: { r: number; g: number; b: number; total: number };
  psnr: { r: number; g: number; b: number; total: number };
  mae: { r: number; g: number; b: number; total: number };
  ssim: number;
  l2Map?: Float32Array; // per-pixel L2 error
}

export interface DemosaicInput {
  mode: InputMode;
  groundTruthRGB?: ImageData; // Only for lab/synthetic
  
  cfaPattern: CFAType;
  cfaPatternMeta: {
    tileW: number;
    tileH: number;
    layout: string; // e.g. 'RGGB'
  };
  
  cfaData: Float32Array | Uint16Array; // Raw sensor values. Normalized 0-1 or 0-65535? Let's assume normalized 0-1 floats for internal processing simplicity, or keep raw. Float32 0-1 is easiest for math.
  width: number;
  height: number;
  
  referencePreviewRGB?: ImageData; // Optional preview from DNG
}

