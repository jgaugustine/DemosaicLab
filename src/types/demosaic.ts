export type InputMode = 'lab' | 'synthetic' | 'raw';
export type CFAType = 'bayer' | 'xtrans' | 'foveon';
export type DemosaicAlgorithm = 
  | 'nearest' 
  | 'bilinear' 
  | 'malvar' 
  | 'high_quality' // placeholder for a better algo
  | 'custom' // placeholder for user custom
  | 'niu_edge_sensing'
  | 'wu_polynomial'
  | 'lien_edge_based'
  | 'kiku_residual';

export interface DemosaicParams {
  // General params
  noiseLevel?: number;
  
  // Bayer params
  greenBias?: number; // weight for G in some algos
  
  // X-Trans params
  colorSmoothing?: number;
  
  // Foveon params
  mixStrength?: number;
  
  // Algorithm-specific params
  niuLogisticThreshold?: number; // threshold for edge detection (default: 0.1)
  niuLogisticSteepness?: number; // steepness parameter k for logistic function (default: 20.0)
  wuPolynomialDegree?: number; // polynomial degree (typically 2-3, default: 2)
  kikuResidualIterations?: number; // number of residual refinement iterations (default: 1)
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

