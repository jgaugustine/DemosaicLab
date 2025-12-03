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

