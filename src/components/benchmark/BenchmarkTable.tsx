import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BenchmarkResult } from '@/types/benchmark';
import { ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';

type SortField = 'algorithm' | 'image' | 'cfa' | 'time' | 'throughput' | 'psnr' | 'ssim' | 'mse';
type SortDirection = 'asc' | 'desc';

interface BenchmarkTableProps {
  results: BenchmarkResult[];
}

export function BenchmarkTable({ results }: BenchmarkTableProps) {
  const [sortField, setSortField] = useState<SortField>('time');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterAlgorithm, setFilterAlgorithm] = useState<string>('');
  const [filterImage, setFilterImage] = useState<string>('');

  const sortedResults = useMemo(() => {
    const filtered = results.filter(r => {
      const algoMatch = r.algorithm.toLowerCase().includes(filterAlgorithm.toLowerCase());
      const imageMatch = r.imageName.toLowerCase().includes(filterImage.toLowerCase());
      return algoMatch && imageMatch;
    });

    return [...filtered].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortField) {
        case 'algorithm':
          aVal = a.algorithm;
          bVal = b.algorithm;
          break;
        case 'image':
          aVal = a.imageName;
          bVal = b.imageName;
          break;
        case 'cfa':
          aVal = a.cfaPattern;
          bVal = b.cfaPattern;
          break;
        case 'time':
          aVal = a.performance.averageTimeMs;
          bVal = b.performance.averageTimeMs;
          break;
        case 'throughput':
          aVal = a.performance.throughputMPs;
          bVal = b.performance.throughputMPs;
          break;
        case 'psnr':
          aVal = a.quality?.psnr.total ?? -Infinity;
          bVal = b.quality?.psnr.total ?? -Infinity;
          break;
        case 'ssim':
          aVal = a.quality?.ssim ?? -Infinity;
          bVal = b.quality?.ssim ?? -Infinity;
          break;
        case 'mse':
          aVal = a.quality?.mse.total ?? Infinity;
          bVal = b.quality?.mse.total ?? Infinity;
          break;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [results, sortField, sortDirection, filterAlgorithm, filterImage]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto p-0 font-semibold hover:bg-transparent"
      onClick={() => handleSort(field)}
    >
      {children}
      {sortField === field ? (
        sortDirection === 'asc' ? (
          <ArrowUp className="ml-1 h-3 w-3" />
        ) : (
          <ArrowDown className="ml-1 h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
      )}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Benchmark Results</CardTitle>
        <div className="flex gap-2 mt-4">
          <div className="relative flex-1">
            <Filter className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by algorithm..."
              value={filterAlgorithm}
              onChange={(e) => setFilterAlgorithm(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="relative flex-1">
            <Filter className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by image..."
              value={filterImage}
              onChange={(e) => setFilterImage(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortButton field="algorithm">Algorithm</SortButton>
                </TableHead>
                <TableHead>
                  <SortButton field="image">Image</SortButton>
                </TableHead>
                <TableHead>
                  <SortButton field="cfa">CFA</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="time">Time (ms)</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="throughput">Throughput (MP/s)</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="psnr">PSNR (dB)</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="ssim">SSIM</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="mse">MSE</SortButton>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedResults.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No results match the current filters
                  </TableCell>
                </TableRow>
              ) : (
                sortedResults.map((result) => (
                  <TableRow key={result.id}>
                    <TableCell className="font-medium">{result.algorithm}</TableCell>
                    <TableCell>{result.imageName}</TableCell>
                    <TableCell className="uppercase">{result.cfaPattern}</TableCell>
                    <TableCell className="text-right">
                      {result.performance.averageTimeMs.toFixed(2)}
                      <span className="text-xs text-muted-foreground ml-1">
                        (±{result.performance.stdDevTimeMs.toFixed(2)})
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {result.performance.throughputMPs.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {result.quality?.psnr.total.toFixed(2) ?? 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      {result.quality?.ssim.toFixed(4) ?? 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      {result.quality?.mse.total.toFixed(4) ?? 'N/A'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="text-sm text-muted-foreground mt-4">
          Showing {sortedResults.length} of {results.length} results
        </div>
      </CardContent>
    </Card>
  );
}

