import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Cell,
} from 'recharts';
import { BenchmarkResult } from '@/types/benchmark';

interface BenchmarkChartsProps {
  results: BenchmarkResult[];
}

export function BenchmarkCharts({ results }: BenchmarkChartsProps) {
  // Group by algorithm for performance comparison with CI
  const performanceByAlgorithm = useMemo(() => {
    const grouped = new Map<string, { 
      time: number[]; 
      throughput: number[]; 
      timeCI: Array<{ lower: number; upper: number }>;
      throughputCI: Array<{ lower: number; upper: number }>;
    }>();
    
    results.forEach(r => {
      if (!grouped.has(r.algorithm)) {
        grouped.set(r.algorithm, { 
          time: [], 
          throughput: [], 
          timeCI: [],
          throughputCI: []
        });
      }
      const data = grouped.get(r.algorithm)!;
      data.time.push(r.performance.averageTimeMs);
      data.throughput.push(r.performance.throughputMPs);
      
      // Calculate throughput CI bounds (inverse relationship with time)
      const throughputLower = r.pixelCount / (r.performance.ci95UpperMs / 1000) / 1_000_000;
      const throughputUpper = r.pixelCount / (r.performance.ci95LowerMs / 1000) / 1_000_000;
      
      data.timeCI.push({
        lower: r.performance.ci95LowerMs,
        upper: r.performance.ci95UpperMs
      });
      data.throughputCI.push({
        lower: throughputLower,
        upper: throughputUpper
      });
    });

    return Array.from(grouped.entries()).map(([algorithm, data]) => {
      const avgTime = data.time.reduce((a, b) => a + b, 0) / data.time.length;
      const avgThroughput = data.throughput.reduce((a, b) => a + b, 0) / data.throughput.length;
      
      // Average CI bounds
      const avgTimeLower = data.timeCI.reduce((sum, ci) => sum + ci.lower, 0) / data.timeCI.length;
      const avgTimeUpper = data.timeCI.reduce((sum, ci) => sum + ci.upper, 0) / data.timeCI.length;
      const avgThroughputLower = data.throughputCI.reduce((sum, ci) => sum + ci.lower, 0) / data.throughputCI.length;
      const avgThroughputUpper = data.throughputCI.reduce((sum, ci) => sum + ci.upper, 0) / data.throughputCI.length;
      
      return {
        algorithm,
        avgTime,
        avgThroughput,
        timeError: [(avgTime - avgTimeLower), (avgTimeUpper - avgTime)],
        throughputError: [(avgThroughput - avgThroughputLower), (avgThroughputUpper - avgThroughput)],
      };
    });
  }, [results]);

  // Quality metrics by algorithm
  const qualityByAlgorithm = useMemo(() => {
    const grouped = new Map<string, { psnr: number[]; ssim: number[]; mse: number[] }>();
    
    results.filter(r => r.quality).forEach(r => {
      if (!grouped.has(r.algorithm)) {
        grouped.set(r.algorithm, { psnr: [], ssim: [], mse: [] });
      }
      const data = grouped.get(r.algorithm)!;
      if (r.quality) {
        data.psnr.push(r.quality.psnr.total);
        data.ssim.push(r.quality.ssim);
        data.mse.push(r.quality.mse.total);
      }
    });

    return Array.from(grouped.entries()).map(([algorithm, data]) => ({
      algorithm,
      avgPSNR: data.psnr.length > 0 ? data.psnr.reduce((a, b) => a + b, 0) / data.psnr.length : 0,
      avgSSIM: data.ssim.length > 0 ? data.ssim.reduce((a, b) => a + b, 0) / data.ssim.length : 0,
      avgMSE: data.mse.length > 0 ? data.mse.reduce((a, b) => a + b, 0) / data.mse.length : 0,
    }));
  }, [results]);

  // Calculate min and max SSIM for axis domain
  const ssimDomain = useMemo(() => {
    if (qualityByAlgorithm.length === 0) return [0, 1];
    const ssimValues = qualityByAlgorithm.map(d => d.avgSSIM).filter(v => v > 0);
    if (ssimValues.length === 0) return [0, 1];
    const min = Math.min(...ssimValues);
    const max = Math.max(...ssimValues);
    const padding = (max - min) * 0.1; // 10% padding
    return [Math.max(0, min - padding), Math.min(1, max + padding)];
  }, [qualityByAlgorithm]);

  // Scatter plot data: time vs quality with image name for shape encoding
  const timeVsQuality = useMemo(() => {
    return results
      .filter(r => r.quality)
      .map(r => ({
        time: r.performance.averageTimeMs,
        psnr: r.quality?.psnr.total ?? 0,
        mse: r.quality?.mse.total ?? 0,
        algorithm: r.algorithm,
        image: r.imageName,
        imageDisplayName: r.imageName.startsWith('uploaded_') 
          ? r.imageName.replace(/^uploaded_\d+_/, '') // Extract filename
          : r.imageName,
      }));
  }, [results]);
  
  // Get unique image names for shape mapping
  const imageNames = useMemo(() => 
    Array.from(new Set(timeVsQuality.map(d => d.image))).sort(),
    [timeVsQuality]
  );
  
  // Available shapes in Recharts
  const availableShapes = ['circle', 'square', 'triangle', 'diamond', 'star', 'cross', 'wye'];
  
  // Create shape mapping for each unique image name
  const shapeMap = useMemo(() => {
    const map = new Map<string, string>();
    imageNames.forEach((imageName, index) => {
      map.set(imageName, availableShapes[index % availableShapes.length]);
    });
    return map;
  }, [imageNames]);

  const algorithms = Array.from(new Set(results.map(r => r.algorithm)));
  const colors = [
    '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#8dd1e1',
    '#d084d0', '#ffb347', '#87ceeb', '#ff69b4', '#00ced1'
  ];
  const algorithmColors = new Map(
    algorithms.map((algo, i) => [algo, colors[i % colors.length]])
  );

  if (results.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Charts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No results to display
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance & Quality Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="performance" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="quality">Quality</TabsTrigger>
            <TabsTrigger value="tradeoff">Time vs Quality</TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-4 mt-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Average Execution Time by Algorithm (95% CI)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={performanceByAlgorithm}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="algorithm" />
                  <YAxis label={{ value: 'Time (ms)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip 
                    formatter={(value: number, name: string, props: any) => {
                      const margin = (props.payload.timeError[0] + props.payload.timeError[1]) / 2;
                      return [
                        `${value.toFixed(2)} ms (95% CI: ${(value - margin).toFixed(2)} - ${(value + margin).toFixed(2)} ms)`,
                        'Avg Time'
                      ];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="avgTime" fill="#8884d8" name="Avg Time (95% CI)" />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">
                Error bars show 95% confidence intervals. Tooltip displays exact CI bounds.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Average Throughput by Algorithm (95% CI)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={performanceByAlgorithm}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="algorithm" />
                  <YAxis label={{ value: 'Throughput (MP/s)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip 
                    formatter={(value: number, name: string, props: any) => {
                      const margin = (props.payload.throughputError[0] + props.payload.throughputError[1]) / 2;
                      return [
                        `${value.toFixed(2)} MP/s (95% CI: ${(value - margin).toFixed(2)} - ${(value + margin).toFixed(2)} MP/s)`,
                        'Throughput'
                      ];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="avgThroughput" fill="#82ca9d" name="Throughput (95% CI)" />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">
                Error bars show 95% confidence intervals. Tooltip displays exact CI bounds.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="quality" className="space-y-4 mt-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Average PSNR by Algorithm</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={qualityByAlgorithm}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="algorithm" />
                  <YAxis label={{ value: 'PSNR (dB)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="avgPSNR" fill="#8884d8" name="Avg PSNR (dB)" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Average SSIM by Algorithm</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={qualityByAlgorithm}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="algorithm" />
                  <YAxis 
                    label={{ value: 'SSIM', angle: -90, position: 'insideLeft' }}
                    domain={ssimDomain}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="avgSSIM" fill="#82ca9d" name="Avg SSIM" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Average MSE by Algorithm</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={qualityByAlgorithm}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="algorithm" />
                  <YAxis label={{ value: 'MSE', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="avgMSE" fill="#ffc658" name="Avg MSE" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="tradeoff" className="mt-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Performance vs Quality Trade-off</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Each point represents one test. Color = Algorithm, Shape = Image Type. Ideal algorithms are in the top-left (fast and high quality).
              </p>
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    type="number" 
                    dataKey="time" 
                    name="Time (ms)"
                    label={{ value: 'Execution Time (ms)', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="psnr" 
                    name="PSNR (dB)"
                    label={{ value: 'PSNR (dB)', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload[0]) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-background border rounded-lg p-2 shadow-lg">
                            <p className="font-semibold">{data.algorithm}</p>
                            <p className="text-sm">{data.image}</p>
                            <p className="text-sm">Time: {data.time.toFixed(2)} ms</p>
                            <p className="text-sm">PSNR: {data.psnr.toFixed(2)} dB</p>
                            <p className="text-sm">MSE: {data.mse.toFixed(4)}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend 
                    content={() => (
                      <div className="space-y-3 mt-4">
                        <div className="flex flex-wrap gap-3">
                          <span className="text-xs font-semibold">Algorithm (Color):</span>
                          {algorithms.slice(0, 8).map((algo, i) => (
                            <div key={algo} className="flex items-center gap-1">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: colors[i % colors.length] }}
                              />
                              <span className="text-xs">{algo}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <span className="text-xs font-semibold">Image (Shape):</span>
                          {imageNames.map(imageName => {
                            const shape = shapeMap.get(imageName) ?? 'circle';
                            const displayName = imageName.startsWith('uploaded_') 
                              ? imageName.replace(/^uploaded_\d+_/, '')
                              : imageName;
                            return (
                              <div key={imageName} className="flex items-center gap-1">
                                <svg width="12" height="12" viewBox="0 0 12 12" className="inline-block">
                                  {shape === 'circle' && <circle cx="6" cy="6" r="4" fill="currentColor" />}
                                  {shape === 'square' && <rect x="2" y="2" width="8" height="8" fill="currentColor" />}
                                  {shape === 'triangle' && <path d="M 6 2 L 10 10 L 2 10 Z" fill="currentColor" />}
                                  {shape === 'diamond' && <path d="M 6 2 L 10 6 L 6 10 L 2 6 Z" fill="currentColor" />}
                                  {shape === 'star' && <path d="M 6 1 L 7.5 4.5 L 11 5 L 8.5 7.5 L 9.5 11 L 6 9 L 2.5 11 L 3.5 7.5 L 1 5 L 4.5 4.5 Z" fill="currentColor" />}
                                  {shape === 'cross' && (
                                    <>
                                      <rect x="4" y="1" width="4" height="10" fill="currentColor" />
                                      <rect x="1" y="4" width="10" height="4" fill="currentColor" />
                                    </>
                                  )}
                                  {shape === 'wye' && (
                                    <path d="M 6 2 L 8 8 L 2 8 Z M 6 8 L 6 10" stroke="currentColor" strokeWidth="1.5" fill="none" />
                                  )}
                                </svg>
                                <span className="text-xs truncate max-w-[100px]">{displayName}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  />
                  {/* Render separate scatter plots for each image name to enable different shapes */}
                  {imageNames.map(imageName => {
                    const filteredData = timeVsQuality.filter(d => d.image === imageName);
                    const shape = shapeMap.get(imageName) ?? 'circle';
                    return (
                      <Scatter
                        key={imageName}
                        name={imageName}
                        data={filteredData}
                        shape={shape}
                      >
                        {filteredData.map((entry, index) => (
                          <Cell 
                            key={`cell-${imageName}-${index}`} 
                            fill={algorithmColors.get(entry.algorithm) ?? '#8884d8'} 
                          />
                        ))}
                      </Scatter>
                    );
                  })}
                </ScatterChart>
              </ResponsiveContainer>
              
              {/* Alternative: Time vs MSE chart */}
              <div className="mt-8">
                <h3 className="text-sm font-semibold mb-2">Performance vs MSE Trade-off</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Lower MSE is better. Color = Algorithm, Shape = Image Type.
                </p>
                <ResponsiveContainer width="100%" height={400}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      type="number" 
                      dataKey="time" 
                      name="Time (ms)"
                      label={{ value: 'Execution Time (ms)', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="mse" 
                      name="MSE"
                      label={{ value: 'MSE', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload[0]) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-background border rounded-lg p-2 shadow-lg">
                              <p className="font-semibold">{data.algorithm}</p>
                              <p className="text-sm">{data.image}</p>
                              <p className="text-sm">Time: {data.time.toFixed(2)} ms</p>
                              <p className="text-sm">MSE: {data.mse.toFixed(4)}</p>
                              <p className="text-sm">PSNR: {data.psnr.toFixed(2)} dB</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {imageNames.map(imageName => {
                      const filteredData = timeVsQuality.filter(d => d.image === imageName);
                      const shape = shapeMap.get(imageName) ?? 'circle';
                      return (
                        <Scatter
                          key={imageName}
                          name={imageName}
                          data={filteredData}
                          shape={shape}
                        >
                          {filteredData.map((entry, index) => (
                            <Cell 
                              key={`cell-mse-${imageName}-${index}`} 
                              fill={algorithmColors.get(entry.algorithm) ?? '#8884d8'} 
                            />
                          ))}
                        </Scatter>
                      );
                    })}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

