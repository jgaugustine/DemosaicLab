export const createZonePlate = (width: number, height: number): ImageData => {
  const output = new ImageData(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(cx, cy);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx*dx + dy*dy);
      
      // Zone plate formula: cos(k * r^2)
      // Adjust k so frequency hits Nyquist at the edge or beyond
      const k = (Math.PI * width) / (maxR * maxR); 
      const val = (Math.cos(k * r * r * 0.5) + 1) / 2; // 0..1
      
      const idx = (y * width + x) * 4;
      const v = Math.floor(val * 255);
      
      output.data[idx] = v;
      output.data[idx+1] = v;
      output.data[idx+2] = v;
      output.data[idx+3] = 255;
    }
  }
  return output;
};

export const createFineCheckerboard = (width: number, height: number, size: number = 2): ImageData => {
  const output = new ImageData(width, height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = Math.floor(x / size);
      const cy = Math.floor(y / size);
      const isBlack = (cx + cy) % 2 === 0;
      const v = isBlack ? 0 : 255;
      
      const idx = (y * width + x) * 4;
      output.data[idx] = v;
      output.data[idx+1] = v;
      output.data[idx+2] = v;
      output.data[idx+3] = 255;
    }
  }
  return output;
};

export const createColorSweep = (width: number, height: number): ImageData => {
  const output = new ImageData(width, height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // R gradient X, G gradient Y, B constant or diag
      output.data[idx] = Math.floor((x / width) * 255);
      output.data[idx+1] = Math.floor((y / height) * 255);
      output.data[idx+2] = Math.floor(((x+y) / (width+height)) * 255);
      output.data[idx+3] = 255;
    }
  }
  return output;
};

export const createStarburst = (width: number, height: number): ImageData => {
  const output = new ImageData(width, height);
  const cx = width / 2;
  const cy = height / 2;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const angle = Math.atan2(dy, dx);
      const rays = 60;
      const val = (Math.cos(angle * rays) + 1) / 2;
      
      const idx = (y * width + x) * 4;
      const v = Math.floor(val * 255);
      
      // Make it black and white or colorful?
      // Let's do colorful rays
      // Phase shift for colors
      const vr = Math.floor(((Math.cos(angle * rays) + 1) / 2) * 255);
      const vg = Math.floor(((Math.cos(angle * rays + 2) + 1) / 2) * 255);
      const vb = Math.floor(((Math.cos(angle * rays + 4) + 1) / 2) * 255);

      output.data[idx] = vr;
      output.data[idx+1] = vg;
      output.data[idx+2] = vb;
      output.data[idx+3] = 255;
    }
  }
  return output;
};

// Diagonal Lines - Lines at 45° and other angles
export const createDiagonalLines = (width: number, height: number): ImageData => {
  const output = new ImageData(width, height);
  const lineSpacing = 20; // pixels between lines
  const lineWidth = 2; // thickness of lines
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // Create diagonal lines at 45 degrees: x + y = constant
      const diag1 = (x + y) % lineSpacing;
      const isLine1 = diag1 < lineWidth;
      
      // Also add lines at -45 degrees: x - y = constant
      const diag2 = ((x - y) % lineSpacing + lineSpacing) % lineSpacing;
      const isLine2 = diag2 < lineWidth;
      
      // White lines on black background
      const v = (isLine1 || isLine2) ? 255 : 0;
      
      output.data[idx] = v;
      output.data[idx+1] = v;
      output.data[idx+2] = v;
      output.data[idx+3] = 255;
    }
  }
  return output;
};

// Sine Wave Gratings - Horizontal, vertical, and diagonal at various frequencies
export const createSineWaveGratings = (width: number, height: number): ImageData => {
  const output = new ImageData(width, height);
  const cx = width / 2;
  const cy = height / 2;
  
  // Create three regions: horizontal, vertical, and diagonal gratings
  const thirdWidth = width / 3;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      let val = 0;
      
      if (x < thirdWidth) {
        // Horizontal grating (frequency varies with y)
        const frequency = 2 + (y / height) * 20; // 2 to 22 cycles
        val = (Math.sin((y * frequency * Math.PI * 2) / height) + 1) / 2;
      } else if (x < 2 * thirdWidth) {
        // Vertical grating (frequency varies with x)
        const localX = x - thirdWidth;
        const frequency = 2 + (localX / thirdWidth) * 20;
        val = (Math.sin((localX * frequency * Math.PI * 2) / thirdWidth) + 1) / 2;
      } else {
        // Diagonal grating at 45 degrees
        const localX = x - 2 * thirdWidth;
        const diagCoord = (localX + y) / Math.sqrt(2);
        const frequency = 2 + (diagCoord / Math.sqrt(thirdWidth * thirdWidth + height * height)) * 20;
        val = (Math.sin((diagCoord * frequency * Math.PI * 2) / Math.sqrt(thirdWidth * thirdWidth + height * height)) + 1) / 2;
      }
      
      const v = Math.floor(val * 255);
      output.data[idx] = v;
      output.data[idx+1] = v;
      output.data[idx+2] = v;
      output.data[idx+3] = 255;
    }
  }
  return output;
};

// Color Patches - Pure color squares (red, green, blue, cyan, magenta, yellow)
export const createColorPatches = (width: number, height: number): ImageData => {
  const output = new ImageData(width, height);
  
  const patchSize = Math.min(width, height) / 3;
  const colors = [
    { r: 255, g: 0, b: 0 },     // Red
    { r: 0, g: 255, b: 0 },     // Green
    { r: 0, g: 0, b: 255 },     // Blue
    { r: 0, g: 255, b: 255 },   // Cyan
    { r: 255, g: 0, b: 255 },   // Magenta
    { r: 255, g: 255, b: 0 },   // Yellow
  ];
  
  // Create a 2x3 grid of color patches
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      const patchX = Math.floor(x / patchSize);
      const patchY = Math.floor(y / patchSize);
      const patchIndex = patchY * 3 + patchX;
      
      if (patchIndex < colors.length) {
        const color = colors[patchIndex];
        output.data[idx] = color.r;
        output.data[idx+1] = color.g;
        output.data[idx+2] = color.b;
        output.data[idx+3] = 255;
      } else {
        // Gray background for remaining space
        output.data[idx] = 128;
        output.data[idx+1] = 128;
        output.data[idx+2] = 128;
        output.data[idx+3] = 255;
      }
    }
  }
  return output;
};

// Color Fringes - Thin colored lines on neutral backgrounds
export const createColorFringes = (width: number, height: number): ImageData => {
  const output = new ImageData(width, height);
  const lineWidth = 2; // pixels
  const spacing = 40; // pixels between lines
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // Neutral gray background
      let r = 128, g = 128, b = 128;
      
      // Check for line intersections (priority: diagonal > vertical > horizontal)
      const isHorizontalRed = y % spacing < lineWidth;
      const isVerticalCyan = (x + spacing / 2) % spacing < lineWidth;
      const diagCoord = (x + y) % spacing;
      const isDiagonalMagenta = diagCoord < lineWidth;
      
      // Apply colors with priority
      if (isDiagonalMagenta) {
        r = 255;
        g = 0;
        b = 255;
      } else if (isVerticalCyan) {
        r = 0;
        g = 255;
        b = 255;
      } else if (isHorizontalRed) {
        r = 255;
        g = 0;
        b = 0;
      }
      
      output.data[idx] = r;
      output.data[idx+1] = g;
      output.data[idx+2] = b;
      output.data[idx+3] = 255;
    }
  }
  return output;
};

