import { CFAType } from '@/types/demosaic';

export const getBayerKernel = (layout: string = 'RGGB') => {
  // Returns a function that takes (x,y) and returns 'r'|'g'|'b'
  const map: Record<string, string[][]> = {
    'RGGB': [['r', 'g'], ['g', 'b']],
    'GRBG': [['g', 'r'], ['b', 'g']],
    'GBRG': [['g', 'b'], ['r', 'g']],
    'BGGR': [['b', 'g'], ['g', 'r']],
  };
  const pattern = map[layout] || map['RGGB'];
  return (x: number, y: number) => pattern[((y % 2) + 2) % 2][((x % 2) + 2) % 2] as 'r' | 'g' | 'b';
};

export const getXTransKernel = () => {
  // 6x6 pattern
  // G R G G B G
  // B G B R G R
  // G R G G B G
  // G B G G R G
  // R G R B G B
  // G B G G R G
  const pattern = [
    ['g', 'r', 'g', 'g', 'b', 'g'],
    ['b', 'g', 'b', 'r', 'g', 'r'],
    ['g', 'r', 'g', 'g', 'b', 'g'],
    ['g', 'b', 'g', 'g', 'r', 'g'],
    ['r', 'g', 'r', 'b', 'g', 'b'],
    ['g', 'b', 'g', 'g', 'r', 'g'],
  ];
  return (x: number, y: number) => pattern[((y % 6) + 6) % 6][((x % 6) + 6) % 6] as 'r' | 'g' | 'b';
};

export const simulateCFA = (
  imageData: ImageData, 
  type: CFAType, 
  layout: string = 'RGGB'
): Float32Array => {
  const { width, height, data } = imageData;
  const cfa = new Float32Array(width * height);
  
  let getChannel: (x: number, y: number) => 'r' | 'g' | 'b';
  
  if (type === 'bayer') {
    getChannel = getBayerKernel(layout);
  } else if (type === 'xtrans') {
    getChannel = getXTransKernel();
  }
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = getChannel(x, y);
      const idx = (y * width + x) * 4;
      // Normalize 0-255 to 0-1
      const val = ch === 'r' ? data[idx] : ch === 'g' ? data[idx + 1] : data[idx + 2];
      cfa[y * width + x] = val / 255.0;
    }
  }
  
  return cfa;
};

