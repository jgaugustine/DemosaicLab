import { useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { DemosaicAlgorithm, CFAType, PixelTraceStep, DemosaicInput, ErrorStats } from '@/types/demosaic';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import { InteractiveDemosaicVisualizer } from './InteractiveDemosaicVisualizer';
import { ZoomIn } from 'lucide-react';
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

  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="border rounded overflow-hidden bg-background">
        <canvas
          ref={canvasRef}
          className="w-full h-auto block"
          style={{ imageRendering: 'pixelated' }}
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
            </>
        )
    },
    'sweep': {
        title: "Color Sweep",
        whatToLookFor: "Smooth gradients should remain smooth. Banding or jagged transitions indicate interpolation errors.",
        analysis: (cfa, algo) => (
            <>
                <strong>{algo}</strong> demosaicing {algo === 'nearest' ? "struggles with smooth transitions, creating 'steps' in the gradient." : "generally handles gradients well, but may desaturate high-frequency color borders."}
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
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">PSNR (dB)</div>
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
