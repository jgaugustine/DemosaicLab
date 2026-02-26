import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BenchmarkResult } from '@/types/benchmark';
import { Trophy, Clock, Zap, Target } from 'lucide-react';

interface BenchmarkSummaryProps {
  results: BenchmarkResult[];
}

export function BenchmarkSummary({ results }: BenchmarkSummaryProps) {
  if (results.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Tests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalTests = results.length;
  const avgTime = results.reduce((sum, r) => sum + r.performance.averageTimeMs, 0) / totalTests;

  // Find fastest and slowest
  const fastest = results.reduce((prev, curr) => 
    curr.performance.averageTimeMs < prev.performance.averageTimeMs ? curr : prev
  );
  const slowest = results.reduce((prev, curr) => 
    curr.performance.averageTimeMs > prev.performance.averageTimeMs ? curr : prev
  );

  // Find best quality (highest PSNR)
  const withQuality = results.filter(r => r.quality);
  const bestQuality = withQuality.length > 0
    ? withQuality.reduce((prev, curr) => 
        (curr.quality?.psnr.total ?? 0) > (prev.quality?.psnr.total ?? 0) ? curr : prev
      )
    : null;

  const avgThroughput = results.reduce((sum, r) => sum + r.performance.throughputMPs, 0) / totalTests;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Target className="h-4 w-4" />
            Total Tests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalTests}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {new Set(results.map(r => r.algorithm)).size} algorithms
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Avg Execution Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{avgTime.toFixed(2)} ms</div>
          <p className="text-xs text-muted-foreground mt-1">
            Fastest: {fastest.algorithm} ({fastest.performance.averageTimeMs.toFixed(2)} ms)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Avg Throughput
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{avgThroughput.toFixed(2)} MP/s</div>
          <p className="text-xs text-muted-foreground mt-1">
            {results.reduce((sum, r) => sum + r.pixelCount, 0) / 1_000_000} MP processed
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Best Quality
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bestQuality ? (
            <>
              <div className="text-2xl font-bold">{bestQuality.algorithm}</div>
              <p className="text-xs text-muted-foreground mt-1">
                PSNR: {bestQuality.quality?.psnr.total.toFixed(2)} dB
              </p>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">N/A (no quality metrics)</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

