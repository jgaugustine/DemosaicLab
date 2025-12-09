import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { DemosaicAlgorithm, CFAType, PixelTraceStep, DemosaicInput, ErrorStats } from '@/types/demosaic';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import { InteractiveDemosaicVisualizer } from './InteractiveDemosaicVisualizer';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { computeLaplacianMagnitude, normalizeScalarField, heatmapFromNormalizedField } from '@/lib/utils';

interface MathPanelProps {
  cfaType: CFAType;
  algorithm: DemosaicAlgorithm;
  trace?: PixelTraceStep[];
  x?: number;
  y?: number;
  error?: {
    rgb: { r: number, g: number, b: number };
    l2: number;
  };
  errorStats?: ErrorStats | null;
  input?: DemosaicInput | null;
  syntheticType?: string | null;
}

interface ScalarFieldHeatmapProps {
  field: Float32Array | undefined;
  width: number;
  height: number;
  label: string;
}

function ScalarFieldHeatmap({ field, width, height, label }: ScalarFieldHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  
  // Keep refs in sync with state
  useEffect(() => {
    zoomRef.current = zoom;
    panRef.current = pan;
  }, [zoom, pan]);

  useEffect(() => {
    if (!field || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const norm = normalizeScalarField(field, 0.01);
    const img = heatmapFromNormalizedField(norm, width, height);
    canvasRef.current.width = width;
    canvasRef.current.height = height;
    ctx.putImageData(img, 0, 0);
  }, [field, width, height]);

  // Set up native wheel event listener to avoid passive listener issues
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    
    const handleWheel = (e: WheelEvent) => {
      // Allow page scrolling if not zooming significantly or at edges, but 
      // for consistency, let's zoom if inside the component.
      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      const scaleFactor = 0.1;
      const delta = -Math.sign(e.deltaY) * scaleFactor;
      const newZoom = Math.max(1, Math.min(currentZoom + delta * currentZoom, 20));
      
      if (newZoom !== currentZoom && containerRef.current) {
        // Only prevent default if we are actually zooming (to avoid blocking scroll when at limit)
        e.preventDefault();
        
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - currentPan.x) / currentZoom;
        const worldY = (mouseY - currentPan.y) / currentZoom;

        const newPanX = mouseX - worldX * newZoom;
        const newPanY = mouseY - worldY * newZoom;

        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
      }
    };
    
    element.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, []); // Empty deps - handler reads from refs

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => setIsDragging(false);

  const handleZoomButton = (direction: 'in' | 'out') => {
     if (!containerRef.current) return;
     const rect = containerRef.current.getBoundingClientRect();
     const cx = rect.width / 2;
     const cy = rect.height / 2;
     const factor = direction === 'in' ? 1.2 : 1/1.2;
     const newZoom = Math.max(1, Math.min(20, zoom * factor));
     
     const worldX = (cx - pan.x) / zoom;
     const worldY = (cy - pan.y) / zoom;
     
     const newPanX = cx - worldX * newZoom;
     const newPanY = cy - worldY * newZoom;
     
     setZoom(newZoom);
     setPan({ x: newPanX, y: newPanY });
  };

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="flex items-center gap-1 bg-muted/50 rounded px-1">
           <button onClick={() => handleZoomButton('out')} className="p-1 hover:text-primary rounded-sm hover:bg-background/50" title="Zoom Out"><ZoomOut className="w-3 h-3" /></button>
           <span className="text-[10px] w-8 text-center font-mono select-none">{Math.round(zoom * 100)}%</span>
           <button onClick={() => handleZoomButton('in')} className="p-1 hover:text-primary rounded-sm hover:bg-background/50" title="Zoom In"><ZoomIn className="w-3 h-3" /></button>
           <button onClick={resetZoom} className="p-1 hover:text-primary ml-1 rounded-sm hover:bg-background/50" title="Reset View"><RotateCcw className="w-3 h-3" /></button>
        </div>
      </div>
      <div 
        ref={containerRef}
        className={`border rounded overflow-hidden bg-background relative touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-auto block origin-top-left transition-transform duration-75 ease-linear"
          style={{ 
             imageRendering: 'pixelated',
             transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
          }}
        />
      </div>
    </div>
  );
}

const SYNTHETIC_EXPLANATIONS: Record<string, { 
    title: string; 
    whatToLookFor: string;
    analysis: (cfa: CFAType, algo: DemosaicAlgorithm) => React.ReactNode;
}> = {
    'zoneplate': {
        title: "Zone Plate",
        whatToLookFor: "Observe the center for clarity and the edges for color artifacts (Moiré). High-frequency details often cause false colors in simple demosaicing.",
        analysis: (cfa, algo) => (
            <>
                With <strong>{cfa.toUpperCase()}</strong> and <strong>{algo}</strong>, you likely see color rings where there should only be black and white. 
                {algo === 'nearest' && " Nearest Neighbor produces jagged, blocky artifacts."}
                {algo === 'bilinear' && " Bilinear interpolation blurs the high frequencies but still suffers from 'zippering' false colors."}
                {(algo === 'niu_edge_sensing' || algo === 'lien_edge_based') && " Edge-aware algorithms should show reduced false colors compared to bilinear, as they interpolate along edges rather than across them."}
                {algo === 'wu_polynomial' && " Polynomial interpolation provides better frequency response, reducing aliasing artifacts while maintaining edge sharpness."}
                {algo === 'kiku_residual' && " Residual interpolation adapts to local structures, showing improved artifact reduction especially in high-frequency regions."}
            </>
        )
    },
    'checker': {
        title: "Fine Checkerboard",
        whatToLookFor: "This pattern represents the Nyquist limit (max frequency). Ideally, it should look like gray or distinct pixels, but often turns into solid colors.",
        analysis: (cfa, algo) => (
            <>
                A 1-pixel checkerboard is the worst-case scenario for <strong>{cfa.toUpperCase()}</strong>. 
                {algo === 'nearest' && " It completely breaks the structure, creating large solid color blocks."}
                {algo === 'bilinear' && " It averages out to a muddy gray, losing all detail."}
                {(algo === 'niu_edge_sensing' || algo === 'lien_edge_based' || algo === 'wu_polynomial' || algo === 'kiku_residual') && " Advanced algorithms may preserve some structure better than bilinear, but this pattern remains extremely challenging due to its frequency being at the Nyquist limit."}
            </>
        )
    },
    'sweep': {
        title: "Color Sweep",
        whatToLookFor: "Smooth gradients should remain smooth. Banding or jagged transitions indicate interpolation errors.",
        analysis: (cfa, algo) => (
            <>
                <strong>{algo}</strong> demosaicing {algo === 'nearest' ? "struggles with smooth transitions, creating 'steps' in the gradient." : algo === 'bilinear' ? "generally handles gradients well, but may desaturate high-frequency color borders." : "should handle smooth gradients well, with edge-aware methods preserving transitions more accurately than simple bilinear interpolation."}
            </>
        )
    },
    'star': {
        title: "Starburst",
        whatToLookFor: "Lines should remain straight and crisp. Look for 'stair-stepping' (aliasing) on diagonal lines.",
        analysis: (cfa, algo) => (
            <>
                Diagonal lines are challenging on a square <strong>{cfa.toUpperCase()}</strong> grid. 
                {algo === 'nearest' && " You will see significant jagged edges (aliasing)."}
                {algo === 'bilinear' && " The lines will be smoother but slightly blurred."}
                {(algo === 'niu_edge_sensing' || algo === 'lien_edge_based') && " Edge-aware algorithms should better preserve diagonal edges by detecting edge direction and interpolating accordingly."}
                {algo === 'wu_polynomial' && " Polynomial interpolation may provide sharper diagonal lines with reduced aliasing."}
                {algo === 'kiku_residual' && " Residual interpolation adapts to diagonal structures, potentially reducing artifacts along the lines."}
            </>
        )
    },
    'diagonal': {
        title: "Diagonal Lines",
        whatToLookFor: "Look for 'zippering' artifacts along diagonal lines. Bayer patterns are particularly sensitive to diagonal aliasing, which can create false colors.",
        analysis: (cfa, algo) => (
            <>
                Diagonal lines at 45° angles are the worst-case scenario for <strong>{cfa.toUpperCase()}</strong> patterns. 
                {algo === 'nearest' && " You'll see severe zippering (alternating color bands) along the lines."}
                {algo === 'bilinear' && " The zippering is reduced but still visible, especially with high-contrast lines."}
                {(algo === 'niu_edge_sensing' || algo === 'lien_edge_based') && " Edge-aware methods should significantly reduce zippering by detecting diagonal edges and interpolating along them."}
                {algo === 'wu_polynomial' && " Polynomial interpolation may reduce zippering artifacts through better local structure modeling."}
                {algo === 'kiku_residual' && " Residual interpolation adapts to diagonal structures, showing improved zippering reduction."}
                The square grid structure of CFA patterns doesn't align well with diagonal features, but advanced algorithms mitigate this.
            </>
        )
    },
    'sine': {
        title: "Sine Wave Gratings",
        whatToLookFor: "Observe how different frequencies are handled. High frequencies near Nyquist should show aliasing and false colors. The three regions test horizontal, vertical, and diagonal orientations.",
        analysis: (cfa, algo) => (
            <>
                Sine gratings test the frequency response of <strong>{algo}</strong> demosaicing. 
                {algo === 'nearest' && " You'll see strong aliasing at high frequencies, with false colors appearing where there should only be grayscale."}
                {algo === 'bilinear' && " The algorithm acts as a low-pass filter, blurring high frequencies but reducing aliasing artifacts."}
                {(algo === 'niu_edge_sensing' || algo === 'lien_edge_based') && " Edge-aware algorithms should show better frequency response with reduced false colors, especially for horizontal and vertical gratings."}
                {algo === 'wu_polynomial' && " Polynomial interpolation provides superior frequency response, reducing aliasing while maintaining signal fidelity better than bilinear."}
                {algo === 'kiku_residual' && " Residual interpolation adapts to frequency content, showing improved handling of high-frequency components."}
                Diagonal gratings typically show the worst artifacts due to the square grid structure.
            </>
        )
    },
    'patches': {
        title: "Color Patches",
        whatToLookFor: "Pure color squares should remain saturated and accurate. Look for color bleeding at edges, desaturation, or incorrect color reproduction.",
        analysis: (cfa, algo) => (
            <>
                Color patches test color accuracy and saturation preservation. 
                {algo === 'nearest' && " You may see color bleeding at patch boundaries and slight desaturation due to incorrect neighbor selection."}
                {algo === 'bilinear' && " Colors should be more accurate, but edges between patches may show color fringing or desaturation."}
                {(algo === 'niu_edge_sensing' || algo === 'lien_edge_based') && " Edge-aware methods should preserve color saturation better at patch boundaries by avoiding interpolation across edges."}
                {algo === 'wu_polynomial' && " Polynomial interpolation may provide more accurate color reproduction with better saturation preservation."}
                {algo === 'kiku_residual' && " Residual interpolation adapts to color boundaries, showing improved color accuracy and reduced fringing."}
                The <strong>{cfa.toUpperCase()}</strong> pattern's color distribution affects how well each primary color is captured.
            </>
        )
    },
    'fringes': {
        title: "Color Fringes",
        whatToLookFor: "Thin colored lines on neutral backgrounds should remain crisp. Look for color bleeding, false colors spreading beyond the lines, or desaturation of the colored lines.",
        analysis: (cfa, algo) => (
            <>
                Color fringes are a common real-world scenario (e.g., chromatic aberration). 
                {algo === 'nearest' && " You'll see significant color bleeding, with false colors spreading into the neutral gray background."}
                {algo === 'bilinear' && " The bleeding is reduced, but thin lines may appear slightly desaturated or blurred."}
                {(algo === 'niu_edge_sensing' || algo === 'lien_edge_based') && " Edge-aware algorithms should better preserve thin colored lines by detecting edges and avoiding interpolation that would cause bleeding."}
                {algo === 'wu_polynomial' && " Polynomial interpolation may preserve thin lines more accurately with reduced bleeding into the background."}
                {algo === 'kiku_residual' && " Residual interpolation adapts to the high-frequency color boundaries, showing improved preservation of thin colored lines."}
                This pattern is particularly challenging because it combines high spatial frequency (thin lines) with pure colors.
            </>
        )
    }
};

export function DemosaicMathExplanation({ 
  cfaType, 
  algorithm, 
  trace,
  x,
  y,
  error,
  errorStats,
  input,
  syntheticType
}: MathPanelProps) {
  const laplacianField = useMemo(() => {
    if (!input?.groundTruthRGB) return undefined;
    try {
      return computeLaplacianMagnitude(input.groundTruthRGB);
    } catch {
      return undefined;
    }
  }, [input?.groundTruthRGB]);

  return (
    <Card className="h-full border-l border-border shadow-sm rounded-none lg:rounded-lg flex flex-col bg-card">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-xl font-semibold text-primary flex items-center gap-2">
          Inspection & Math
          <HelpTooltip content="This panel shows the inner workings of the demosaicing process. Click a pixel on the canvas to see a step-by-step trace of how its color was calculated from the raw sensor data." />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden flex flex-col px-3 sm:px-4">
        <Tabs defaultValue="visualizer" className="w-full flex flex-col h-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto mb-4 shrink-0">
            <TabsTrigger value="visualizer">Visualizer</TabsTrigger>
            <TabsTrigger value="trace">Pixel Trace</TabsTrigger>
            <TabsTrigger value="algo">Algorithm Info</TabsTrigger>
            <TabsTrigger value="error">Error Analysis</TabsTrigger>
          </TabsList>
          
          <TabsContent value="visualizer" className="space-y-4 animate-in fade-in-50 overflow-y-auto pr-1 flex-1">
             {input && x !== undefined && y !== undefined && x >= 0 ? (
                 <InteractiveDemosaicVisualizer 
                    input={input}
                    centerX={x}
                    centerY={y}
                    algorithm={algorithm}
                 />
             ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-center p-6 border-2 border-dashed border-muted rounded-lg bg-muted/10">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                      <ZoomIn className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h4 className="font-semibold text-foreground">Click to Visualize</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Click a pixel on the image to see the zoomed-in convolution process.
                    </p>
                </div>
             )}
          </TabsContent>

          <TabsContent value="algo" className="space-y-4 animate-in fade-in-50 overflow-y-auto pr-1">
            <div className="text-sm space-y-4">
              
              {syntheticType && SYNTHETIC_EXPLANATIONS[syntheticType] && (
                <div className="bg-primary/5 border border-primary/20 p-3 rounded-md space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-primary text-base">{SYNTHETIC_EXPLANATIONS[syntheticType].title} Analysis</h3>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                        <h4 className="text-xs font-bold uppercase text-muted-foreground mb-1">What to Look For</h4>
                        <p className="text-xs text-foreground leading-relaxed">
                            {SYNTHETIC_EXPLANATIONS[syntheticType].whatToLookFor}
                        </p>
                    </div>
                    
                    <div className="pt-2 border-t border-primary/10">
                        <h4 className="text-xs font-bold uppercase text-muted-foreground mb-1">Algorithm Performance</h4>
                        <div className="text-xs text-foreground leading-relaxed">
                            {SYNTHETIC_EXPLANATIONS[syntheticType].analysis(cfaType, algorithm)}
                        </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-muted/30 p-3 rounded-md space-y-2">
                <h3 className="font-semibold text-primary">{cfaType.toUpperCase()} Pattern</h3>
                <div className="text-muted-foreground text-xs leading-relaxed space-y-2">
                  {cfaType === 'bayer' && (
                    <>
                      <p>The Bayer filter mosaic arranges RGB color filters on a square grid. The sampling function <InlineMath math="S(x,y)" /> selects one color channel per pixel:</p>
                      <BlockMath math="S(x,y) \in \{R, G, B\}" />
                      <p>Typically 50% Green, 25% Red, 25% Blue to mimic human eye sensitivity.</p>
                    </>
                  )}
                  {cfaType === 'xtrans' && (
                    <>
                      <p>Fujifilm X-Trans uses a <InlineMath math="6 \times 6" /> pseudo-random pattern. This periodicity reduces Moiré patterns, eliminating the need for an optical low-pass filter.</p>
                      <p>Every row and column contains all three colors (R, G, B).</p>
                    </>
                  )}
                  {cfaType === 'foveon' && "Foveon sensors stack three photodiodes vertically, capturing R, G, and B at every pixel location directly. No spatial demosaicing is required in the traditional sense."}
                </div>
              </div>

              <div className="bg-muted/30 p-3 rounded-md space-y-2">
                 <h3 className="font-semibold text-primary">Algorithm: {algorithm}</h3>
                 <div className="text-muted-foreground text-xs leading-relaxed space-y-2">
                    {algorithm === 'nearest' && (
                      <>
                        <p>Copies values from the nearest available neighbor of the missing color.</p>
                        <BlockMath math="\hat{C}(x,y) = C(x', y')" />
                        <p>Where <InlineMath math="(x', y')" /> is the coordinate of the closest pixel with color <InlineMath math="C" />. This is 0th-order interpolation, causing "zippering" artifacts.</p>
                      </>
                    )}
                    {algorithm === 'bilinear' && (
                      <>
                        <p>Computes the arithmetic mean of immediate neighbors of the same color.</p>
                        <p>For Green at a Red/Blue location:</p>
                        <BlockMath math="\hat{G}(x,y) = \frac{1}{4} \sum_{(i,j) \in \mathcal{N}_4} G(x+i, y+j)" />
                        <p>Where <InlineMath math="\mathcal{N}_4" /> are the 4 cardinal neighbors (top, bottom, left, right). This acts as a low-pass filter.</p>
                      </>
                    )}
                    {algorithm === 'malvar' && (
                      <>
                        <p><strong>High-Quality Linear Interpolation</strong> (Malvar, He, Cutler). It adds a gradient correction term to the bilinear estimate to preserve edges.</p>
                        <p>For example, estimating Green at Red pixel:</p>
                        <BlockMath math="\hat{G}(x,y) = \hat{G}_{bilinear}(x,y) + \alpha \Delta_{R}" />
                        <p>Where <InlineMath math="\Delta_R" /> is the Laplacian of the Red channel (2nd derivative), effectively using the Red channel's high-frequency detail to guide the Green interpolation.</p>
                      </>
                    )}
                    {algorithm === 'niu_edge_sensing' && (
                      <>
                        <p><strong>Low-Cost Edge Sensing</strong> (Niu et al., 2018). This algorithm improves upon the Hamilton-Adams method by introducing a low-cost edge sensing scheme that guides interpolation using directional variations.</p>
                        <p>The algorithm computes directional variations in horizontal, vertical, and diagonal directions:</p>
                        <BlockMath math="\Delta_H = |I(x+1,y) - I(x-1,y)|, \quad \Delta_V = |I(x,y+1) - I(x,y-1)|" />
                        <p>These variations are then weighted using a logistic function to determine edge strength:</p>
                        <BlockMath math="w = \frac{1}{1 + e^{-k(\Delta - \theta)}}" />
                        <p>Where <InlineMath math="k" /> controls steepness and <InlineMath math="\theta" /> is the edge detection threshold. The algorithm interpolates along edges (where variation is low) rather than across them, preserving sharp boundaries while maintaining computational efficiency.</p>
                        <p><strong>Key advantage:</strong> Achieves high accuracy with low computational cost, processing high-resolution images much faster than top-performing methods while maintaining comparable quality.</p>
                      </>
                    )}
                    {algorithm === 'lien_edge_based' && (
                      <>
                        <p><strong>Efficient Edge-Based Technique</strong> (Lien et al., 2017). This method uses simple operations (addition, subtraction, shift, comparison) to detect edges and guide interpolation, making it highly suitable for hardware implementation.</p>
                        <p>The algorithm detects edge direction by comparing color differences:</p>
                        <BlockMath math="\text{edge} = \begin{cases} \text{horizontal} & \text{if } |I(x-1,y) - I(x+1,y)| < |I(x,y-1) - I(x,y+1)| \\ \text{vertical} & \text{otherwise} \end{cases}" />
                        <p>Interpolation is then performed along the detected edge direction to preserve structural details. For example, if a horizontal edge is detected, the algorithm interpolates vertically (along the edge) rather than horizontally (across the edge).</p>
                        <p><strong>Key advantage:</strong> Designed for efficient VLSI implementation with minimal line buffering (only 4 lines), enabling real-time processing at high throughput rates (approximately 200 million samples per second).</p>
                      </>
                    )}
                    {algorithm === 'wu_polynomial' && (
                      <>
                        <p><strong>Polynomial Interpolation</strong> (Wu et al., 2016). This algorithm uses polynomial interpolation instead of traditional bilinear or Laplacian predictors, providing more accurate estimation of missing color values.</p>
                        <p>The method introduces polynomial error predictors that better capture local image structure. For a set of neighboring values, the algorithm fits a polynomial:</p>
                        <BlockMath math="P_n(x) = \sum_{i=0}^{n} a_i x^i" />
                        <p>Where <InlineMath math="n" /> is the polynomial degree (typically 2-3). The algorithm also classifies edges using color differences to guide the interpolation process, then applies a weighted sum strategy in a refinement stage to reduce artifacts.</p>
                        <p><strong>Key advantage:</strong> More accurate than traditional interpolation methods, particularly effective for mobile devices and tablets where both quality and computational efficiency are important.</p>
                      </>
                    )}
                    {algorithm === 'kiku_residual' && (
                      <>
                        <p><strong>Residual Interpolation</strong> (Kiku et al., 2016). This algorithm moves beyond traditional color difference methods by interpolating residuals—the differences between observed and estimated values—rather than directly interpolating colors.</p>
                        <p>The process involves three main steps:</p>
                        <ol className="list-decimal list-inside space-y-1 text-xs">
                          <li><strong>Initial estimation:</strong> Compute an initial estimate using simple interpolation (e.g., bilinear): <InlineMath math="\hat{I}_0" /></li>
                          <li><strong>Residual calculation:</strong> Compute residuals at observed pixels: <InlineMath math="R = I_{observed} - \hat{I}_0" /></li>
                          <li><strong>Residual interpolation:</strong> Interpolate residuals to missing locations and refine: <InlineMath math="\hat{I} = \hat{I}_0 + \text{Interp}(R)" /></li>
                        </ol>
                        <p>This approach adapts to local image structures and varying spectral correlations, effectively reducing artifacts and improving color accuracy.</p>
                        <p><strong>Key advantage:</strong> Superior performance in both objective metrics and visual quality compared to color difference methods, with better artifact reduction and detail preservation.</p>
                      </>
                    )}
                 </div>
              </div>
              
              {cfaType === 'bayer' && (
                <div className="mt-4">
                   <div className="text-xs font-medium mb-2 text-center">Bayer (RGGB) Unit Cell</div>
                   <div className="grid grid-cols-2 gap-1 w-24 h-24 mx-auto">
                      <div className="bg-red-500/20 text-red-500 flex items-center justify-center font-bold border border-red-500/50 rounded"><InlineMath math="R_{00}" /></div>
                      <div className="bg-green-500/20 text-green-500 flex items-center justify-center font-bold border border-green-500/50 rounded"><InlineMath math="G_{01}" /></div>
                      <div className="bg-green-500/20 text-green-500 flex items-center justify-center font-bold border border-green-500/50 rounded"><InlineMath math="G_{10}" /></div>
                      <div className="bg-blue-500/20 text-blue-500 flex items-center justify-center font-bold border border-blue-500/50 rounded"><InlineMath math="B_{11}" /></div>
                   </div>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="trace" className="space-y-4 animate-in fade-in-50 overflow-y-auto pr-1 flex-1">
            {trace && x !== undefined && y !== undefined && x >= 0 ? (
              <div className="space-y-4 pb-4">
                {/* Header with Coords & Error */}
                <div className="flex items-center justify-between bg-muted/40 p-2 rounded-md border border-border sticky top-0 z-10 backdrop-blur-sm bg-background/80">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary"></div>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-sm font-medium">Pixel ({x}, {y})</span>
                      <HelpTooltip className="h-3 w-3" content={`Coordinates of the currently selected pixel. x=${x}, y=${y}.`} />
                    </div>
                  </div>
                  {error ? (
                     <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          L2 Error
                          <HelpTooltip className="h-3 w-3" content="L2 Error (Euclidean distance) measures the accuracy of the reconstruction. It is the distance between the reconstructed RGB vector and the original ground truth RGB vector. Lower is better." />
                        </span>
                        <span className={`font-mono text-sm font-bold ${error.l2 > 0.1 ? 'text-red-500' : 'text-green-500'}`}>
                          {error.l2.toFixed(4)}
                        </span>
                     </div>
                  ) : (
                     <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">No Ground Truth</span>
                        <HelpTooltip className="h-3 w-3" content="We don't have the original full-color image to compare against (e.g. when using a real RAW file), so we can't calculate error." />
                     </div>
                  )}
                </div>
                
                {/* Trace Steps Timeline */}
                <div className="space-y-3 relative before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border">
                  {trace.map((step, i) => (
                    <div key={i} className="relative pl-8">
                      {/* Timeline Dot */}
                      <div className="absolute left-[11px] top-1.5 w-[10px] h-[10px] rounded-full bg-background border-2 border-primary z-10"></div>
                      
                      <div className="bg-card border border-border rounded-md overflow-hidden shadow-sm">
                        <div className="bg-muted/30 px-3 py-2 border-b border-border/50">
                          <div className="text-xs font-semibold text-primary">{step.description}</div>
                          {step.formula && (
                            <div className="text-[10px] text-muted-foreground mt-1 overflow-x-auto">
                              <InlineMath math={step.formula} />
                            </div>
                          )}
                        </div>
                        
                        <div className="p-3 space-y-2">
                          {/* Inputs */}
                          {step.inputs.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-[10px] uppercase text-muted-foreground font-medium flex items-center gap-1">
                                Inputs
                                <HelpTooltip className="h-3 w-3" content="The raw sensor values from neighboring pixels used to calculate this color." />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {step.inputs.map((input, j) => (
                                  <div key={j} className="flex justify-between items-center bg-muted/20 px-2 py-1 rounded text-xs">
                                    <span className="text-muted-foreground truncate max-w-[80px]" title={input.label}>{input.label}</span>
                                    <span className="font-mono font-medium">
                                       {typeof input.value === 'number' ? input.value.toFixed(3) : 'RGB'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Output */}
                          <div className="mt-2 pt-2 border-t border-border/50 flex justify-between items-center">
                            <span className="text-[10px] uppercase text-muted-foreground font-medium flex items-center gap-1">
                              Output
                              <HelpTooltip className="h-3 w-3" content="The final interpolated color value for this channel at this pixel location." />
                            </span>
                            <div className="font-mono text-sm font-bold text-foreground bg-primary/10 px-2 py-0.5 rounded text-primary">
                               {typeof step.output === 'number' ? step.output.toFixed(3) : 'RGB'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-center p-6 border-2 border-dashed border-muted rounded-lg bg-muted/10">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-muted-foreground"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                </div>
                <h4 className="font-semibold text-foreground">Inspect a Pixel</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Click a pixel on the image canvas to see step-by-step demosaicing details and error metrics.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="error" className="space-y-4 animate-in fade-in-50 overflow-y-auto pr-1 flex-1">
            {input && input.groundTruthRGB && errorStats ? (
              <div className="space-y-4 pb-4 text-xs">
                <div className="bg-muted/40 p-3 rounded-md border border-border/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-primary text-sm">Global Error Metrics</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">PSNR (dB)</div>
                        <HelpTooltip className="h-3 w-3" content={
                          <div className="space-y-2">
                            <div>
                              <strong>Peak Signal-to-Noise Ratio (PSNR)</strong>
                            </div>
                            <div>Higher is better. Measures quality of reconstruction.</div>
                            <div className="pt-1 border-t border-yellow-200">
                              <div className="font-semibold mb-1">Interpretation:</div>
                              <div className="space-y-0.5 text-xs">
                                <div>• <strong>&gt; 40 dB:</strong> Excellent — artifacts barely visible</div>
                                <div>• <strong>30-40 dB:</strong> Good — minor artifacts</div>
                                <div>• <strong>20-30 dB:</strong> Fair — noticeable artifacts</div>
                                <div>• <strong>&lt; 20 dB:</strong> Poor — severe artifacts</div>
                              </div>
                            </div>
                          </div>
                        } />
                      </div>
                      <div className="font-mono text-xs">
                        <div>Total: {errorStats.psnr.total.toFixed(2)}</div>
                        <div className="text-muted-foreground">
                          R: {errorStats.psnr.r.toFixed(2)}, G: {errorStats.psnr.g.toFixed(2)}, B: {errorStats.psnr.b.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">MSE / MAE</div>
                      <div className="font-mono text-xs">
                        <div>MSE: {errorStats.mse.total.toFixed(2)}</div>
                        <div>MAE: {errorStats.mae.total.toFixed(2)}</div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">SSIM</div>
                      <div className="font-mono text-xs">{errorStats.ssim.toFixed(4)}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Pixel ({x ?? '-'}, {y ?? '-'})
                      </div>
                      {error ? (
                        <div className="font-mono text-xs">
                          L2:{' '}
                          <span className={error.l2 > 0.1 ? 'text-red-500' : 'text-green-600'}>
                            {error.l2.toFixed(4)}
                          </span>
                        </div>
                      ) : (
                        <div className="text-muted-foreground text-[11px]">
                          Click a pixel on the image to see local error.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-muted/40 p-3 rounded-md border border-border/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-primary text-sm">Error Heatmap (‖error‖₂)</h3>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Each pixel is colored by the L2 distance between reconstructed and ground-truth RGB. 
                      Blue means low error, red means high error. Notice how errors cluster around edges and fine detail.
                    </p>
                    {errorStats.l2Map && (
                      <ScalarFieldHeatmap
                        field={errorStats.l2Map}
                        width={input.groundTruthRGB.width}
                        height={input.groundTruthRGB.height}
                        label="‖RGB_est - RGB_true‖₂"
                      />
                    )}
                  </div>
                  <div className="bg-muted/40 p-3 rounded-md border border-border/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-primary text-sm">Laplacian Magnitude (∇²I)</h3>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      This map approximates the second spatial derivative of the ground-truth luminance. 
                      Large values correspond to strong curvature (sharp edges, oscillations). 
                      For linear interpolation, the demosaicing error can be bounded by a constant times this curvature term.
                    </p>
                    {laplacianField && (
                      <ScalarFieldHeatmap
                        field={laplacianField}
                        width={input.groundTruthRGB.width}
                        height={input.groundTruthRGB.height}
                        label="‖∇²I‖"
                      />
                    )}
                  </div>
                </div>

                <div className="bg-muted/30 p-3 rounded-md space-y-2">
                  <h3 className="font-semibold text-primary text-sm">Theoretical Error View</h3>
                  {algorithm === 'nearest' ? (
                    <>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Nearest neighbour is a zero‑order hold: each reconstructed value is a copy of the closest sample. 
                        In 1D, sampling at spacing Δx and holding the left (or right) sample gives an error controlled by 
                        the first derivative. Using the mean value theorem between a sample at x₀ and a point x in the next
                        interval, we write:
                      </p>
                      <BlockMath math="f(x) = f(x_0) + (x - x_0) f'(\xi), \quad \xi \in [x_0, x]" />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Taking absolute values and using that |x - x₀| ≤ Δx on that interval gives the bound:
                      </p>
                      <BlockMath math="|f(x) - f(x_0)| \le \Delta x \, \max_{x_0 \le t \le x_0 + \Delta x} |f'(t)|" />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Large |f'| (strong edges, steep ramps) makes this bound large, so zero‑order hold produces visible 
                        stair‑steps. In 2D images, this shows up as jagged edges and blocky colour regions wherever spatial 
                        derivatives are high, and as classic aliasing when the scene contains frequencies above the Nyquist 
                        limit of the sampling grid.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        For a 1D signal f(x), linear interpolation between samples at x₀ and x₁ can be analysed with a Taylor
                        expansion around the midpoint m = (x₀ + x₁)/2. Writing
                      </p>
                      <BlockMath math="f(x) = f(m) + f'(m)(x-m) + \tfrac{1}{2} f''(\xi)(x-m)^2,\quad \xi \in [x_0, x_1]" />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        and using that the linear interpolant matches f at x₀ and x₁ and is itself a straight line through those
                        endpoints, one can show that the linear term cancels in the difference f(x) - \hat f(x), leaving only the 
                        second‑order remainder. This yields a bound of the form:
                      </p>
                      <BlockMath math="|f(x) - \hat{f}(x)| \le \frac{(x_1 - x_0)^2}{8} \, \max_{x_0 \le t \le x_1} |f''(t)|" />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        In 2D images, demosaicing with bilinear or Malvar‑type linear filters behaves similarly: the reconstruction 
                        error at a pixel is bounded by a constant times the local second derivatives (the Laplacian) of the underlying 
                        colour channels. This explains why high‑frequency textures (zone plates, checkerboards, starburst rays) 
                        produce much larger artifacts than flat regions or gentle gradients.
                      </p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-center p-6 border-2 border-dashed border-muted rounded-lg bg-muted/10">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-muted-foreground"><path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                </div>
                <h4 className="font-semibold text-foreground">Error Analysis Requires Ground Truth</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Load a synthetic or lab image (with known RGB ground truth) to see quantitative error metrics
                  and how they relate to image curvature.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
