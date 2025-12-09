import { DemosaicInput, DemosaicParams, ErrorStats, PixelTraceStep, DemosaicAlgorithm } from '@/types/demosaic';
import { getBayerKernel, getXTransKernel } from './cfa';

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

// Helper to get channel function based on CFA pattern
const getChannelFunction = (input: DemosaicInput): (x: number, y: number) => 'r' | 'g' | 'b' => {
  if (input.cfaPattern === 'bayer') {
    return getBayerKernel(input.cfaPatternMeta.layout);
  } else if (input.cfaPattern === 'xtrans') {
    return getXTransKernel();
  }
  // Fallback (shouldn't happen for foveon in current implementation)
  return getBayerKernel('RGGB');
};

// Helper to safely get CFA value with mirror padding
const getCfaVal = (cfaData: Float32Array | Uint16Array, width: number, height: number, cx: number, cy: number) => {
  // Mirror padding for better edge handling
  let sx = cx; 
  if (sx < 0) sx = -sx; 
  else if (sx >= width) sx = 2*width - 2 - sx;
  
  let sy = cy; 
  if (sy < 0) sy = -sy; 
  else if (sy >= height) sy = 2*height - 2 - sy;
  
  // Clamp to bounds just in case mirror logic goes out for very small images
  sx = Math.max(0, Math.min(width - 1, sx));
  sy = Math.max(0, Math.min(height - 1, sy));
  
  return cfaData[sy * width + sx];
};

// Helper to collect neighbors of a specific color with expanding search radius
// Works for any CFA pattern by collecting all neighbors within maxRadius
const collectNeighbors = (
  cfaData: Float32Array | Uint16Array,
  width: number,
  height: number,
  x: number,
  y: number,
  targetColor: 'r' | 'g' | 'b',
  getChannel: (x: number, y: number) => 'r' | 'g' | 'b',
  maxRadius: number = 10
): { values: number[]; distances: number[] } => {
  const result: { values: number[]; distances: number[] } = { values: [], distances: [] };
  const val = (cx: number, cy: number) => getCfaVal(cfaData, width, height, cx, cy);
  
  // Collect all neighbors within maxRadius (using L-infinity norm for efficiency)
  for (let dy = -maxRadius; dy <= maxRadius; dy++) {
    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const ch = getChannel(x + dx, y + dy);
      if (ch === targetColor) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        result.values.push(val(x + dx, y + dy));
        result.distances.push(dist);
      }
    }
  }
  
  return result;
};

// Helper functions for advanced algorithms
const logisticFunction = (x: number, threshold: number = 0.1): number => {
  // Logistic function: 1 / (1 + exp(-k*(x - threshold)))
  // k controls steepness, threshold is the edge detection threshold
  // Make k adaptive based on threshold to ensure the function is sensitive to changes
  const k = 20.0 / Math.max(0.01, threshold); // Higher k for lower thresholds = more sensitive
  return 1.0 / (1.0 + Math.exp(-k * (x - threshold)));
};

const computeDirectionalVariations = (
  cfaData: Float32Array | Uint16Array,
  width: number,
  height: number,
  x: number,
  y: number,
  getChannel: (x: number, y: number) => 'r' | 'g' | 'b'
): { horizontal: number; vertical: number; diagonal1: number; diagonal2: number } => {
  const val = (cx: number, cy: number) => getCfaVal(cfaData, width, height, cx, cy);
  
  // Horizontal variation: |val(x+1,y) - val(x-1,y)|
  const hVar = Math.abs(val(x + 1, y) - val(x - 1, y));
  
  // Vertical variation: |val(x,y+1) - val(x,y-1)|
  const vVar = Math.abs(val(x, y + 1) - val(x, y - 1));
  
  // Diagonal variations
  const d1Var = Math.abs(val(x + 1, y + 1) - val(x - 1, y - 1));
  const d2Var = Math.abs(val(x + 1, y - 1) - val(x - 1, y + 1));
  
  return { horizontal: hVar, vertical: vVar, diagonal1: d1Var, diagonal2: d2Var };
};

const detectEdgeDirection = (
  cfaData: Float32Array | Uint16Array,
  width: number,
  height: number,
  x: number,
  y: number
): 'horizontal' | 'vertical' | 'diagonal1' | 'diagonal2' | 'none' => {
  const vars = computeDirectionalVariations(cfaData, width, height, x, y, () => 'g');
  
  const minVar = Math.min(vars.horizontal, vars.vertical, vars.diagonal1, vars.diagonal2);
  const threshold = 0.05;
  
  if (minVar > threshold) {
    // Strong edge detected, find direction with minimum variation (edge is along that direction)
    if (vars.horizontal === minVar) return 'horizontal';
    if (vars.vertical === minVar) return 'vertical';
    if (vars.diagonal1 === minVar) return 'diagonal1';
    if (vars.diagonal2 === minVar) return 'diagonal2';
  }
  
  return 'none';
};

const polynomialInterpolate = (
  values: number[],
  positions: number[],
  degree: number = 2
): number => {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  
  // For degree 1 (linear), use simple average
  if (degree === 1) {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  
  // For degree 2+, use distance-weighted interpolation with polynomial weighting
  // Higher degree = more emphasis on closer neighbors
  const weights = positions.map((p, i) => {
    const dist = Math.max(0.1, p); // Avoid division by zero
    // Higher degree means steeper falloff with distance
    // For degree 2: 1/(1+d^2), for degree 3: 1/(1+d^3), etc.
    return 1.0 / (1.0 + Math.pow(dist, degree));
  });
  
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW === 0) {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  
  return values.reduce((sum, v, i) => sum + v * weights[i], 0) / sumW;
};

const computeResiduals = (
  observed: Float32Array,
  estimated: Float32Array,
  width: number,
  height: number
): Float32Array => {
  const residuals = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    residuals[i] = observed[i] - estimated[i];
  }
  return residuals;
};

// ... Bayer implementations (keep existing) ...
// Nearest Neighbor - works for any CFA pattern
export const demosaicNearest = (input: DemosaicInput): ImageData => {
  const { width, height, cfaData } = input;
  const output = new ImageData(width, height);
  const getChannel = getChannelFunction(input);
  const val = (cx: number, cy: number) => getCfaVal(cfaData, width, height, cx, cy);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerVal = cfaData[y * width + x];
      const centerCh = getChannel(x, y);
      const idx = (y * width + x) * 4;
      
      let r = 0, g = 0, b = 0;
      
      if (centerCh === 'r') {
        r = centerVal;
        // Find nearest G and B with expanding search
        let foundG = false, foundB = false;
        for (let d = 1; d <= 10 && (!foundG || !foundB); d++) {
          for (let dy = -d; dy <= d && (!foundG || !foundB); dy++) {
            for (let dx = -d; dx <= d && (!foundG || !foundB); dx++) {
              if (dx === 0 && dy === 0) continue;
              const dist = Math.sqrt(dx * dx + dy * dy);
              // Only check pixels at current distance (not inner ones)
              if (dist > d - 1 && dist <= d) {
                const ch = getChannel(x + dx, y + dy);
                if (!foundG && ch === 'g') {
                  g = val(x + dx, y + dy);
                  foundG = true;
                }
                if (!foundB && ch === 'b') {
                  b = val(x + dx, y + dy);
                  foundB = true;
                }
              }
            }
          }
        }
      } else if (centerCh === 'b') {
        b = centerVal;
        // Find nearest G and R with expanding search
        let foundG = false, foundR = false;
        for (let d = 1; d <= 10 && (!foundG || !foundR); d++) {
          for (let dy = -d; dy <= d && (!foundG || !foundR); dy++) {
            for (let dx = -d; dx <= d && (!foundG || !foundR); dx++) {
              if (dx === 0 && dy === 0) continue;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > d - 1 && dist <= d) {
                const ch = getChannel(x + dx, y + dy);
                if (!foundG && ch === 'g') {
                  g = val(x + dx, y + dy);
                  foundG = true;
                }
                if (!foundR && ch === 'r') {
                  r = val(x + dx, y + dy);
                  foundR = true;
                }
              }
            }
          }
        }
      } else {
        // Green pixel
        g = centerVal;
        // Find nearest R and B with expanding search
        let foundR = false, foundB = false;
        for (let d = 1; d <= 10 && (!foundR || !foundB); d++) {
          for (let dy = -d; dy <= d && (!foundR || !foundB); dy++) {
            for (let dx = -d; dx <= d && (!foundR || !foundB); dx++) {
              if (dx === 0 && dy === 0) continue;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > d - 1 && dist <= d) {
                const ch = getChannel(x + dx, y + dy);
                if (!foundR && ch === 'r') {
                  r = val(x + dx, y + dy);
                  foundR = true;
                }
                if (!foundB && ch === 'b') {
                  b = val(x + dx, y + dy);
                  foundB = true;
                }
              }
            }
          }
        }
      }
      
      output.data[idx] = clamp(r);
      output.data[idx+1] = clamp(g);
      output.data[idx+2] = clamp(b);
      output.data[idx+3] = 255;
    }
  }
  return output;
};

// Bilinear Interpolation - works for any CFA pattern
export const demosaicBilinear = (input: DemosaicInput): ImageData => {
  const { width, height, cfaData } = input;
  const output = new ImageData(width, height);
  const getChannel = getChannelFunction(input);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerVal = cfaData[y * width + x];
      const centerCh = getChannel(x, y);
      const idx = (y * width + x) * 4;
      
      let r = 0, g = 0, b = 0;

      if (centerCh === 'g') {
        g = centerVal;
        
        // Collect neighbors with expanding search - USE RADIUS 1 FOR BILINEAR
        const rNeighbors = collectNeighbors(cfaData, width, height, x, y, 'r', getChannel, 1);
        const bNeighbors = collectNeighbors(cfaData, width, height, x, y, 'b', getChannel, 1);
        r = rNeighbors.values.length > 0 ? rNeighbors.values.reduce((a, b) => a + b, 0) / rNeighbors.values.length : 0;
        b = bNeighbors.values.length > 0 ? bNeighbors.values.reduce((a, b) => a + b, 0) / bNeighbors.values.length : 0;
      } else if (centerCh === 'r') {
        r = centerVal;
        
        // Collect neighbors with expanding search - USE RADIUS 1 FOR BILINEAR
        const gNeighbors = collectNeighbors(cfaData, width, height, x, y, 'g', getChannel, 1);
        const bNeighbors = collectNeighbors(cfaData, width, height, x, y, 'b', getChannel, 1);
        g = gNeighbors.values.length > 0 ? gNeighbors.values.reduce((a, b) => a + b, 0) / gNeighbors.values.length : 0;
        b = bNeighbors.values.length > 0 ? bNeighbors.values.reduce((a, b) => a + b, 0) / bNeighbors.values.length : 0;
      } else if (centerCh === 'b') {
        b = centerVal;
        
        // Collect neighbors with expanding search - USE RADIUS 1 FOR BILINEAR
        const gNeighbors = collectNeighbors(cfaData, width, height, x, y, 'g', getChannel, 1);
        const rNeighbors = collectNeighbors(cfaData, width, height, x, y, 'r', getChannel, 1);
        g = gNeighbors.values.length > 0 ? gNeighbors.values.reduce((a, b) => a + b, 0) / gNeighbors.values.length : 0;
        r = rNeighbors.values.length > 0 ? rNeighbors.values.reduce((a, b) => a + b, 0) / rNeighbors.values.length : 0;
      }
      
      output.data[idx] = clamp(r);
      output.data[idx+1] = clamp(g);
      output.data[idx+2] = clamp(b);
      output.data[idx+3] = 255;
    }
  }
  return output;
};

// Niu et al. (2018) - Low-cost Edge Sensing - works for any CFA pattern
export const demosaicNiuEdgeSensing = (input: DemosaicInput, params?: DemosaicParams): ImageData => {
  const { width, height, cfaData } = input;
  const output = new ImageData(width, height);
  const getChannel = getChannelFunction(input);
  const threshold = params?.niuLogisticThreshold ?? 0.1;
  const val = (cx: number, cy: number) => getCfaVal(cfaData, width, height, cx, cy);
  
  // First pass: Interpolate green channel with edge awareness
  const greenInterp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerCh = getChannel(x, y);
      const centerVal = cfaData[y * width + x];
      
      if (centerCh === 'g') {
        greenInterp[y * width + x] = centerVal;
      } else {
        // Use edge-aware interpolation for green at R/B pixels
        const vars = computeDirectionalVariations(cfaData, width, height, x, y, getChannel);
        const wH = logisticFunction(vars.horizontal, threshold);
        const wV = logisticFunction(vars.vertical, threshold);
        const sumW = wH + wV;
        const nH = (sumW > 0) ? (1.0 - wH / sumW) : 0.5;
        const nV = (sumW > 0) ? (1.0 - wV / sumW) : 0.5;
        
        // Get horizontal and vertical green neighbors
        const gH = (val(x - 1, y) + val(x + 1, y)) / 2;
        const gV = (val(x, y - 1) + val(x, y + 1)) / 2;
        
        greenInterp[y * width + x] = (gH * nH + gV * nV) / (nH + nV);
      }
    }
  }
  
  // Second pass: Interpolate R/B channels using color difference
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerCh = getChannel(x, y);
      const centerVal = cfaData[y * width + x];
      const idx = (y * width + x) * 4;
      
      let r = 0, g = 0, b = 0;
      
      if (centerCh === 'r') {
        r = centerVal;
        g = greenInterp[y * width + x];
        
        // Interpolate blue via color difference
        const bMinusG = [
          val(x - 1, y - 1) - greenInterp[(y - 1) * width + (x - 1)],
          val(x + 1, y - 1) - greenInterp[(y - 1) * width + (x + 1)],
          val(x - 1, y + 1) - greenInterp[(y + 1) * width + (x - 1)],
          val(x + 1, y + 1) - greenInterp[(y + 1) * width + (x + 1)]
        ];
        const avgBMinusG = bMinusG.reduce((a, b) => a + b, 0) / bMinusG.length;
        b = g + avgBMinusG;
      } else if (centerCh === 'b') {
        b = centerVal;
        g = greenInterp[y * width + x];
        
        // Interpolate red via color difference
        const rMinusG = [
          val(x - 1, y - 1) - greenInterp[(y - 1) * width + (x - 1)],
          val(x + 1, y - 1) - greenInterp[(y - 1) * width + (x + 1)],
          val(x - 1, y + 1) - greenInterp[(y + 1) * width + (x - 1)],
          val(x + 1, y + 1) - greenInterp[(y + 1) * width + (x + 1)]
        ];
        const avgRMinusG = rMinusG.reduce((a, b) => a + b, 0) / rMinusG.length;
        r = g + avgRMinusG;
      } else {
        // Green pixel
        g = centerVal;
        
        // Interpolate R/B based on row type
        const leftCh = getChannel(Math.max(0, x - 1), y);
        const isRedRow = (leftCh === 'r' || getChannel(Math.min(width - 1, x + 1), y) === 'r');
        
        if (isRedRow) {
          r = (val(x - 1, y) + val(x + 1, y)) / 2;
          b = (val(x, y - 1) + val(x, y + 1)) / 2;
        } else {
          r = (val(x, y - 1) + val(x, y + 1)) / 2;
          b = (val(x - 1, y) + val(x + 1, y)) / 2;
        }
      }
      
      output.data[idx] = clamp(r);
      output.data[idx + 1] = clamp(g);
      output.data[idx + 2] = clamp(b);
      output.data[idx + 3] = 255;
    }
  }
  
  return output;
};

// Lien et al. (2017) - Efficient Edge-Based Technique - works for any CFA pattern
export const demosaicLienEdgeBased = (input: DemosaicInput): ImageData => {
  const { width, height, cfaData } = input;
  const output = new ImageData(width, height);
  const getChannel = getChannelFunction(input);
  const val = (cx: number, cy: number) => getCfaVal(cfaData, width, height, cx, cy);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerCh = getChannel(x, y);
      const centerVal = cfaData[y * width + x];
      const idx = (y * width + x) * 4;
      
      let r = 0, g = 0, b = 0;
      
      if (centerCh === 'g') {
        g = centerVal;
        
        // Detect edge direction
        const diffH = Math.abs(val(x - 1, y) - val(x + 1, y));
        const diffV = Math.abs(val(x, y - 1) - val(x, y + 1));
        
        const leftCh = getChannel(Math.max(0, x - 1), y);
        const isRedRow = (leftCh === 'r' || getChannel(Math.min(width - 1, x + 1), y) === 'r');
        
        if (isRedRow) {
          if (diffH < diffV) {
            // Edge is horizontal, interpolate along horizontal
            r = (val(x - 1, y) + val(x + 1, y)) / 2;
            b = (val(x, y - 1) + val(x, y + 1)) / 2;
          } else {
            // Edge is vertical, interpolate along vertical
            r = (val(x, y - 1) + val(x, y + 1)) / 2;
            b = (val(x - 1, y) + val(x + 1, y)) / 2;
          }
        } else {
          if (diffH < diffV) {
            r = (val(x, y - 1) + val(x, y + 1)) / 2;
            b = (val(x - 1, y) + val(x + 1, y)) / 2;
          } else {
            r = (val(x - 1, y) + val(x + 1, y)) / 2;
            b = (val(x, y - 1) + val(x, y + 1)) / 2;
          }
        }
      } else if (centerCh === 'r') {
        r = centerVal;
        
        // Edge-aware green interpolation
        const diffH = Math.abs(val(x - 1, y) - val(x + 1, y));
        const diffV = Math.abs(val(x, y - 1) - val(x, y + 1));
        
        if (diffH < diffV) {
          // Edge is horizontal, use horizontal neighbors
          g = (val(x - 1, y) + val(x + 1, y)) / 2;
        } else {
          // Edge is vertical, use vertical neighbors
          g = (val(x, y - 1) + val(x, y + 1)) / 2;
        }
        
        // Interpolate blue via color difference
        const avgB = (val(x - 1, y - 1) + val(x + 1, y - 1) + val(x - 1, y + 1) + val(x + 1, y + 1)) / 4;
        const avgG = (val(x - 1, y) + val(x + 1, y) + val(x, y - 1) + val(x, y + 1)) / 4;
        b = avgB + (g - avgG);
      } else {
        // Blue pixel
        b = centerVal;
        
        // Edge-aware green interpolation
        const diffH = Math.abs(val(x - 1, y) - val(x + 1, y));
        const diffV = Math.abs(val(x, y - 1) - val(x, y + 1));
        
        if (diffH < diffV) {
          g = (val(x - 1, y) + val(x + 1, y)) / 2;
        } else {
          g = (val(x, y - 1) + val(x, y + 1)) / 2;
        }
        
        // Interpolate red via color difference
        const avgR = (val(x - 1, y - 1) + val(x + 1, y - 1) + val(x - 1, y + 1) + val(x + 1, y + 1)) / 4;
        const avgG = (val(x - 1, y) + val(x + 1, y) + val(x, y - 1) + val(x, y + 1)) / 4;
        r = avgR + (g - avgG);
      }
      
      output.data[idx] = clamp(r);
      output.data[idx + 1] = clamp(g);
      output.data[idx + 2] = clamp(b);
      output.data[idx + 3] = 255;
    }
  }
  
  return output;
};

// Wu et al. (2016) - Polynomial Interpolation - works for any CFA pattern
export const demosaicWuPolynomial = (input: DemosaicInput, params?: DemosaicParams): ImageData => {
  const { width, height, cfaData } = input;
  const output = new ImageData(width, height);
  const getChannel = getChannelFunction(input);
  const degree = params?.wuPolynomialDegree ?? 2;
  
  // First pass: Interpolate green channel
  const greenInterp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerCh = getChannel(x, y);
      const centerVal = cfaData[y * width + x];
      
      if (centerCh === 'g') {
        greenInterp[y * width + x] = centerVal;
      } else {
        // Use polynomial interpolation for green - expanding search
        const gNeighbors = collectNeighbors(cfaData, width, height, x, y, 'g', getChannel);
        if (gNeighbors.values.length > 0) {
          greenInterp[y * width + x] = polynomialInterpolate(gNeighbors.values, gNeighbors.distances, degree);
        } else {
          greenInterp[y * width + x] = centerVal;
        }
      }
    }
  }
  
  // Second pass: Interpolate R/B using polynomial interpolation
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerCh = getChannel(x, y);
      const centerVal = cfaData[y * width + x];
      const idx = (y * width + x) * 4;
      
      let r = 0, g = 0, b = 0;
      
      if (centerCh === 'r') {
        r = centerVal;
        g = greenInterp[y * width + x];
        
        // Use polynomial interpolation on all blue neighbors
        const bNeighbors = collectNeighbors(cfaData, width, height, x, y, 'b', getChannel);
        if (bNeighbors.values.length > 0) {
          b = polynomialInterpolate(bNeighbors.values, bNeighbors.distances, degree);
        } else {
          b = g;
        }
      } else if (centerCh === 'b') {
        b = centerVal;
        g = greenInterp[y * width + x];
        
        // Use polynomial interpolation on all red neighbors
        const rNeighbors = collectNeighbors(cfaData, width, height, x, y, 'r', getChannel);
        if (rNeighbors.values.length > 0) {
          r = polynomialInterpolate(rNeighbors.values, rNeighbors.distances, degree);
        } else {
          r = g;
        }
      } else {
        // Green pixel
        g = centerVal;
        
        // Use polynomial interpolation on all neighbors
        const rNeighbors = collectNeighbors(cfaData, width, height, x, y, 'r', getChannel);
        const bNeighbors = collectNeighbors(cfaData, width, height, x, y, 'b', getChannel);
        if (rNeighbors.values.length > 0) {
          r = polynomialInterpolate(rNeighbors.values, rNeighbors.distances, degree);
        }
        if (bNeighbors.values.length > 0) {
          b = polynomialInterpolate(bNeighbors.values, bNeighbors.distances, degree);
        }
      }
      
      output.data[idx] = clamp(r);
      output.data[idx + 1] = clamp(g);
      output.data[idx + 2] = clamp(b);
      output.data[idx + 3] = 255;
    }
  }
  
  return output;
};

// Helper to collect residual neighbors with expanding search
const collectResidualNeighbors = (
  residualArray: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  targetColor: 'r' | 'g' | 'b',
  getChannel: (x: number, y: number) => 'r' | 'g' | 'b',
  maxRadius: number = 10
): number[] => {
  const values: number[] = [];
  
  // Collect all neighbors within maxRadius
  for (let dy = -maxRadius; dy <= maxRadius; dy++) {
    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const idx2 = (y + dy) * width + (x + dx);
      if (idx2 >= 0 && idx2 < width * height && getChannel(x + dx, y + dy) === targetColor) {
        values.push(residualArray[idx2]);
      }
    }
  }
  
  return values;
};

// Kiku et al. (2016) - Residual Interpolation - works for any CFA pattern
export const demosaicKikuResidual = (input: DemosaicInput, params?: DemosaicParams): ImageData => {
  const { width, height, cfaData } = input;
  const iterations = params?.kikuResidualIterations ?? 1;
  const getChannel = getChannelFunction(input);
  
  const val = (cx: number, cy: number) => getCfaVal(cfaData, width, height, cx, cy);
  
  // Initial estimation using bilinear interpolation
  const initial = demosaicBilinear(input);
  
  // Convert initial estimate to Float32Array for processing
  const initialR = new Float32Array(width * height);
  const initialG = new Float32Array(width * height);
  const initialB = new Float32Array(width * height);
  
  for (let i = 0; i < width * height; i++) {
    initialR[i] = initial.data[i * 4] / 255.0;
    initialG[i] = initial.data[i * 4 + 1] / 255.0;
    initialB[i] = initial.data[i * 4 + 2] / 255.0;
  }
  
  // Refine estimates: initial + interpolated residuals (with iterations)
  // Initialize arrays for residual computation
  const residualR = new Float32Array(width * height);
  const residualG = new Float32Array(width * height);
  const residualB = new Float32Array(width * height);
  const interpolatedResidualR = new Float32Array(width * height);
  const interpolatedResidualG = new Float32Array(width * height);
  const interpolatedResidualB = new Float32Array(width * height);
  let currentR = new Float32Array(initialR);
  let currentG = new Float32Array(initialG);
  let currentB = new Float32Array(initialB);
  
  for (let iter = 0; iter < iterations; iter++) {
    // Compute residuals from current estimate
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const centerCh = getChannel(x, y);
        const centerVal = cfaData[y * width + x];
        const idx = y * width + x;
        
        if (centerCh === 'r') {
          residualR[idx] = centerVal - currentR[idx];
          residualG[idx] = 0;
          residualB[idx] = 0;
        } else if (centerCh === 'g') {
          residualR[idx] = 0;
          residualG[idx] = centerVal - currentG[idx];
          residualB[idx] = 0;
        } else {
          residualR[idx] = 0;
          residualG[idx] = 0;
          residualB[idx] = centerVal - currentB[idx];
        }
      }
    }
    
    // Interpolate residuals (reuse the same interpolation logic)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const centerCh = getChannel(x, y);
        const idx = y * width + x;
        
        if (centerCh === 'r') {
          interpolatedResidualR[idx] = residualR[idx];
          
          // Average all neighbors with expanding search
          const gVals = collectResidualNeighbors(residualG, width, height, x, y, 'g', getChannel);
          const bVals = collectResidualNeighbors(residualB, width, height, x, y, 'b', getChannel);
          interpolatedResidualG[idx] = gVals.length > 0 ? gVals.reduce((a, b) => a + b, 0) / gVals.length : 0;
          interpolatedResidualB[idx] = bVals.length > 0 ? bVals.reduce((a, b) => a + b, 0) / bVals.length : 0;
        } else if (centerCh === 'g') {
          interpolatedResidualG[idx] = residualG[idx];
          
          // Average all neighbors with expanding search
          const rVals = collectResidualNeighbors(residualR, width, height, x, y, 'r', getChannel);
          const bVals = collectResidualNeighbors(residualB, width, height, x, y, 'b', getChannel);
          interpolatedResidualR[idx] = rVals.length > 0 ? rVals.reduce((a, b) => a + b, 0) / rVals.length : 0;
          interpolatedResidualB[idx] = bVals.length > 0 ? bVals.reduce((a, b) => a + b, 0) / bVals.length : 0;
        } else {
          interpolatedResidualB[idx] = residualB[idx];
          
          // Average all neighbors with expanding search
          const gVals = collectResidualNeighbors(residualG, width, height, x, y, 'g', getChannel);
          const rVals = collectResidualNeighbors(residualR, width, height, x, y, 'r', getChannel);
          interpolatedResidualG[idx] = gVals.length > 0 ? gVals.reduce((a, b) => a + b, 0) / gVals.length : 0;
          interpolatedResidualR[idx] = rVals.length > 0 ? rVals.reduce((a, b) => a + b, 0) / rVals.length : 0;
        }
      }
    }
    
    // Update current estimate
    for (let i = 0; i < width * height; i++) {
      currentR[i] += interpolatedResidualR[i];
      currentG[i] += interpolatedResidualG[i];
      currentB[i] += interpolatedResidualB[i];
    }
  }
  
  // Final output
  const output = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const outIdx = (y * width + x) * 4;
      
      output.data[outIdx] = clamp(currentR[idx]);
      output.data[outIdx + 1] = clamp(currentG[idx]);
      output.data[outIdx + 2] = clamp(currentB[idx]);
      output.data[outIdx + 3] = 255;
    }
  }
  
  return output;
};

export const demosaicXTransBasic = (input: DemosaicInput): ImageData => {
  const { width, height, cfaData } = input;
  const output = new ImageData(width, height);
  const getChannel = getXTransKernel();
  const val = (cx: number, cy: number) => getCfaVal(cfaData, width, height, cx, cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const centerCh = getChannel(x, y);
      const centerVal = cfaData[y * width + x];

      let r = 0, g = 0, b = 0;
      
      if (centerCh === 'g') {
        g = centerVal;
        // Basic: average of available neighbors in 5x5
        let rSum = 0, rCnt = 0;
        let bSum = 0, bCnt = 0;
        // Scan 3x3 for fast approximation
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue;
            const ch = getChannel(x+dx, y+dy);
            const v = val(x+dx, y+dy);
            if (ch === 'r') { rSum += v; rCnt++; }
            if (ch === 'b') { bSum += v; bCnt++; }
          }
        }
        r = rCnt > 0 ? rSum / rCnt : 0;
        b = bCnt > 0 ? bSum / bCnt : 0;
      } else if (centerCh === 'r') {
        r = centerVal;
        let gSum = 0, gCnt = 0;
        // G is always adjacent in XTrans
        if (getChannel(x-1, y) === 'g') { gSum += val(x-1, y); gCnt++; }
        if (getChannel(x+1, y) === 'g') { gSum += val(x+1, y); gCnt++; }
        if (getChannel(x, y-1) === 'g') { gSum += val(x, y-1); gCnt++; }
        if (getChannel(x, y+1) === 'g') { gSum += val(x, y+1); gCnt++; }
        g = gCnt > 0 ? gSum / gCnt : 0;
        
        let bSum = 0, bCnt = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
             if (getChannel(x+dx, y+dy) === 'b') { bSum += val(x+dx, y+dy); bCnt++; }
          }
        }
        b = bCnt > 0 ? bSum / bCnt : 0;
      } else { // Blue
        b = centerVal;
        let gSum = 0, gCnt = 0;
        if (getChannel(x-1, y) === 'g') { gSum += val(x-1, y); gCnt++; }
        if (getChannel(x+1, y) === 'g') { gSum += val(x+1, y); gCnt++; }
        if (getChannel(x, y-1) === 'g') { gSum += val(x, y-1); gCnt++; }
        if (getChannel(x, y+1) === 'g') { gSum += val(x, y+1); gCnt++; }
        g = gCnt > 0 ? gSum / gCnt : 0;
        
        let rSum = 0, rCnt = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
             if (getChannel(x+dx, y+dy) === 'r') { rSum += val(x+dx, y+dy); rCnt++; }
          }
        }
        r = rCnt > 0 ? rSum / rCnt : 0;
      }
      
      output.data[idx] = clamp(r);
      output.data[idx+1] = clamp(g);
      output.data[idx+2] = clamp(b);
      output.data[idx+3] = 255;
    }
  }
  return output;
};

// X-Trans variants of the new algorithms
export const demosaicXTransNiuEdgeSensing = (input: DemosaicInput, params?: DemosaicParams): ImageData => {
  const { width, height, cfaData } = input;
  const output = new ImageData(width, height);
  const getChannel = getXTransKernel();
  const threshold = params?.niuLogisticThreshold ?? 0.1;
  
  const val = (cx: number, cy: number) => getCfaVal(cfaData, width, height, cx, cy);
  
  // First pass: Interpolate green channel
  const greenInterp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerCh = getChannel(x, y);
      const centerVal = cfaData[y * width + x];
      
      if (centerCh === 'g') {
        greenInterp[y * width + x] = centerVal;
      } else {
        // Use edge-aware interpolation for green
        const vars = computeDirectionalVariations(cfaData, width, height, x, y, getChannel);
        const wH = logisticFunction(vars.horizontal, threshold);
        const wV = logisticFunction(vars.vertical, threshold);
        const sumW = wH + wV;
        const nH = (sumW > 0) ? (1.0 - wH / sumW) : 0.5;
        const nV = (sumW > 0) ? (1.0 - wV / sumW) : 0.5;
        
        // Collect green neighbors
        let gSum = 0, gCnt = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (getChannel(x + dx, y + dy) === 'g') {
              gSum += val(x + dx, y + dy);
              gCnt++;
            }
          }
        }
        greenInterp[y * width + x] = gCnt > 0 ? gSum / gCnt : centerVal;
      }
    }
  }
  
  // Second pass: Interpolate R/B channels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerCh = getChannel(x, y);
      const centerVal = cfaData[y * width + x];
      const idx = (y * width + x) * 4;
      
      let r = 0, g = 0, b = 0;
      
      if (centerCh === 'r') {
        r = centerVal;
        g = greenInterp[y * width + x];
        
        // Interpolate blue
        let bSum = 0, bCnt = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (getChannel(x + dx, y + dy) === 'b') {
              bSum += val(x + dx, y + dy);
              bCnt++;
            }
          }
        }
        b = bCnt > 0 ? bSum / bCnt : g;
      } else if (centerCh === 'b') {
        b = centerVal;
        g = greenInterp[y * width + x];
        
        // Interpolate red
        let rSum = 0, rCnt = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (getChannel(x + dx, y + dy) === 'r') {
              rSum += val(x + dx, y + dy);
              rCnt++;
            }
          }
        }
        r = rCnt > 0 ? rSum / rCnt : g;
      } else {
        g = centerVal;
        
        // Interpolate R/B
        let rSum = 0, rCnt = 0, bSum = 0, bCnt = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue;
            const ch = getChannel(x + dx, y + dy);
            const v = val(x + dx, y + dy);
            if (ch === 'r') { rSum += v; rCnt++; }
            if (ch === 'b') { bSum += v; bCnt++; }
          }
        }
        r = rCnt > 0 ? rSum / rCnt : 0;
        b = bCnt > 0 ? bSum / bCnt : 0;
      }
      
      output.data[idx] = clamp(r);
      output.data[idx + 1] = clamp(g);
      output.data[idx + 2] = clamp(b);
      output.data[idx + 3] = 255;
    }
  }
  
  return output;
};

export const demosaicXTransLienEdgeBased = (input: DemosaicInput): ImageData => {
  const { width, height, cfaData } = input;
  const output = new ImageData(width, height);
  const getChannel = getXTransKernel();
  const val = (cx: number, cy: number) => getCfaVal(cfaData, width, height, cx, cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const centerCh = getChannel(x, y);
      const centerVal = cfaData[y * width + x];

      let r = 0, g = 0, b = 0;
      
      if (centerCh === 'g') {
        g = centerVal;
        // Detect edge direction
        const diffH = Math.abs(val(x - 1, y) - val(x + 1, y));
        const diffV = Math.abs(val(x, y - 1) - val(x, y + 1));
        
        // Interpolate R/B
        let rSum = 0, rCnt = 0, bSum = 0, bCnt = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue;
            const ch = getChannel(x + dx, y + dy);
            const v = val(x + dx, y + dy);
            if (ch === 'r') { rSum += v; rCnt++; }
            if (ch === 'b') { bSum += v; bCnt++; }
          }
        }
        r = rCnt > 0 ? rSum / rCnt : 0;
        b = bCnt > 0 ? bSum / bCnt : 0;
      } else if (centerCh === 'r') {
        r = centerVal;
        // Edge-aware green interpolation
        const diffH = Math.abs(val(x - 1, y) - val(x + 1, y));
        const diffV = Math.abs(val(x, y - 1) - val(x, y + 1));
        
        let gSum = 0, gCnt = 0;
        if (diffH < diffV) {
          if (getChannel(x - 1, y) === 'g') { gSum += val(x - 1, y); gCnt++; }
          if (getChannel(x + 1, y) === 'g') { gSum += val(x + 1, y); gCnt++; }
        } else {
          if (getChannel(x, y - 1) === 'g') { gSum += val(x, y - 1); gCnt++; }
          if (getChannel(x, y + 1) === 'g') { gSum += val(x, y + 1); gCnt++; }
        }
        g = gCnt > 0 ? gSum / gCnt : 0;
        
        // Interpolate blue
        let bSum = 0, bCnt = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (getChannel(x + dx, y + dy) === 'b') {
              bSum += val(x + dx, y + dy);
              bCnt++;
            }
          }
        }
        b = bCnt > 0 ? bSum / bCnt : g;
      } else {
        b = centerVal;
        // Edge-aware green interpolation
        const diffH = Math.abs(val(x - 1, y) - val(x + 1, y));
        const diffV = Math.abs(val(x, y - 1) - val(x, y + 1));
        
        let gSum = 0, gCnt = 0;
        if (diffH < diffV) {
          if (getChannel(x - 1, y) === 'g') { gSum += val(x - 1, y); gCnt++; }
          if (getChannel(x + 1, y) === 'g') { gSum += val(x + 1, y); gCnt++; }
        } else {
          if (getChannel(x, y - 1) === 'g') { gSum += val(x, y - 1); gCnt++; }
          if (getChannel(x, y + 1) === 'g') { gSum += val(x, y + 1); gCnt++; }
        }
        g = gCnt > 0 ? gSum / gCnt : 0;
        
        // Interpolate red
        let rSum = 0, rCnt = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (getChannel(x + dx, y + dy) === 'r') {
              rSum += val(x + dx, y + dy);
              rCnt++;
            }
          }
        }
        r = rCnt > 0 ? rSum / rCnt : g;
      }
      
      output.data[idx] = clamp(r);
      output.data[idx + 1] = clamp(g);
      output.data[idx + 2] = clamp(b);
      output.data[idx + 3] = 255;
    }
  }
  return output;
};

export const demosaicXTransWuPolynomial = (input: DemosaicInput, params?: DemosaicParams): ImageData => {
  const { width, height, cfaData } = input;
  const output = new ImageData(width, height);
  const getChannel = getXTransKernel();
  const degree = params?.wuPolynomialDegree ?? 2;
  const val = (cx: number, cy: number) => getCfaVal(cfaData, width, height, cx, cy);

  // First pass: Interpolate green
  const greenInterp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerCh = getChannel(x, y);
      const centerVal = cfaData[y * width + x];
      
      if (centerCh === 'g') {
        greenInterp[y * width + x] = centerVal;
      } else {
        // Use polynomial interpolation for green
        const neighbors: { v: number; d: number }[] = [];
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (getChannel(x + dx, y + dy) === 'g') {
              const dist = Math.sqrt(dx * dx + dy * dy);
              neighbors.push({ v: val(x + dx, y + dy), d: dist });
            }
          }
        }
        if (neighbors.length > 0) {
          const values = neighbors.map(n => n.v);
          const positions = neighbors.map(n => n.d);
          greenInterp[y * width + x] = polynomialInterpolate(values, positions, degree);
        } else {
          greenInterp[y * width + x] = centerVal;
        }
      }
    }
  }
  
  // Second pass: Interpolate R/B with edge classification
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerCh = getChannel(x, y);
      const centerVal = cfaData[y * width + x];
      const idx = (y * width + x) * 4;
      
      let r = 0, g = 0, b = 0;
      
      if (centerCh === 'r') {
        r = centerVal;
        g = greenInterp[y * width + x];
        
        // Classify edge
        const colorDiffH = Math.abs(val(x - 1, y) - val(x + 1, y));
        const colorDiffV = Math.abs(val(x, y - 1) - val(x, y + 1));
        
        // Interpolate blue using polynomial
        const bNeighbors: { v: number; d: number }[] = [];
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (getChannel(x + dx, y + dy) === 'b') {
              const dist = Math.sqrt(dx * dx + dy * dy);
              bNeighbors.push({ v: val(x + dx, y + dy), d: dist });
            }
          }
        }
        if (bNeighbors.length > 0) {
          const bValues = bNeighbors.map(n => n.v);
          const bPositions = bNeighbors.map(n => n.d);
          b = polynomialInterpolate(bValues, bPositions, degree);
        } else {
          b = g;
        }
      } else if (centerCh === 'b') {
        b = centerVal;
        g = greenInterp[y * width + x];
        
        // Interpolate red using polynomial
        const rNeighbors: { v: number; d: number }[] = [];
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (getChannel(x + dx, y + dy) === 'r') {
              const dist = Math.sqrt(dx * dx + dy * dy);
              rNeighbors.push({ v: val(x + dx, y + dy), d: dist });
            }
          }
        }
        if (rNeighbors.length > 0) {
          const rValues = rNeighbors.map(n => n.v);
          const rPositions = rNeighbors.map(n => n.d);
          r = polynomialInterpolate(rValues, rPositions, degree);
        } else {
          r = g;
        }
      } else {
        g = centerVal;
        
        // Interpolate R/B using polynomial
        const rNeighbors: { v: number; d: number }[] = [];
        const bNeighbors: { v: number; d: number }[] = [];
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue;
            const ch = getChannel(x + dx, y + dy);
            const v = val(x + dx, y + dy);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (ch === 'r') { rNeighbors.push({ v, d: dist }); }
            if (ch === 'b') { bNeighbors.push({ v, d: dist }); }
          }
        }
        if (rNeighbors.length > 0) {
          const rValues = rNeighbors.map(n => n.v);
          const rPositions = rNeighbors.map(n => n.d);
          r = polynomialInterpolate(rValues, rPositions, degree);
        } else {
          r = 0;
        }
        if (bNeighbors.length > 0) {
          const bValues = bNeighbors.map(n => n.v);
          const bPositions = bNeighbors.map(n => n.d);
          b = polynomialInterpolate(bValues, bPositions, degree);
        } else {
          b = 0;
        }
      }
      
      output.data[idx] = clamp(r);
      output.data[idx + 1] = clamp(g);
      output.data[idx + 2] = clamp(b);
      output.data[idx + 3] = 255;
    }
  }
  return output;
};

export const demosaicXTransKikuResidual = (input: DemosaicInput, params?: DemosaicParams): ImageData => {
  const { width, height, cfaData } = input;
  const iterations = params?.kikuResidualIterations ?? 1;
  const getChannel = getXTransKernel();
  
  // Initial estimation using basic X-Trans
  const initial = demosaicXTransBasic(input);
  
  // Convert to Float32Array
  const initialR = new Float32Array(width * height);
  const initialG = new Float32Array(width * height);
  const initialB = new Float32Array(width * height);
  
  for (let i = 0; i < width * height; i++) {
    initialR[i] = initial.data[i * 4] / 255.0;
    initialG[i] = initial.data[i * 4 + 1] / 255.0;
    initialB[i] = initial.data[i * 4 + 2] / 255.0;
  }
  
  // Refine estimates with iterations
  let currentR = new Float32Array(initialR);
  let currentG = new Float32Array(initialG);
  let currentB = new Float32Array(initialB);
  
  const residualR = new Float32Array(width * height);
  const residualG = new Float32Array(width * height);
  const residualB = new Float32Array(width * height);
  const interpolatedResidualR = new Float32Array(width * height);
  const interpolatedResidualG = new Float32Array(width * height);
  const interpolatedResidualB = new Float32Array(width * height);
  
  const val = (cx: number, cy: number) => getCfaVal(cfaData, width, height, cx, cy);
  
  for (let iter = 0; iter < iterations; iter++) {
    // Compute residuals from current estimate
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const centerCh = getChannel(x, y);
        const centerVal = cfaData[y * width + x];
        const idx = y * width + x;
        
        if (centerCh === 'r') {
          residualR[idx] = centerVal - currentR[idx];
          residualG[idx] = 0;
          residualB[idx] = 0;
        } else if (centerCh === 'g') {
          residualR[idx] = 0;
          residualG[idx] = centerVal - currentG[idx];
          residualB[idx] = 0;
        } else {
          residualR[idx] = 0;
          residualG[idx] = 0;
          residualB[idx] = centerVal - currentB[idx];
        }
      }
    }
    
    // Interpolate residuals
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const centerCh = getChannel(x, y);
        const idx = y * width + x;
        
        if (centerCh === 'r') {
          interpolatedResidualR[idx] = residualR[idx];
          // Interpolate G and B residuals
          let gSum = 0, gCnt = 0, bSum = 0, bCnt = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dy === 0) continue;
              const ch = getChannel(x + dx, y + dy);
              if (ch === 'g') { gSum += residualG[(y + dy) * width + (x + dx)]; gCnt++; }
              if (ch === 'b') { bSum += residualB[(y + dy) * width + (x + dx)]; bCnt++; }
            }
          }
          interpolatedResidualG[idx] = gCnt > 0 ? gSum / gCnt : 0;
          interpolatedResidualB[idx] = bCnt > 0 ? bSum / bCnt : 0;
        } else if (centerCh === 'g') {
          interpolatedResidualG[idx] = residualG[idx];
          // Interpolate R and B residuals
          let rSum = 0, rCnt = 0, bSum = 0, bCnt = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dy === 0) continue;
              const ch = getChannel(x + dx, y + dy);
              if (ch === 'r') { rSum += residualR[(y + dy) * width + (x + dx)]; rCnt++; }
              if (ch === 'b') { bSum += residualB[(y + dy) * width + (x + dx)]; bCnt++; }
            }
          }
          interpolatedResidualR[idx] = rCnt > 0 ? rSum / rCnt : 0;
          interpolatedResidualB[idx] = bCnt > 0 ? bSum / bCnt : 0;
        } else {
          interpolatedResidualB[idx] = residualB[idx];
          // Interpolate R and G residuals
          let rSum = 0, rCnt = 0, gSum = 0, gCnt = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dy === 0) continue;
              const ch = getChannel(x + dx, y + dy);
              if (ch === 'r') { rSum += residualR[(y + dy) * width + (x + dx)]; rCnt++; }
              if (ch === 'g') { gSum += residualG[(y + dy) * width + (x + dx)]; gCnt++; }
            }
          }
          interpolatedResidualR[idx] = rCnt > 0 ? rSum / rCnt : 0;
          interpolatedResidualG[idx] = gCnt > 0 ? gSum / gCnt : 0;
        }
      }
    }
    
    // Update current estimate
    for (let i = 0; i < width * height; i++) {
      currentR[i] += interpolatedResidualR[i];
      currentG[i] += interpolatedResidualG[i];
      currentB[i] += interpolatedResidualB[i];
    }
  }
  
  // Final output
  const output = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const outIdx = (y * width + x) * 4;
      
      output.data[outIdx] = clamp(currentR[idx]);
      output.data[outIdx + 1] = clamp(currentG[idx]);
      output.data[outIdx + 2] = clamp(currentB[idx]);
      output.data[outIdx + 3] = 255;
    }
  }
  
  return output;
};

export const getPixelTrace = (
  input: DemosaicInput,
  x: number,
  y: number,
  algorithm: DemosaicAlgorithm
): PixelTraceStep[] => {
  const { width, height, cfaData, cfaPatternMeta, cfaPattern } = input;
  const steps: PixelTraceStep[] = [];
  
  if (x < 0 || x >= width || y < 0 || y >= height) return steps;
  
  let getChannel = getBayerKernel(cfaPatternMeta.layout);
  if (cfaPattern === 'xtrans') getChannel = getXTransKernel();
  
  const centerCh = getChannel(x, y);
  const centerVal = cfaData[y * width + x];
  const val = (cx: number, cy: number) => getCfaVal(cfaData, width, height, cx, cy);
  
  steps.push({
    description: `Raw Sensor Sample (${centerCh.toUpperCase()})`,
    formula: `I_{sensor} = ${centerCh.toUpperCase()}_{${x},${y}}`,
    inputs: [],
    output: centerVal
  });

  if (cfaPattern === 'bayer') {
    // ... (Keep Bayer logic) ...
    if (algorithm === 'nearest') {
       let r = 0, g = 0, b = 0;
       const inputs: {label: string, value: number}[] = [];
       
       if (centerCh === 'r') {
          r = centerVal;
          const gVal = val(x+1, y);
          const bVal = val(x+1, y+1);
          g = gVal; b = bVal;
          inputs.push({ label: "G(x+1,y)", value: gVal });
          inputs.push({ label: "B(x+1,y+1)", value: bVal });
       } else if (centerCh === 'b') {
          b = centerVal;
          const gVal = val(x-1, y);
          const rVal = val(x-1, y-1);
          g = gVal; r = rVal;
          inputs.push({ label: "G(x-1,y)", value: gVal });
          inputs.push({ label: "R(x-1,y-1)", value: rVal });
       } else {
          g = centerVal;
          const leftCh = getBayerKernel(cfaPatternMeta.layout)(Math.max(0, x-1), y);
          if (leftCh === 'r' || getBayerKernel(cfaPatternMeta.layout)(Math.min(width-1, x+1), y) === 'r') {
               const rVal = val(x+1, y);
               const bVal = val(x, y+1);
               r = rVal; b = bVal;
               inputs.push({ label: "R(x+1,y)", value: rVal });
               inputs.push({ label: "B(x,y+1)", value: bVal });
          } else {
               const bVal = val(x+1, y);
               const rVal = val(x, y+1);
               b = bVal; r = rVal;
               inputs.push({ label: "B(x+1,y)", value: bVal });
               inputs.push({ label: "R(x,y+1)", value: rVal });
          }
       }
       steps.push({ description: "Nearest Neighbor Copy", formula: "\\hat{C} = C_{nearest}", inputs, output: {r,g,b} });

    } else if (algorithm === 'bilinear') {
       let r = 0, g = 0, b = 0;
       
       if (centerCh === 'g') {
          g = centerVal;
          const leftCh = getChannel(Math.max(0, x-1), y);
          const isRedRow = (leftCh === 'r' || getChannel(Math.min(width-1, x+1), y) === 'r');
          if (isRedRow) {
             const r1 = val(x-1, y), r2 = val(x+1, y);
             const b1 = val(x, y-1), b2 = val(x, y+1);
             r = (r1+r2)/2; b = (b1+b2)/2;
             steps.push({ description: "Interp Red (Horizontal)", formula: "\\hat{R} = \\frac{R_{x-1} + R_{x+1}}{2}", inputs: [{label:"R_l", value:r1},{label:"R_r",value:r2}], output: r });
             steps.push({ description: "Interp Blue (Vertical)", formula: "\\hat{B} = \\frac{B_{y-1} + B_{y+1}}{2}", inputs: [{label:"B_u", value:b1},{label:"B_d",value:b2}], output: b });
          } else {
             const r1 = val(x, y-1), r2 = val(x, y+1);
             const b1 = val(x-1, y), b2 = val(x+1, y);
             r = (r1+r2)/2; b = (b1+b2)/2;
             steps.push({ description: "Interp Red (Vertical)", formula: "\\hat{R} = \\frac{R_{y-1} + R_{y+1}}{2}", inputs: [{label:"R_u", value:r1},{label:"R_d",value:r2}], output: r });
             steps.push({ description: "Interp Blue (Horizontal)", formula: "\\hat{B} = \\frac{B_{x-1} + B_{x+1}}{2}", inputs: [{label:"B_l", value:b1},{label:"B_r",value:b2}], output: b });
          }
       } else if (centerCh === 'r') {
          r = centerVal;
          const g1 = val(x-1, y), g2 = val(x+1, y), g3 = val(x, y-1), g4 = val(x, y+1);
          g = (g1+g2+g3+g4)/4;
          steps.push({ description: "Interp Green (Cross)", formula: "\\hat{G} = \\frac{1}{4} \\sum_{i \\in \\mathcal{N}_4} G_i", inputs: [{label:"G_l", value:g1}, {label:"G_r", value:g2}, {label:"G_u", value:g3}, {label:"G_d", value:g4}], output: g });
          const b1 = val(x-1, y-1), b2 = val(x+1, y-1), b3 = val(x-1, y+1), b4 = val(x+1, y+1);
          b = (b1+b2+b3+b4)/4;
          steps.push({ description: "Interp Blue (Corners)", formula: "\\hat{B} = \\frac{1}{4} \\sum_{j \\in \\mathcal{Corners}} B_j", inputs: [{label:"B_nw", value:b1}, {label:"B_ne", value:b2}, {label:"B_sw", value:b3}, {label:"B_se", value:b4}], output: b });
       } else {
          b = centerVal;
          const g1 = val(x-1, y), g2 = val(x+1, y), g3 = val(x, y-1), g4 = val(x, y+1);
          g = (g1+g2+g3+g4)/4;
          steps.push({ description: "Interp Green (Cross)", formula: "\\hat{G} = \\frac{1}{4} \\sum_{i \\in \\mathcal{N}_4} G_i", inputs: [{label:"G_l", value:g1}, {label:"G_r", value:g2}, {label:"G_u", value:g3}, {label:"G_d", value:g4}], output: g });
          const r1 = val(x-1, y-1), r2 = val(x+1, y-1), r3 = val(x-1, y+1), r4 = val(x+1, y+1);
          r = (r1+r2+r3+r4)/4;
          steps.push({ description: "Interp Red (Corners)", formula: "\\hat{R} = \\frac{1}{4} \\sum_{j \\in \\mathcal{Corners}} R_j", inputs: [{label:"R_nw", value:r1}, {label:"R_ne", value:r2}, {label:"R_sw", value:r3}, {label:"R_se", value:r4}], output: r });
       }
       steps.push({ description: "Combine Channels", inputs: [], output: {r,g,b} });
    } else if (algorithm === 'niu_edge_sensing') {
       // Niu et al. edge sensing trace
       let r = 0, g = 0, b = 0;
       
       if (centerCh === 'g') {
          g = centerVal;
          const leftCh = getChannel(Math.max(0, x-1), y);
          if (leftCh === 'r' || getChannel(Math.min(width-1, x+1), y) === 'r') {
             r = (val(x-1, y) + val(x+1, y)) / 2;
             b = (val(x, y-1) + val(x, y+1)) / 2;
          } else {
             r = (val(x, y-1) + val(x, y+1)) / 2;
             b = (val(x-1, y) + val(x+1, y)) / 2;
          }
          steps.push({ description: "Green at G pixel", formula: "G = I_{sensor}", inputs: [], output: g });
          steps.push({ description: "Interpolate R/B", inputs: [], output: {r,g,b} });
       } else {
          const vars = computeDirectionalVariations(cfaData, width, height, x, y, getChannel);
          const threshold = 0.1;
          const wH = logisticFunction(vars.horizontal, threshold);
          const wV = logisticFunction(vars.vertical, threshold);
          
          steps.push({ 
            description: "Compute Directional Variations", 
            formula: "\\Delta_H = |I_{x+1} - I_{x-1}|, \\Delta_V = |I_{y+1} - I_{y-1}|",
            inputs: [
              {label: "Horizontal", value: vars.horizontal},
              {label: "Vertical", value: vars.vertical}
            ],
            output: vars.horizontal + vars.vertical
          });
          
          steps.push({
            description: "Apply Logistic Function",
            formula: "w = \\frac{1}{1 + e^{-k(\\Delta - \\theta)}}",
            inputs: [
              {label: "w_H", value: wH},
              {label: "w_V", value: wV}
            ],
            output: (wH + wV) / 2
          });
          
          if (centerCh === 'r') {
             r = centerVal;
             const gH = (val(x-1, y) + val(x+1, y)) / 2;
             const gV = (val(x, y-1) + val(x, y+1)) / 2;
             const sumW = wH + wV;
             const nH = sumW > 0 ? (1.0 - wH / sumW) : 0.5;
             const nV = sumW > 0 ? (1.0 - wV / sumW) : 0.5;
             g = (gH * nH + gV * nV) / (nH + nV);
             
             steps.push({
               description: "Edge-Aware Green Interpolation",
               formula: "\\hat{G} = \\frac{G_H w_H + G_V w_V}{w_H + w_V}",
               inputs: [
                 {label: "G_H", value: gH},
                 {label: "G_V", value: gV},
                 {label: "w_H", value: nH},
                 {label: "w_V", value: nV}
               ],
               output: g
             });
             
             const bMinusG = [
               val(x-1, y-1) - g,
               val(x+1, y-1) - g,
               val(x-1, y+1) - g,
               val(x+1, y+1) - g
             ];
             const avgBMinusG = bMinusG.reduce((a, b) => a + b, 0) / bMinusG.length;
             b = g + avgBMinusG;
             
             steps.push({
               description: "Interpolate Blue via Color Difference",
               formula: "\\hat{B} = \\hat{G} + \\overline{(B-G)}",
               inputs: [
                 {label: "B-G avg", value: avgBMinusG}
               ],
               output: b
             });
          } else {
             b = centerVal;
             const gH = (val(x-1, y) + val(x+1, y)) / 2;
             const gV = (val(x, y-1) + val(x, y+1)) / 2;
             const sumW = wH + wV;
             const nH = sumW > 0 ? (1.0 - wH / sumW) : 0.5;
             const nV = sumW > 0 ? (1.0 - wV / sumW) : 0.5;
             g = (gH * nH + gV * nV) / (nH + nV);
             
             steps.push({
               description: "Edge-Aware Green Interpolation",
               formula: "\\hat{G} = \\frac{G_H w_H + G_V w_V}{w_H + w_V}",
               inputs: [
                 {label: "G_H", value: gH},
                 {label: "G_V", value: gV}
               ],
               output: g
             });
             
             const rMinusG = [
               val(x-1, y-1) - g,
               val(x+1, y-1) - g,
               val(x-1, y+1) - g,
               val(x+1, y+1) - g
             ];
             const avgRMinusG = rMinusG.reduce((a, b) => a + b, 0) / rMinusG.length;
             r = g + avgRMinusG;
             
             steps.push({
               description: "Interpolate Red via Color Difference",
               formula: "\\hat{R} = \\hat{G} + \\overline{(R-G)}",
               inputs: [
                 {label: "R-G avg", value: avgRMinusG}
               ],
               output: r
             });
          }
          steps.push({ description: "Combine Channels", inputs: [], output: {r,g,b} });
       }
    } else if (algorithm === 'lien_edge_based') {
       // Lien et al. edge-based trace
       let r = 0, g = 0, b = 0;
       
       if (centerCh === 'g') {
          g = centerVal;
          const diffH = Math.abs(val(x-1, y) - val(x+1, y));
          const diffV = Math.abs(val(x, y-1) - val(x, y+1));
          
          steps.push({
            description: "Detect Edge Direction",
            formula: "\\Delta_H = |I_{x-1} - I_{x+1}|, \\Delta_V = |I_{y-1} - I_{y+1}|",
            inputs: [
              {label: "Horizontal diff", value: diffH},
              {label: "Vertical diff", value: diffV}
            ],
            output: diffH < diffV ? 'horizontal' : 'vertical'
          });
          
          const leftCh = getChannel(Math.max(0, x-1), y);
          if (leftCh === 'r' || getChannel(Math.min(width-1, x+1), y) === 'r') {
             if (diffH < diffV) {
                r = (val(x-1, y) + val(x+1, y)) / 2;
                b = (val(x, y-1) + val(x, y+1)) / 2;
             } else {
                r = (val(x, y-1) + val(x, y+1)) / 2;
                b = (val(x-1, y) + val(x+1, y)) / 2;
             }
          } else {
             if (diffH < diffV) {
                r = (val(x, y-1) + val(x, y+1)) / 2;
                b = (val(x-1, y) + val(x+1, y)) / 2;
             } else {
                r = (val(x-1, y) + val(x+1, y)) / 2;
                b = (val(x, y-1) + val(x, y+1)) / 2;
             }
          }
          steps.push({ description: "Edge-Guided Interpolation", inputs: [], output: {r,g,b} });
       } else if (centerCh === 'r') {
          r = centerVal;
          const diffH = Math.abs(val(x-1, y) - val(x+1, y));
          const diffV = Math.abs(val(x, y-1) - val(x, y+1));
          
          if (diffH < diffV) {
             g = (val(x-1, y) + val(x+1, y)) / 2;
          } else {
             g = (val(x, y-1) + val(x, y+1)) / 2;
          }
          
          steps.push({
            description: "Edge-Aware Green Interpolation",
            formula: diffH < diffV ? "\\hat{G} = \\frac{G_{x-1} + G_{x+1}}{2}" : "\\hat{G} = \\frac{G_{y-1} + G_{y+1}}{2}",
            inputs: [],
            output: g
          });
          
          const avgB = (val(x-1, y-1) + val(x+1, y-1) + val(x-1, y+1) + val(x+1, y+1)) / 4;
          const avgG = (val(x-1, y) + val(x+1, y) + val(x, y-1) + val(x, y+1)) / 4;
          b = avgB + (g - avgG);
          
          steps.push({
            description: "Interpolate Blue via Color Difference",
            formula: "\\hat{B} = \\bar{B} + (\\hat{G} - \\bar{G})",
            inputs: [],
            output: b
          });
          steps.push({ description: "Combine Channels", inputs: [], output: {r,g,b} });
       } else {
          b = centerVal;
          const diffH = Math.abs(val(x-1, y) - val(x+1, y));
          const diffV = Math.abs(val(x, y-1) - val(x, y+1));
          
          if (diffH < diffV) {
             g = (val(x-1, y) + val(x+1, y)) / 2;
          } else {
             g = (val(x, y-1) + val(x, y+1)) / 2;
          }
          
          steps.push({
            description: "Edge-Aware Green Interpolation",
            formula: diffH < diffV ? "\\hat{G} = \\frac{G_{x-1} + G_{x+1}}{2}" : "\\hat{G} = \\frac{G_{y-1} + G_{y+1}}{2}",
            inputs: [],
            output: g
          });
          
          const avgR = (val(x-1, y-1) + val(x+1, y-1) + val(x-1, y+1) + val(x+1, y+1)) / 4;
          const avgG = (val(x-1, y) + val(x+1, y) + val(x, y-1) + val(x, y+1)) / 4;
          r = avgR + (g - avgG);
          
          steps.push({
            description: "Interpolate Red via Color Difference",
            formula: "\\hat{R} = \\bar{R} + (\\hat{G} - \\bar{G})",
            inputs: [],
            output: r
          });
          steps.push({ description: "Combine Channels", inputs: [], output: {r,g,b} });
       }
    } else if (algorithm === 'wu_polynomial') {
       // Wu et al. polynomial interpolation trace
       let r = 0, g = 0, b = 0;
       
       if (centerCh === 'g') {
          g = centerVal;
          const leftCh = getChannel(Math.max(0, x-1), y);
          if (leftCh === 'r' || getChannel(Math.min(width-1, x+1), y) === 'r') {
             r = (val(x-1, y) + val(x+1, y)) / 2;
             b = (val(x, y-1) + val(x, y+1)) / 2;
          } else {
             r = (val(x, y-1) + val(x, y+1)) / 2;
             b = (val(x-1, y) + val(x+1, y)) / 2;
          }
          steps.push({
            description: "Polynomial Interpolation for R/B",
            formula: "\\hat{C} = P_2(\\mathcal{N})",
            inputs: [],
            output: {r,g,b}
          });
       } else if (centerCh === 'r') {
          r = centerVal;
          const neighbors = [val(x-1, y), val(x+1, y), val(x, y-1), val(x, y+1)];
          g = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
          
          steps.push({
            description: "Polynomial Green Interpolation",
            formula: "\\hat{G} = P_2(G_{neighbors})",
            inputs: neighbors.map((v, i) => ({label: `G_${i}`, value: v})),
            output: g
          });
          
          const colorDiffH = Math.abs(val(x-1, y) - val(x+1, y));
          const colorDiffV = Math.abs(val(x, y-1) - val(x, y+1));
          
          steps.push({
            description: "Edge Classification",
            formula: "\\text{edge} = \\arg\\min(\\Delta_H, \\Delta_V)",
            inputs: [
              {label: "Horizontal", value: colorDiffH},
              {label: "Vertical", value: colorDiffV}
            ],
            output: colorDiffH < colorDiffV ? 'horizontal' : 'vertical'
          });
          
          const bVals = [val(x-1, y-1), val(x+1, y-1), val(x-1, y+1), val(x+1, y+1)];
          const avgBMinusG = bVals.map(bv => bv - g).reduce((a, b) => a + b, 0) / bVals.length;
          b = g + avgBMinusG;
          
          steps.push({
            description: "Refined Blue via Color Difference",
            formula: "\\hat{B} = \\hat{G} + \\overline{(B-G)}",
            inputs: [
              {label: "B-G avg", value: avgBMinusG}
            ],
            output: b
          });
          steps.push({ description: "Combine Channels", inputs: [], output: {r,g,b} });
       } else {
          b = centerVal;
          const neighbors = [val(x-1, y), val(x+1, y), val(x, y-1), val(x, y+1)];
          g = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
          
          steps.push({
            description: "Polynomial Green Interpolation",
            formula: "\\hat{G} = P_2(G_{neighbors})",
            inputs: neighbors.map((v, i) => ({label: `G_${i}`, value: v})),
            output: g
          });
          
          const rVals = [val(x-1, y-1), val(x+1, y-1), val(x-1, y+1), val(x+1, y+1)];
          const avgRMinusG = rVals.map(rv => rv - g).reduce((a, b) => a + b, 0) / rVals.length;
          r = g + avgRMinusG;
          
          steps.push({
            description: "Refined Red via Color Difference",
            formula: "\\hat{R} = \\hat{G} + \\overline{(R-G)}",
            inputs: [
              {label: "R-G avg", value: avgRMinusG}
            ],
            output: r
          });
          steps.push({ description: "Combine Channels", inputs: [], output: {r,g,b} });
       }
    } else if (algorithm === 'kiku_residual') {
       // Kiku et al. residual interpolation trace
       steps.push({
         description: "Initial Bilinear Estimation",
         formula: "\\hat{I}_0 = \\text{Bilinear}(M)",
         inputs: [],
         output: "Initial estimate"
       });
       
       let r = 0, g = 0, b = 0;
       
       if (centerCh === 'r') {
          r = centerVal;
          const initialG = (val(x-1, y) + val(x+1, y) + val(x, y-1) + val(x, y+1)) / 4;
          // For R pixel, we need to estimate initial G, then compute residual
          const initialR = centerVal;
          const residualR = 0; // Observed - initial = centerVal - centerVal = 0
          
          steps.push({
            description: "Initial Green Estimate",
            formula: "\\hat{G}_0 = \\frac{1}{4}\\sum G_{neighbors}",
            inputs: [
              {label: "G neighbors", value: initialG}
            ],
            output: initialG
          });
          
          // Interpolate green residual from neighboring green pixels
          const residualGInterp = (
            (val(x-1, y) - initialG) +
            (val(x+1, y) - initialG) +
            (val(x, y-1) - initialG) +
            (val(x, y+1) - initialG)
          ) / 4;
          g = initialG + residualGInterp;
          
          steps.push({
            description: "Interpolate Residual",
            formula: "\\hat{R}_{interp} = \\text{Interp}(R_{neighbors})",
            inputs: [],
            output: residualGInterp
          });
          
          steps.push({
            description: "Refined Estimate",
            formula: "\\hat{G} = \\hat{G}_0 + \\hat{R}_{interp}",
            inputs: [
              {label: "Initial", value: initialG},
              {label: "Residual", value: residualGInterp}
            ],
            output: g
          });
          
          const bMinusG = [
            val(x-1, y-1) - g,
            val(x+1, y-1) - g,
            val(x-1, y+1) - g,
            val(x+1, y+1) - g
          ];
          b = g + bMinusG.reduce((a, b) => a + b, 0) / bMinusG.length;
          steps.push({ description: "Interpolate Blue", inputs: [], output: b });
          steps.push({ description: "Combine Channels", inputs: [], output: {r,g,b} });
       } else if (centerCh === 'g') {
          g = centerVal;
          const leftCh = getChannel(Math.max(0, x-1), y);
          if (leftCh === 'r' || getChannel(Math.min(width-1, x+1), y) === 'r') {
             r = (val(x-1, y) + val(x+1, y)) / 2;
             b = (val(x, y-1) + val(x, y+1)) / 2;
          } else {
             r = (val(x, y-1) + val(x, y+1)) / 2;
             b = (val(x-1, y) + val(x+1, y)) / 2;
          }
          steps.push({ description: "Green at G pixel", inputs: [], output: {r,g,b} });
       } else {
          b = centerVal;
          const initialG = (val(x-1, y) + val(x+1, y) + val(x, y-1) + val(x, y+1)) / 4;
          const residualGInterp = (
            (val(x-1, y) - initialG) +
            (val(x+1, y) - initialG) +
            (val(x, y-1) - initialG) +
            (val(x, y+1) - initialG)
          ) / 4;
          g = initialG + residualGInterp;
          
          steps.push({
            description: "Residual Interpolation for Green",
            formula: "\\hat{G} = \\hat{G}_0 + \\text{Interp}(R_G)",
            inputs: [],
            output: g
          });
          
          const rMinusG = [
            val(x-1, y-1) - g,
            val(x+1, y-1) - g,
            val(x-1, y+1) - g,
            val(x+1, y+1) - g
          ];
          r = g + rMinusG.reduce((a, b) => a + b, 0) / rMinusG.length;
          steps.push({ description: "Interpolate Red", inputs: [], output: r });
          steps.push({ description: "Combine Channels", inputs: [], output: {r,g,b} });
       }
    }
  } else if (cfaPattern === 'xtrans') {
    // XTrans Trace
    steps.push({
       description: "X-Trans Interpolation",
       formula: "\\hat{C} = \\text{AdaptiveAvg}(\\mathcal{N}_{5 \\times 5})",
       inputs: [],
       output: {
         r: 0, g: 0, b: 0 // Placeholder for now, logic mirrors demosaicXTransBasic
       } 
    });
    // Todo: Fill in detailed X-Trans steps similar to Bayer
  }
  
  return steps;
};

// ... computeErrorStats ...
export const computeErrorStats = (
  original: ImageData,
  demosaiced: ImageData
): ErrorStats => {
  let mseR = 0, mseG = 0, mseB = 0;
  let maeR = 0, maeG = 0, maeB = 0;
  const l2Map = new Float32Array(original.width * original.height);
  
  for (let i = 0; i < original.data.length; i += 4) {
    const dr = demosaiced.data[i] - original.data[i];
    const dg = demosaiced.data[i+1] - original.data[i+1];
    const db = demosaiced.data[i+2] - original.data[i+2];
    
    const errSq = dr*dr + dg*dg + db*db;
    l2Map[i/4] = Math.sqrt(errSq);
    
    mseR += dr*dr;
    mseG += dg*dg;
    mseB += db*db;

    maeR += Math.abs(dr);
    maeG += Math.abs(dg);
    maeB += Math.abs(db);
  }
  
  const px = original.width * original.height;
  mseR /= px;
  mseG /= px;
  mseB /= px;
  const mseTotal = (mseR + mseG + mseB) / 3;

  maeR /= px;
  maeG /= px;
  maeB /= px;
  const maeTotal = (maeR + maeG + maeB) / 3;
  
  const psnr = (mse: number) => mse === 0 ? 100 : 10 * Math.log10((255*255) / mse);

  // Simple luminance-based SSIM over the full image (single-window approximation)
  // This is not patch-based, but gives a scalar structural similarity indicator.
  let muX = 0, muY = 0;
  let sigmaX2 = 0, sigmaY2 = 0, sigmaXY = 0;
  const L = 255;
  const C1 = (0.01 * L) ** 2;
  const C2 = (0.03 * L) ** 2;

  for (let i = 0; i < original.data.length; i += 4) {
    const xr = original.data[i];
    const xg = original.data[i+1];
    const xb = original.data[i+2];
    const yr = demosaiced.data[i];
    const yg = demosaiced.data[i+1];
    const yb = demosaiced.data[i+2];

    const xL = 0.299 * xr + 0.587 * xg + 0.114 * xb;
    const yL = 0.299 * yr + 0.587 * yg + 0.114 * yb;

    muX += xL;
    muY += yL;
  }

  const n = original.data.length / 4;
  if (n > 0) {
    muX /= n;
    muY /= n;

    for (let i = 0; i < original.data.length; i += 4) {
      const xr = original.data[i];
      const xg = original.data[i+1];
      const xb = original.data[i+2];
      const yr = demosaiced.data[i];
      const yg = demosaiced.data[i+1];
      const yb = demosaiced.data[i+2];

      const xL = 0.299 * xr + 0.587 * xg + 0.114 * xb;
      const yL = 0.299 * yr + 0.587 * yg + 0.114 * yb;

      const dx = xL - muX;
      const dy = yL - muY;
      sigmaX2 += dx * dx;
      sigmaY2 += dy * dy;
      sigmaXY += dx * dy;
    }

    sigmaX2 /= n;
    sigmaY2 /= n;
    sigmaXY /= n;
  }

  const ssim =
    ((2 * muX * muY + C1) * (2 * sigmaXY + C2)) /
    ((muX * muX + muY * muY + C1) * (sigmaX2 + sigmaY2 + C2));
  
  return {
    mse: { r: mseR, g: mseG, b: mseB, total: mseTotal },
    psnr: { r: psnr(mseR), g: psnr(mseG), b: psnr(mseB), total: psnr(mseTotal) },
    mae: { r: maeR, g: maeG, b: maeB, total: maeTotal },
    ssim,
    l2Map
  };
};

