import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BenchmarkResult } from '@/types/benchmark';

interface ErrorHeatmapProps {
  results: BenchmarkResult[];
  groundTruthImages: Map<string, ImageData>; // Map of imageName -> ground truth ImageData
}

interface HeatmapThumbnail {
  result: BenchmarkResult;
  canvas: HTMLCanvasElement;
  minError: number;
  maxError: number;
}

const THUMBNAIL_SIZE = 120; // Size of each thumbnail in pixels

// Generate a heatmap canvas for a result
const generateHeatmapCanvas = (
  result: BenchmarkResult,
  size: number
): { canvas: HTMLCanvasElement; minError: number; maxError: number } | null => {
  if (!result.quality?.l2Map) return null;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { width, height, quality } = result;
  const l2Map = quality.l2Map;
  
  // Find min/max for normalization
  let minError = Infinity;
  let maxError = -Infinity;
  for (let i = 0; i < l2Map.length; i++) {
    if (l2Map[i] < minError) minError = l2Map[i];
    if (l2Map[i] > maxError) maxError = l2Map[i];
  }

  if (maxError <= minError) {
    // No variation, fill with gray
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    return { canvas, minError: 0, maxError: 0 };
  }

  const imageData = ctx.createImageData(size, size);
  const scaleX = width / size;
  const scaleY = height / size;

  // Create heatmap using a colormap (blue -> cyan -> yellow -> red)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Sample from center of pixel region
      const srcX = Math.floor((x + 0.5) * scaleX);
      const srcY = Math.floor((y + 0.5) * scaleY);
      const srcIdx = srcY * width + srcX;
      const error = l2Map[srcIdx];
      const normalized = (error - minError) / (maxError - minError);

      // Color interpolation: blue (low) -> cyan -> yellow -> red (high)
      let r = 0, g = 0, b = 0;
      if (normalized < 0.25) {
        // Blue to Cyan
        const t = normalized / 0.25;
        r = 0;
        g = Math.floor(t * 255);
        b = 255;
      } else if (normalized < 0.5) {
        // Cyan to Yellow
        const t = (normalized - 0.25) / 0.25;
        r = Math.floor(t * 255);
        g = 255;
        b = Math.floor((1 - t) * 255);
      } else if (normalized < 0.75) {
        // Yellow to Orange
        const t = (normalized - 0.5) / 0.25;
        r = 255;
        g = Math.floor((1 - t * 0.5) * 255);
        b = 0;
      } else {
        // Orange to Red
        const t = (normalized - 0.75) / 0.25;
        r = 255;
        g = Math.floor((1 - t) * 255);
        b = 0;
      }

      const pixelIdx = (y * size + x) * 4;
      imageData.data[pixelIdx] = r;
      imageData.data[pixelIdx + 1] = g;
      imageData.data[pixelIdx + 2] = b;
      imageData.data[pixelIdx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return { canvas, minError, maxError };
};

export function ErrorHeatmap({ results, groundTruthImages }: ErrorHeatmapProps) {
  const [filterAlgorithm, setFilterAlgorithm] = useState<string>('all');
  const [filterImage, setFilterImage] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'algorithm' | 'image' | 'psnr'>('algorithm');

  // Get unique results with quality metrics
  const resultsWithQuality = useMemo(() => 
    results.filter(r => r.quality && r.quality.l2Map),
    [results]
  );

  // Filter and sort results
  const filteredResults = useMemo(() => {
    let filtered = resultsWithQuality.filter(r => {
      if (filterAlgorithm !== 'all' && r.algorithm !== filterAlgorithm) return false;
      if (filterImage !== 'all' && r.imageName !== filterImage) return false;
      return true;
    });

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'algorithm':
          return a.algorithm.localeCompare(b.algorithm);
        case 'image':
          return a.imageName.localeCompare(b.imageName);
        case 'psnr':
          return (b.quality?.psnr.total ?? 0) - (a.quality?.psnr.total ?? 0);
        default:
          return 0;
      }
    });

    return filtered;
  }, [resultsWithQuality, filterAlgorithm, filterImage, sortBy]);

  // Generate thumbnails
  const thumbnails = useMemo(() => {
    const thumbs: HeatmapThumbnail[] = [];
    filteredResults.forEach(result => {
      const thumb = generateHeatmapCanvas(result, THUMBNAIL_SIZE);
      if (thumb) {
        thumbs.push({
          result,
          canvas: thumb.canvas,
          minError: thumb.minError,
          maxError: thumb.maxError,
        });
      }
    });
    return thumbs;
  }, [filteredResults]);

  const algorithms = useMemo(() => 
    Array.from(new Set(resultsWithQuality.map(r => r.algorithm))),
    [resultsWithQuality]
  );
  
  const images = useMemo(() => 
    Array.from(new Set(resultsWithQuality.map(r => r.imageName))),
    [resultsWithQuality]
  );

  // Calculate global min/max for consistent color scale
  const globalMinMax = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    resultsWithQuality.forEach(r => {
      if (r.quality?.l2Map) {
        for (let i = 0; i < r.quality.l2Map.length; i++) {
          const val = r.quality.l2Map[i];
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }
    });
    return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
  }, [resultsWithQuality]);

  if (resultsWithQuality.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error Heatmaps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No error heatmaps available. Quality metrics require ground truth images.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Error Heatmaps</CardTitle>
        <div className="flex gap-4 mt-4 flex-wrap">
          <Select value={filterAlgorithm} onValueChange={setFilterAlgorithm}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by algorithm..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Algorithms</SelectItem>
              {algorithms.map(algo => (
                <SelectItem key={algo} value={algo}>
                  {algo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterImage} onValueChange={setFilterImage}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by image..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Images</SelectItem>
              {images.map(img => (
                <SelectItem key={img} value={img}>
                  {img}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="algorithm">Sort by Algorithm</SelectItem>
              <SelectItem value="image">Sort by Image</SelectItem>
              <SelectItem value="psnr">Sort by PSNR</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {thumbnails.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No results match the current filters
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mb-6">
              {thumbnails.map((thumb, idx) => (
                <div
                  key={thumb.result.id}
                  className="space-y-2"
                >
                  <div className="relative border rounded overflow-hidden bg-background flex items-center justify-center" style={{ height: THUMBNAIL_SIZE }}>
                    <img
                      src={thumb.canvas.toDataURL()}
                      alt={`${thumb.result.algorithm} - ${thumb.result.imageName}`}
                      className="max-w-full max-h-full w-auto h-auto"
                      style={{ 
                        imageRendering: 'auto',
                        objectFit: 'contain'
                      }}
                    />
                  </div>
                  <div className="text-xs space-y-0.5">
                    <div className="font-medium truncate">{thumb.result.algorithm}</div>
                    <div className="text-muted-foreground truncate">{thumb.result.imageName}</div>
                    <div className="text-muted-foreground text-[10px]">
                      {thumb.result.cfaPattern.toUpperCase()} | PSNR: {thumb.result.quality?.psnr.total.toFixed(1)} dB
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-4 rounded border" style={{
                      background: 'linear-gradient(to right, blue, cyan, yellow, red)'
                    }} />
                    <span className="text-xs text-muted-foreground">Error intensity (low → high)</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Range: {globalMinMax.min.toFixed(2)} - {globalMinMax.max.toFixed(2)}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Showing {thumbnails.length} of {resultsWithQuality.length} results
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
