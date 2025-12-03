import { useEffect, useRef, useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { DemosaicInput, DemosaicAlgorithm } from "@/types/demosaic";
import { getBayerKernel } from "@/lib/cfa";
import { KernelMultiplicationDiagram } from "./KernelMultiplicationDiagram";

interface InteractiveDemosaicVisualizerProps {
  input: DemosaicInput;
  centerX: number;
  centerY: number;
  algorithm: DemosaicAlgorithm;
}

const REGION_SIZE = 15; // Odd number for easier centering

export function InteractiveDemosaicVisualizer({
  input,
  centerX,
  centerY,
  algorithm,
}: InteractiveDemosaicVisualizerProps) {
  const inputCanvasRef = useRef<HTMLCanvasElement>(null);
  const inputOverlayRef = useRef<HTMLCanvasElement>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement>(null);
  const outputOverlayRef = useRef<HTMLCanvasElement>(null);
  
  // Local cursor position within the region (0 to REGION_SIZE-1)
  // Default to center
  const [localCursorX, setLocalCursorX] = useState(Math.floor(REGION_SIZE / 2));
  const [localCursorY, setLocalCursorY] = useState(Math.floor(REGION_SIZE / 2));
  const [isDragging, setIsDragging] = useState(false);

  // Calculate the top-left of the region in global coordinates
  const regionOriginX = centerX - Math.floor(REGION_SIZE / 2);
  const regionOriginY = centerY - Math.floor(REGION_SIZE / 2);

  // Helper to get global coordinates from local cursor
  const globalCursorX = regionOriginX + localCursorX;
  const globalCursorY = regionOriginY + localCursorY;

  // Extract region data (CFA and Demosaiced)
  // We need to re-run demosaic for just this region or extract from full image if available?
  // The component props only give `input`. We don't have the full demosaiced image passed in here,
  // but we can compute it locally for the region. This is actually better as we can show the "What if" scenario.
  
  const regionData = useMemo(() => {
    const { width, height, cfaData, cfaPatternMeta, cfaPattern } = input;
    const inputImageData = new ImageData(REGION_SIZE, REGION_SIZE);
    const outputImageData = new ImageData(REGION_SIZE, REGION_SIZE);
    
    const getChannel = cfaPattern === 'bayer' ? getBayerKernel(cfaPatternMeta.layout) : () => 'g'; // Fallback
    const getVal = (x: number, y: number) => {
        // Mirror padding
        let sx = x; 
        if (sx < 0) sx = -sx; 
        else if (sx >= width) sx = 2*width - 2 - sx;
        
        let sy = y; 
        if (sy < 0) sy = -sy; 
        else if (sy >= height) sy = 2*height - 2 - sy;
        
        sx = Math.max(0, Math.min(width - 1, sx));
        sy = Math.max(0, Math.min(height - 1, sy));
        return cfaData[sy * width + sx];
    };

    // Generate Input Mosaic Visualization for Region
    for (let y = 0; y < REGION_SIZE; y++) {
      for (let x = 0; x < REGION_SIZE; x++) {
        const gx = regionOriginX + x;
        const gy = regionOriginY + y;
        
        // Check bounds for drawing black outside
        if (gx < 0 || gx >= width || gy < 0 || gy >= height) {
           const idx = (y * REGION_SIZE + x) * 4;
           inputImageData.data[idx] = 0;
           inputImageData.data[idx+1] = 0;
           inputImageData.data[idx+2] = 0;
           inputImageData.data[idx+3] = 255;
           outputImageData.data[idx] = 0; // Fill output with black too
           continue;
        }

        const val = getVal(gx, gy);
        const ch = getChannel(gx, gy);
        const v = Math.round(val * 255);
        
        const idx = (y * REGION_SIZE + x) * 4;
        inputImageData.data[idx] = ch === 'r' ? v : 0;
        inputImageData.data[idx+1] = ch === 'g' ? v : 0;
        inputImageData.data[idx+2] = ch === 'b' ? v : 0;
        inputImageData.data[idx+3] = 255;
        
        // Calculate Output (Demosaiced) for this pixel
        // We implement the logic locally to avoid dependency loops and overhead
        let r = 0, g = 0, b = 0;
        
        if (algorithm === 'nearest') {
            if (ch === 'r') {
                r = val;
                g = getVal(gx + 1, gy);
                b = getVal(gx + 1, gy + 1);
            } else if (ch === 'b') {
                b = val;
                g = getVal(gx - 1, gy);
                r = getVal(gx - 1, gy - 1);
            } else { // Green
                g = val;
                // Check if we are on Red row or Blue row (for Bayer RGGB)
                // Simple heuristic: look at neighbors
                const leftCh = getChannel(gx - 1, gy);
                const rightCh = getChannel(gx + 1, gy);
                const isRedRow = (leftCh === 'r' || rightCh === 'r');
                
                if (isRedRow) {
                    r = getVal(gx + 1, gy);
                    b = getVal(gx, gy + 1);
                } else {
                    b = getVal(gx + 1, gy);
                    r = getVal(gx, gy + 1);
                }
            }
        } else if (algorithm === 'bilinear') {
            if (ch === 'g') {
                g = val;
                const leftCh = getChannel(gx - 1, gy);
                const rightCh = getChannel(gx + 1, gy);
                const isRedRow = (leftCh === 'r' || rightCh === 'r');
                
                if (isRedRow) {
                    r = (getVal(gx-1, gy) + getVal(gx+1, gy)) / 2;
                    b = (getVal(gx, gy-1) + getVal(gx, gy+1)) / 2;
                } else {
                    r = (getVal(gx, gy-1) + getVal(gx, gy+1)) / 2;
                    b = (getVal(gx-1, gy) + getVal(gx+1, gy)) / 2;
                }
            } else if (ch === 'r') {
                r = val;
                g = (getVal(gx-1, gy) + getVal(gx+1, gy) + getVal(gx, gy-1) + getVal(gx, gy+1)) / 4;
                b = (getVal(gx-1, gy-1) + getVal(gx+1, gy-1) + getVal(gx-1, gy+1) + getVal(gx+1, gy+1)) / 4;
            } else { // Blue
                b = val;
                g = (getVal(gx-1, gy) + getVal(gx+1, gy) + getVal(gx, gy-1) + getVal(gx, gy+1)) / 4;
                r = (getVal(gx-1, gy-1) + getVal(gx+1, gy-1) + getVal(gx-1, gy+1) + getVal(gx+1, gy+1)) / 4;
            }
        }
        
        outputImageData.data[idx] = Math.min(255, Math.max(0, Math.round(r * 255)));
        outputImageData.data[idx+1] = Math.min(255, Math.max(0, Math.round(g * 255)));
        outputImageData.data[idx+2] = Math.min(255, Math.max(0, Math.round(b * 255)));
        outputImageData.data[idx+3] = 255;
      }
    }
    
    return { inputImageData, outputImageData };
  }, [input, regionOriginX, regionOriginY, algorithm]);

  // Compute Kernels for the current cursor position
  const kernels = useMemo(() => {
    const gx = globalCursorX;
    const gy = globalCursorY;
    const { width, height, cfaPatternMeta, cfaPattern } = input;
    const getChannel = cfaPattern === 'bayer' ? getBayerKernel(cfaPatternMeta.layout) : () => 'g';
    const centerCh = getChannel(gx, gy);
    
    // Define a small window around cursor to show weights, e.g., 3x3
    const kSize = 3;
    const offset = 1; // (kSize - 1) / 2

    // Initialize 3x3 grids for R, G, B weights
    const wR = Array(kSize).fill(0).map(() => Array(kSize).fill(0));
    const wG = Array(kSize).fill(0).map(() => Array(kSize).fill(0));
    const wB = Array(kSize).fill(0).map(() => Array(kSize).fill(0));
    
    if (algorithm === 'nearest') {
        if (centerCh === 'r') {
            wR[1][1] = 1;
            wG[1][2] = 1; // Right neighbor
            wB[2][2] = 1; // Bottom-Right neighbor
        } else if (centerCh === 'b') {
            wB[1][1] = 1;
            wG[1][0] = 1; // Left neighbor
            wR[0][0] = 1; // Top-Left neighbor
        } else { // Green
             wG[1][1] = 1;
             const leftCh = getChannel(gx - 1, gy);
             const rightCh = getChannel(gx + 1, gy);
             const isRedRow = (leftCh === 'r' || rightCh === 'r');
             if (isRedRow) {
                 wR[1][2] = 1; // Right
                 wB[2][1] = 1; // Bottom
             } else {
                 wB[1][2] = 1; // Right
                 wR[2][1] = 1; // Bottom
             }
        }
    } else if (algorithm === 'bilinear') {
        if (centerCh === 'g') {
            wG[1][1] = 1; // Identity
            const leftCh = getChannel(gx - 1, gy);
            const rightCh = getChannel(gx + 1, gy);
            const isRedRow = (leftCh === 'r' || rightCh === 'r');
            if (isRedRow) {
                // Red neighbors are Left/Right
                wR[1][0] = 0.5; wR[1][2] = 0.5;
                // Blue neighbors are Top/Bottom
                wB[0][1] = 0.5; wB[2][1] = 0.5;
            } else {
                // Blue neighbors are Left/Right
                wB[1][0] = 0.5; wB[1][2] = 0.5;
                // Red neighbors are Top/Bottom
                wR[0][1] = 0.5; wR[2][1] = 0.5;
            }
        } else if (centerCh === 'r') {
            wR[1][1] = 1;
            // Green: Cross average
            wG[0][1] = 0.25; wG[1][0] = 0.25; wG[1][2] = 0.25; wG[2][1] = 0.25;
            // Blue: Corners average
            wB[0][0] = 0.25; wB[0][2] = 0.25; wB[2][0] = 0.25; wB[2][2] = 0.25;
        } else { // Blue
            wB[1][1] = 1;
            // Green: Cross average
            wG[0][1] = 0.25; wG[1][0] = 0.25; wG[1][2] = 0.25; wG[2][1] = 0.25;
            // Red: Corners average
            wR[0][0] = 0.25; wR[0][2] = 0.25; wR[2][0] = 0.25; wR[2][2] = 0.25;
        }
    }
    
    return { wR, wG, wB, kSize };
  }, [globalCursorX, globalCursorY, algorithm, input]);

  // Generate Visualization Data for Diagrams
  const kernelVisualizations = useMemo(() => {
    const { wR, wG, wB, kSize } = kernels;
    const offset = Math.floor(kSize / 2);
    const visualizations = [];
    
    const makeVis = (weights: number[][], title: string) => {
        const cells = [];
        let totalR = 0, totalG = 0, totalB = 0;
        
        for (let y = 0; y < kSize; y++) {
            for (let x = 0; x < kSize; x++) {
                const weight = weights[y][x];
                // Get pixel value from input
                const gx = globalCursorX + (x - offset);
                const gy = globalCursorY + (y - offset);
                
                let r = 0, g = 0, b = 0;
                let label = "";
                // Safely get mosaic value
                if (gx >= 0 && gx < input.width && gy >= 0 && gy < input.height) {
                     const val = input.cfaData[gy * input.width + gx] * 255;
                     const getChannel = input.cfaPattern === 'bayer' ? getBayerKernel(input.cfaPatternMeta.layout) : () => 'g';
                     const ch = getChannel(gx, gy);
                     
                     // Simplify Label for CFA
                     if (ch === 'r') { 
                         r = val; 
                         label = `R: ${Math.round(val)}`;
                     }
                     else if (ch === 'g') { 
                         g = val; 
                         label = `G: ${Math.round(val)}`;
                     }
                     else { 
                         b = val; 
                         label = `B: ${Math.round(val)}`;
                     }
                }
                
                cells.push({ r, g, b, weight, label });
                if (weight > 0) {
                    totalR += r * weight;
                    totalG += g * weight;
                    totalB += b * weight;
                }
            }
        }
        return { title, size: kSize, cells, totals: { r: totalR, g: totalG, b: totalB } };
    };
    
    visualizations.push(makeVis(wR, "Red Channel Reconstruction"));
    visualizations.push(makeVis(wG, "Green Channel Reconstruction"));
    visualizations.push(makeVis(wB, "Blue Channel Reconstruction"));
    
    return visualizations;
  }, [kernels, globalCursorX, globalCursorY, input]);


  // Draw Canvases
  useEffect(() => {
     if (inputCanvasRef.current) {
         inputCanvasRef.current.width = REGION_SIZE;
         inputCanvasRef.current.height = REGION_SIZE;
         const ctx = inputCanvasRef.current.getContext('2d');
         ctx?.putImageData(regionData.inputImageData, 0, 0);
     }
     if (outputCanvasRef.current) {
         outputCanvasRef.current.width = REGION_SIZE;
         outputCanvasRef.current.height = REGION_SIZE;
         const ctx = outputCanvasRef.current.getContext('2d');
         ctx?.putImageData(regionData.outputImageData, 0, 0);
     }
  }, [regionData]);

  // Draw Overlays
  useEffect(() => {
     const drawOverlay = (canvas: HTMLCanvasElement | null, isInput: boolean) => {
         if (!canvas || !inputCanvasRef.current) return;
         const rect = inputCanvasRef.current.getBoundingClientRect(); // Use input canvas for size ref
         const displayWidth = rect.width;
         const displayHeight = rect.height;
         
         canvas.width = displayWidth;
         canvas.height = displayHeight;
         const ctx = canvas.getContext('2d');
         if (!ctx) return;
         ctx.clearRect(0, 0, displayWidth, displayHeight);
         
         const scaleX = displayWidth / REGION_SIZE;
         const scaleY = displayHeight / REGION_SIZE;
         
         // Draw Grid
         ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
         ctx.lineWidth = 1;
         ctx.beginPath();
         for (let i = 1; i < REGION_SIZE; i++) {
             ctx.moveTo(i * scaleX, 0);
             ctx.lineTo(i * scaleX, displayHeight);
             ctx.moveTo(0, i * scaleY);
             ctx.lineTo(displayWidth, i * scaleY);
         }
         ctx.stroke();
         
         // Draw Selection Cursor
         const kSize = kernels.kSize;
         const offset = Math.floor(kSize / 2);
         
         // The cursor is at localCursorX, localCursorY.
         // The Kernel window is centered there.
         
         if (isInput) {
             // Show Kernel Box
             const kx = (localCursorX - offset) * scaleX;
             const ky = (localCursorY - offset) * scaleY;
             const kw = kSize * scaleX;
             const kh = kSize * scaleY;
             
             ctx.strokeStyle = "#ff0000";
             ctx.lineWidth = 2;
             ctx.setLineDash([4, 2]);
             ctx.strokeRect(kx, ky, kw, kh);
         } else {
             // Show Single Pixel Highlight
             const kx = localCursorX * scaleX;
             const ky = localCursorY * scaleY;
             ctx.strokeStyle = "#ff0000";
             ctx.lineWidth = 2;
             ctx.setLineDash([]);
             ctx.strokeRect(kx, ky, scaleX, scaleY);
         }
     };
     
     // Need to wait for layout?
     requestAnimationFrame(() => {
        drawOverlay(inputOverlayRef.current, true);
        drawOverlay(outputOverlayRef.current, false);
     });
     
  }, [localCursorX, localCursorY, kernels]);

  // Mouse Handlers
  const getCoords = (e: React.MouseEvent) => {
      const canvas = inputCanvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / (rect.width / REGION_SIZE));
      const y = Math.floor((e.clientY - rect.top) / (rect.height / REGION_SIZE));
      return { x: Math.max(0, Math.min(REGION_SIZE-1, x)), y: Math.max(0, Math.min(REGION_SIZE-1, y)) };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      const c = getCoords(e);
      if (c) {
          setLocalCursorX(c.x);
          setLocalCursorY(c.y);
          setIsDragging(true);
      }
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDragging) return;
      const c = getCoords(e);
      if (c) {
          setLocalCursorX(c.x);
          setLocalCursorY(c.y);
      }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
         {/* Input Canvas */}
         <div className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground">CFA Input</div>
            <div className="relative aspect-square border rounded overflow-hidden cursor-crosshair"
                 onMouseDown={handleMouseDown}
                 onMouseMove={handleMouseMove}
                 onMouseUp={() => setIsDragging(false)}
                 onMouseLeave={() => setIsDragging(false)}>
                <canvas ref={inputCanvasRef} className="w-full h-full" style={{ imageRendering: 'pixelated' }} />
                <canvas ref={inputOverlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            </div>
         </div>
         
         {/* Output Canvas */}
         <div className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground">Demosaiced Output</div>
            <div className="relative aspect-square border rounded overflow-hidden">
                <canvas ref={outputCanvasRef} className="w-full h-full" style={{ imageRendering: 'pixelated' }} />
                <canvas ref={outputOverlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            </div>
         </div>
      </div>
      
      <div className="space-y-4">
         <div className="text-xs text-muted-foreground">
             The diagrams below show the contribution of neighboring pixels to the final RGB value (Raw CFA Value × Weight). Unused pixels are dimmed.
         </div>
         {kernelVisualizations.map(vis => (
             <KernelMultiplicationDiagram
                key={vis.title}
                title={vis.title}
                size={vis.size}
                cells={vis.cells}
                totals={vis.totals}
             />
         ))}
      </div>
    </div>
  );
}
