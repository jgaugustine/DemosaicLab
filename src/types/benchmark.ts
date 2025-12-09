import { DemosaicAlgorithm, CFAType, ErrorStats, DemosaicInput } from './demosaic';

export interface BenchmarkResult {
  id: string;
  algorithm: DemosaicAlgorithm;
  imageName: string;
  cfaPattern: CFAType;
  width: number;
  height: number;
  pixelCount: number;
  
  // Performance metrics
  performance: {
    executionTimeMs: number[];
    averageTimeMs: number;
    medianTimeMs: number;
    minTimeMs: number;
    maxTimeMs: number;
    stdDevTimeMs: number;
    ci95LowerMs: number; // 95% confidence interval lower bound
    ci95UpperMs: number; // 95% confidence interval upper bound
    throughputMPs: number; // Megapixels per second
    memoryUsageMB?: number; // If available
  };
  
  // Quality metrics (only if ground truth available)
  quality?: {
    mse: { r: number; g: number; b: number; total: number };
    psnr: { r: number; g: number; b: number; total: number };
    mae: { r: number; g: number; b: number; total: number };
    ssim: number;
    l2Map?: Float32Array; // Per-pixel L2 error for heatmap
  };
  
  timestamp: number;
  iterations: number;
}

export interface BenchmarkConfig {
  algorithms: DemosaicAlgorithm[];
  testImages: string[]; // Names of synthetic patterns or "uploaded_image_1", etc.
  cfaPatterns: CFAType[];
  iterations: number; // Number of runs per test for averaging
  enableQualityMetrics: boolean;
  testImageWidth?: number; // Optional: downscale for faster benchmarks
  testImageHeight?: number;
}

export interface BenchmarkProgress {
  current: number;
  total: number;
  currentTest: string; // e.g., "bilinear on Zone Plate with Bayer"
  isRunning: boolean;
  results: BenchmarkResult[];
}

export interface BenchmarkSummary {
  totalTests: number;
  completedTests: number;
  averageExecutionTime: number;
  fastestAlgorithm: { name: DemosaicAlgorithm; time: number };
  slowestAlgorithm: { name: DemosaicAlgorithm; time: number };
  bestQualityAlgorithm: { name: DemosaicAlgorithm; psnr: number } | null;
  algorithmsTested: DemosaicAlgorithm[];
}

