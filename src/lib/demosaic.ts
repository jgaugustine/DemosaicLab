import { DemosaicInput, DemosaicParams, ErrorStats, PixelTraceStep, DemosaicAlgorithm } from '@/types/demosaic';
import { getBayerKernel, getXTransKernel } from './cfa';

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

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

// ... Bayer implementations (keep existing) ...
export const demosaicBayerNearest = (
  input: DemosaicInput
): ImageData => {
  const { width, height, cfaData, cfaPatternMeta } = input;
  const output = new ImageData(width, height);
  const getChannel = getBayerKernel(cfaPatternMeta.layout);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerVal = cfaData[y * width + x];
      const centerCh = getChannel(x, y);
      const idx = (y * width + x) * 4;
      
      let r = 0, g = 0, b = 0;
      
      if (centerCh === 'r') {
        r = centerVal;
        g = getCfaVal(cfaData, width, height, x + 1, y);
        b = getCfaVal(cfaData, width, height, x + 1, y + 1);
      } else if (centerCh === 'b') {
        b = centerVal;
        g = getCfaVal(cfaData, width, height, x - 1, y);
        r = getCfaVal(cfaData, width, height, x - 1, y - 1);
      } else {
        g = centerVal;
        const leftCh = getBayerKernel(cfaPatternMeta.layout)(Math.max(0, x-1), y);
        if (leftCh === 'r' || getBayerKernel(cfaPatternMeta.layout)(Math.min(width-1, x+1), y) === 'r') {
             r = getCfaVal(cfaData, width, height, x + 1, y);
             b = getCfaVal(cfaData, width, height, x, y + 1);
        } else {
             b = getCfaVal(cfaData, width, height, x + 1, y);
             r = getCfaVal(cfaData, width, height, x, y + 1);
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

export const demosaicBayerBilinear = (
  input: DemosaicInput
): ImageData => {
  const { width, height, cfaData, cfaPatternMeta } = input;
  const output = new ImageData(width, height);
  const getChannel = getBayerKernel(cfaPatternMeta.layout);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerVal = cfaData[y * width + x];
      const centerCh = getChannel(x, y);
      const idx = (y * width + x) * 4;
      
      let r = 0, g = 0, b = 0;
      const val = (cx: number, cy: number) => getCfaVal(cfaData, width, height, cx, cy);

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
      } else if (centerCh === 'r') {
        r = centerVal;
        g = (val(x-1, y) + val(x+1, y) + val(x, y-1) + val(x, y+1)) / 4;
        b = (val(x-1, y-1) + val(x+1, y-1) + val(x-1, y+1) + val(x+1, y+1)) / 4;
      } else if (centerCh === 'b') {
        b = centerVal;
        g = (val(x-1, y) + val(x+1, y) + val(x, y-1) + val(x, y+1)) / 4;
        r = (val(x-1, y-1) + val(x+1, y-1) + val(x-1, y+1) + val(x+1, y+1)) / 4;
      }
      
      output.data[idx] = clamp(r);
      output.data[idx+1] = clamp(g);
      output.data[idx+2] = clamp(b);
      output.data[idx+3] = 255;
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
