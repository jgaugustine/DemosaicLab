import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { DemosaicCanvas } from '@/components/DemosaicCanvas';
import { DemosaicMathExplanation } from '@/components/DemosaicMathExplanation';
import { DemosaicInput, DemosaicAlgorithm, CFAType, PixelTraceStep, ErrorStats } from '@/types/demosaic';
import { simulateCFA } from '@/lib/cfa';
import { demosaicBayerNearest, demosaicBayerBilinear, demosaicXTransBasic, computeErrorStats, getPixelTrace } from '@/lib/demosaic';
import { decodeDNG } from '@/lib/dngDecode';
import { createZonePlate, createFineCheckerboard, createColorSweep, createStarburst } from '@/lib/synthetic';
import { Upload, Image as ImageIcon, FileCode, Grid3X3, ZoomIn, ZoomOut, RefreshCcw, Grid, Columns } from 'lucide-react';
import { downsizeImageToDataURL } from '@/lib/imageResize';
import { HelpTooltip } from '@/components/ui/HelpTooltip';

export default function Index() {
  const [input, setInput] = useState<DemosaicInput | null>(null);
  const [cfaImage, setCfaImage] = useState<ImageData | null>(null);
  
  // Comparison Mode State
  const [comparisonMode, setComparisonMode] = useState(false);
  
  // Algo 1 State
  const [outputImage, setOutputImage] = useState<ImageData | null>(null);
  const [algorithm, setAlgorithm] = useState<DemosaicAlgorithm>('bilinear');
  const [trace, setTrace] = useState<PixelTraceStep[]>([]);
  const [errorStats, setErrorStats] = useState<ErrorStats | null>(null);

  // Algo 2 State
  const [outputImage2, setOutputImage2] = useState<ImageData | null>(null);
  const [algorithm2, setAlgorithm2] = useState<DemosaicAlgorithm>('nearest');
  const [trace2, setTrace2] = useState<PixelTraceStep[]>([]);
  const [errorStats2, setErrorStats2] = useState<ErrorStats | null>(null);

  const [cfaType, setCfaType] = useState<CFAType>('bayer');
  const [uiMode, setUiMode] = useState<'lab' | 'synthetic' | 'raw'>('synthetic');
  const [syntheticType, setSyntheticType] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{x: number, y: number} | null>(null);
  const [selectedPos, setSelectedPos] = useState<{x: number, y: number} | null>(null);
  const [showCFA, setShowCFA] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isFit, setIsFit] = useState(true);
  
  const fileInputRefLab = useRef<HTMLInputElement>(null);
  const fileInputRefRaw = useRef<HTMLInputElement>(null);
  
  const viewport1Ref = useRef<HTMLDivElement>(null);
  const viewport2Ref = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);

  const handleScroll = (source: 1 | 2) => {
    if (isSyncing.current) return;
    const v1 = viewport1Ref.current;
    const v2 = viewport2Ref.current;
    if (!v1 || !v2) return;

    isSyncing.current = true;
    if (source === 1) {
      v2.scrollTop = v1.scrollTop;
      v2.scrollLeft = v1.scrollLeft;
    } else {
      v1.scrollTop = v2.scrollTop;
      v1.scrollLeft = v2.scrollLeft;
    }
    requestAnimationFrame(() => { isSyncing.current = false; });
  };

  const handleZoomIn = () => {
    setIsFit(false);
    setZoom(z => Math.min(z * 1.5, 32));
  };

  const handleZoomOut = () => {
    setIsFit(false);
    setZoom(z => Math.max(z / 1.5, 0.1));
  };

  const toggleFit = () => {
    if (isFit) {
       setIsFit(false);
       setZoom(1);
    } else {
       setIsFit(true);
    }
  };
  
  // --- Input Handlers ---

  const loadInputFromImageData = (imageData: ImageData, mode: 'lab' | 'synthetic') => {
    const cfa = simulateCFA(imageData, 'bayer', 'RGGB'); 
    setInput({
      mode: mode,
      groundTruthRGB: imageData,
      cfaPattern: 'bayer',
      cfaPatternMeta: { tileW: 2, tileH: 2, layout: 'RGGB' },
      cfaData: cfa,
      width: imageData.width,
      height: imageData.height
    });
    setCfaType('bayer');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await downsizeImageToDataURL(file, 800, 0.9);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        loadInputFromImageData(imageData, 'lab');
      };
      img.src = dataUrl;
    } catch (err) {
      console.error(err);
    }
  };

  const handleDNGUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dngInput = await decodeDNG(file);
      setInput(dngInput);
      setCfaType('bayer');
    } catch (err) {
      console.error("DNG Decode failed", err);
      alert("Failed to decode DNG. Ensure it's a valid raw file.");
    }
  };

  const handleSyntheticSelect = (type: string) => {
    setSyntheticType(type);
    const w = 512, h = 512;
    let img: ImageData | null = null;
    if (type === 'zoneplate') img = createZonePlate(w, h);
    else if (type === 'checker') img = createFineCheckerboard(w, h, 2);
    else if (type === 'sweep') img = createColorSweep(w, h);
    else if (type === 'star') img = createStarburst(w, h);
    if (img) loadInputFromImageData(img, 'synthetic');
  };
  
  // Sync input CFA when user changes CFA Type
  useEffect(() => {
    if (!input || input.mode === 'raw' || !input.groundTruthRGB) return;
    if (input.cfaPattern === cfaType) return;
    const newCfa = simulateCFA(input.groundTruthRGB, cfaType);
    setInput(prev => prev ? ({
      ...prev,
      cfaPattern: cfaType,
      cfaPatternMeta: {
        tileW: cfaType === 'xtrans' ? 6 : 2,
        tileH: cfaType === 'xtrans' ? 6 : 2,
        layout: cfaType === 'bayer' ? 'RGGB' : 'custom'
      },
      cfaData: newCfa
    }) : null);
  }, [cfaType, input]);

  // Generate CFA Visualization Image
  useEffect(() => {
    if (!input) {
        setCfaImage(null);
        return;
    }
    // Create an RGB visualization of the CFA
    const img = new ImageData(input.width, input.height);
    const { cfaData, cfaPatternMeta, cfaPattern } = input;
    
    // Need to know channel at each pixel
    // Re-importing kernel functions is hard inside useEffect, duplicate logic or import?
    // We'll reuse the getBayerKernel/getXTransKernel if we can, or simple check.
    
    // Simple render:
    // Bayer: R -> (v,0,0), G -> (0,v,0), B -> (0,0,v)
    
    // We need the channel map logic.
    // For MVP speed, let's just hardcode or use a helper if available.
    // But `cfa.ts` is available.
    
    // Let's just map it simply for now based on Bayer RGGB assumption if bayer
    // Or better, use the cfaPatternMeta
    
    for (let y = 0; y < input.height; y++) {
        for (let x = 0; x < input.width; x++) {
            const v = cfaData[y * input.width + x] * 255;
            const idx = (y * input.width + x) * 4;
            
            // Determine color
            let isR = false, isG = false, isB = false;
            
            if (cfaPattern === 'bayer') {
                // RGGB
                const isEvenY = y % 2 === 0;
                const isEvenX = x % 2 === 0;
                if (isEvenY) {
                    if (isEvenX) isR = true; else isG = true;
                } else if (isEvenX) {
                    isG = true;
                } else {
                    isB = true;
                }
            } else if (cfaPattern === 'xtrans') {
                // 6x6 Pattern
                const pattern = [
                    ['g', 'r', 'g', 'g', 'b', 'g'],
                    ['b', 'g', 'b', 'r', 'g', 'r'],
                    ['g', 'r', 'g', 'g', 'b', 'g'],
                    ['g', 'b', 'g', 'g', 'r', 'g'],
                    ['r', 'g', 'r', 'b', 'g', 'b'],
                    ['g', 'b', 'g', 'g', 'r', 'g'],
                ];
                const ch = pattern[y % 6][x % 6];
                if (ch === 'r') isR = true;
                else if (ch === 'g') isG = true;
                else isB = true;
            }
            
            img.data[idx] = isR ? v : 0;
            img.data[idx+1] = isG ? v : 0;
            img.data[idx+2] = isB ? v : 0;
            img.data[idx+3] = 255;
        }
    }
    setCfaImage(img);
  }, [input]);

  // Helper to run demosaic
  const runDemosaic = useCallback((inp: DemosaicInput, algo: DemosaicAlgorithm) => {
    if (inp.cfaPattern === 'bayer') {
      if (algo === 'nearest') return demosaicBayerNearest(inp);
      if (algo === 'bilinear') return demosaicBayerBilinear(inp);
    } else if (inp.cfaPattern === 'xtrans') {
      return demosaicXTransBasic(inp);
    }
    return new ImageData(inp.width, inp.height);
  }, []);

  // Pipeline 1
  useEffect(() => {
    if (!input) return;
    const result = runDemosaic(input, algorithm);
    setOutputImage(result);
    if ((input.mode === 'lab' || input.mode === 'synthetic') && input.groundTruthRGB) {
      setErrorStats(computeErrorStats(input.groundTruthRGB, result));
    } else {
      setErrorStats(null);
    }
  }, [input, algorithm, cfaType, runDemosaic]);

  // Pipeline 2 (Comparison)
  useEffect(() => {
    if (!input || !comparisonMode) {
        setOutputImage2(null);
        return;
    }
    const result = runDemosaic(input, algorithm2);
    setOutputImage2(result);
    if ((input.mode === 'lab' || input.mode === 'synthetic') && input.groundTruthRGB) {
      setErrorStats2(computeErrorStats(input.groundTruthRGB, result));
    } else {
      setErrorStats2(null);
    }
  }, [input, algorithm2, cfaType, comparisonMode, runDemosaic]);

  // Trace effect
  useEffect(() => {
    if (!selectedPos || !input) {
      setTrace([]);
      setTrace2([]);
      return;
    }
    const { x, y } = selectedPos;
    
    setTrace(getPixelTrace(input, x, y, algorithm));
    
    if (comparisonMode) {
        setTrace2(getPixelTrace(input, x, y, algorithm2));
    } else {
        setTrace2([]);
    }
  }, [selectedPos, input, algorithm, algorithm2, comparisonMode]);

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <header className="text-center py-4 bg-background shrink-0">
        <h1 className="text-4xl font-bold text-foreground">DemosaicLab</h1>
        <p className="text-muted-foreground">Raw sensor data reconstruction playground</p>
      </header>
      
      <main className="flex-1 p-4 lg:p-6 min-h-0 pt-2">
        <div className="w-full h-full max-w-[1600px] mx-auto grid lg:grid-cols-12 gap-6">
          
          {/* Left Panel: Controls */}
          <div className="lg:col-span-3 flex flex-col gap-6 h-full overflow-y-auto pr-2 min-w-0">
            {/* Input Section */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
                  Input Source
                </h2>
              </CardHeader>
              <CardContent className="space-y-4">
                 <div className="space-y-2">
                    <label className="text-xs font-medium flex items-center gap-2">
                      Mode
                      <HelpTooltip className="h-3 w-3" content="
                        Synthetic: Mathematical patterns to test algorithms.
                        Real Raw: Actual sensor data from DNG files.
                        Lab: Standard images (JPG/PNG) treated as ground truth to simulate sensor sampling.
                      " />
                    </label>
                    <Select value={uiMode} onValueChange={(v: any) => setUiMode(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="synthetic">Synthetic (demo)</SelectItem>
                        <SelectItem value="raw">Real Raw</SelectItem>
                        <SelectItem value="lab">Lab</SelectItem>
                      </SelectContent>
                    </Select>
                 </div>

                 {uiMode === 'synthetic' && (
                   <div className="pt-2 animate-in fade-in slide-in-from-top-1">
                      <label className="text-xs font-medium mb-2 text-muted-foreground flex items-center gap-2">
                        Synthetic Patterns
                        <HelpTooltip className="h-3 w-3" content="Procedurally generated patterns designed to stress-test demosaicing algorithms. Zone plates show Moiré, Starbursts show edge handling." />
                      </label>
                      <Select onValueChange={handleSyntheticSelect}>
                        <SelectTrigger><SelectValue placeholder="Select Pattern..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="zoneplate">Zone Plate (Moiré)</SelectItem>
                          <SelectItem value="checker">Fine Checkerboard</SelectItem>
                          <SelectItem value="sweep">Color Sweep</SelectItem>
                          <SelectItem value="star">Starburst</SelectItem>
                        </SelectContent>
                      </Select>
                   </div>
                 )}

                 {uiMode === 'lab' && (
                   <div className="pt-2 animate-in fade-in slide-in-from-top-1">
                      <Button variant="outline" className="w-full h-24 flex flex-col gap-2 border-dashed" onClick={() => fileInputRefLab.current?.click()}>
                         <ImageIcon className="w-8 h-8 mb-1 text-muted-foreground" />
                         <div className="text-center">
                           <span className="text-xs block font-medium">Upload Lab Image</span>
                           <span className="text-[10px] text-muted-foreground">(JPEG, PNG)</span>
                         </div>
                      </Button>
                      <input ref={fileInputRefLab} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                      <p className="text-[10px] text-muted-foreground mt-2 text-center leading-tight px-1">
                        Images are converted to a simulated raw sensor mosaic (CFA) and then reconstructed. This allows comparing algorithms against the original ground truth.
                      </p>
                   </div>
                 )}

                 {uiMode === 'raw' && (
                   <div className="pt-2 animate-in fade-in slide-in-from-top-1">
                      <Button variant="outline" className="w-full h-24 flex flex-col gap-2 border-dashed" onClick={() => fileInputRefRaw.current?.click()}>
                         <FileCode className="w-8 h-8 mb-1 text-muted-foreground" />
                         <div className="text-center">
                           <span className="text-xs block font-medium">Upload RAW File</span>
                           <span className="text-[10px] text-muted-foreground">(DNG)</span>
                         </div>
                      </Button>
                      <input ref={fileInputRefRaw} type="file" accept=".dng,.tif" className="hidden" onChange={handleDNGUpload} />
                   </div>
                 )}

                 {input && (
                   <div className="bg-muted/50 rounded p-2 text-xs font-mono flex justify-between mt-2">
                      <span>{input.width} x {input.height}</span><span className="uppercase">{input.mode} Mode</span>
                   </div>
                 )}
              </CardContent>
            </Card>

            {/* Demosaicing Controls */}
            <Card className="flex-1 bg-card border-border">
               <CardHeader className="pb-3">
                 <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
                   Demosaicing
                 </h2>
               </CardHeader>
               <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-medium flex items-center gap-2"><Grid3X3 className="w-3 h-3" /> CFA Pattern</label>
                    <Select value={cfaType} onValueChange={(v) => setCfaType(v as CFAType)} disabled={input?.mode === 'raw'}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bayer">Bayer (RGGB)</SelectItem>
                        <SelectItem value="xtrans">X-Trans (6x6)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-4 pt-2 border-t">
                     <div className="flex items-center justify-between">
                        <label className="text-xs font-medium flex items-center gap-2"><Columns className="w-3 h-3" /> Compare Mode</label>
                        <Switch checked={comparisonMode} onCheckedChange={setComparisonMode} />
                     </div>
                  </div>

                  <div className="space-y-2 bg-muted/30 p-2 rounded border border-border/50">
                    <label className="text-xs font-medium text-primary">Algorithm A (Left)</label>
                    <Select value={algorithm} onValueChange={(v) => setAlgorithm(v as DemosaicAlgorithm)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nearest">Nearest Neighbor</SelectItem>
                        <SelectItem value="bilinear">Bilinear Interpolation</SelectItem>
                        {/* <SelectItem value="malvar">Malvar (High Quality)</SelectItem> */}
                      </SelectContent>
                    </Select>
                    {errorStats && (
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                            <div className="flex items-center gap-1">
                               <span>PSNR: {errorStats.psnr.total.toFixed(2)} dB</span>
                               <HelpTooltip className="h-3 w-3" content="Peak Signal-to-Noise Ratio. Higher is better. Measures quality of reconstruction." />
                            </div>
                            <div className="flex items-center gap-1">
                               <span>MSE: {errorStats.mse.total.toFixed(2)}</span>
                               <HelpTooltip className="h-3 w-3" content="Mean Squared Error. Lower is better. Average squared difference between estimated and true pixel values." />
                            </div>
                        </div>
                    )}
                  </div>

                  {comparisonMode && (
                      <div className="space-y-2 bg-muted/30 p-2 rounded border border-border/50 animate-in fade-in slide-in-from-top-2">
                        <label className="text-xs font-medium text-primary">Algorithm B (Right)</label>
                        <Select value={algorithm2} onValueChange={(v) => setAlgorithm2(v as DemosaicAlgorithm)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nearest">Nearest Neighbor</SelectItem>
                            <SelectItem value="bilinear">Bilinear Interpolation</SelectItem>
                          </SelectContent>
                        </Select>
                        {errorStats2 && (
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                                <div className="flex items-center gap-1">
                                   <span>PSNR: {errorStats2.psnr.total.toFixed(2)} dB</span>
                                   <HelpTooltip className="h-3 w-3" content="Peak Signal-to-Noise Ratio. Higher is better. Measures quality of reconstruction." />
                                </div>
                                <div className="flex items-center gap-1">
                                   <span>MSE: {errorStats2.mse.total.toFixed(2)}</span>
                                   <HelpTooltip className="h-3 w-3" content="Mean Squared Error. Lower is better. Average squared difference between estimated and true pixel values." />
                                </div>
                            </div>
                        )}
                      </div>
                  )}
                  
                  <Separator />
                  
                  <div className="space-y-4">
                     <div className="flex items-center justify-between">
                        <label className="text-xs font-medium flex items-center gap-2">
                          Show CFA Mosaic
                          <HelpTooltip className="h-3 w-3" content="Overlays the raw Color Filter Array pattern on top of the image. Use this to see which pixels are actually Red, Green, or Blue before interpolation." />
                        </label>
                        <Switch checked={showCFA} onCheckedChange={setShowCFA} />
                     </div>
                  </div>
               </CardContent>
            </Card>
          </div>
          
          {/* Center Panel: Canvas */}
          <div className="lg:col-span-6 xl:col-span-5 flex flex-col h-full min-w-0 overflow-hidden">
            <Card className="h-full flex flex-col border-border shadow-sm bg-card overflow-hidden">
              <div className={`flex-1 relative min-w-0 min-h-0 overflow-hidden ${comparisonMode ? 'grid grid-cols-2 divide-x divide-border' : ''}`}>
                 {/* Viewport 1 */}
                 <div className="relative h-full w-full min-w-0 overflow-hidden">
                     <div 
                        ref={viewport1Ref}
                        onScroll={() => handleScroll(1)}
                        className={`absolute inset-0 ${!isFit ? 'overflow-auto' : 'overflow-hidden'} bg-[url('/placeholder.svg')] bg-repeat bg-[length:20px_20px]`}
                     >
                        <div className="absolute inset-0 opacity-5 pointer-events-none bg-[linear-gradient(45deg,#000_25%,transparent_25%,transparent_75%,#000_75%,#000),linear-gradient(45deg,#000_25%,transparent_25%,transparent_75%,#000_75%,#000)] bg-[length:20px_20px] bg-[position:0_0,10px_10px]"></div>
                        <div className="min-w-full min-h-full p-4 flex">
                            <div className="m-auto">
                                {outputImage ? (
                                    <div className="relative">
                                       <DemosaicCanvas 
                                          image={showCFA && cfaImage ? cfaImage : outputImage} 
                                          width={input!.width} 
                                          height={input!.height}
                                          className={isFit 
                                            ? "max-w-full max-h-full object-contain shadow-2xl border border-border" 
                                            : "shadow-2xl border border-border block"}
                                          style={!isFit ? { width: input!.width * zoom, height: input!.height * zoom } : undefined}
                                          onPixelHover={(x, y) => setHoverPos(x >= 0 ? {x, y} : null)}
                                          onPixelClick={(x, y) => setSelectedPos({x, y})}
                                       />
                                       {comparisonMode && <div className="absolute top-2 left-2 bg-background/80 backdrop-blur px-2 py-1 rounded text-[10px] font-mono border border-border z-10 pointer-events-none">Algo A</div>}
                                    </div>
                                ) : (
                                   <div className="text-center space-y-4 z-10">
                                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto border-2 border-dashed border-muted-foreground/50"><ImageIcon className="w-8 h-8 text-muted-foreground" /></div>
                                      <div className="text-muted-foreground font-medium">No Image Loaded</div>
                                      <p className="text-xs text-muted-foreground max-w-xs mx-auto">Upload a Lab image, RAW file, or select a synthetic pattern to start.</p>
                                   </div>
                                )}
                            </div>
                        </div>
                     </div>
                 </div>

                 {/* Viewport 2 (Comparison) */}
                 {comparisonMode && (
                     <div className="relative h-full w-full min-w-0 overflow-hidden">
                         <div 
                            ref={viewport2Ref}
                            onScroll={() => handleScroll(2)}
                            className={`absolute inset-0 ${!isFit ? 'overflow-auto' : 'overflow-hidden'} bg-[url('/placeholder.svg')] bg-repeat bg-[length:20px_20px]`}
                         >
                            <div className="absolute inset-0 opacity-5 pointer-events-none bg-[linear-gradient(45deg,#000_25%,transparent_25%,transparent_75%,#000_75%,#000),linear-gradient(45deg,#000_25%,transparent_25%,transparent_75%,#000_75%,#000)] bg-[length:20px_20px] bg-[position:0_0,10px_10px]"></div>
                            <div className="min-w-full min-h-full p-4 flex">
                                <div className="m-auto">
                                    {outputImage2 ? (
                                        <div className="relative">
                                           <DemosaicCanvas 
                                              image={showCFA && cfaImage ? cfaImage : outputImage2} 
                                              width={input!.width} 
                                              height={input!.height}
                                              className={isFit 
                                                ? "max-w-full max-h-full object-contain shadow-2xl border border-border" 
                                                : "shadow-2xl border border-border block"}
                                              style={!isFit ? { width: input!.width * zoom, height: input!.height * zoom } : undefined}
                                              onPixelHover={(x, y) => setHoverPos(x >= 0 ? {x, y} : null)}
                                              onPixelClick={(x, y) => setSelectedPos({x, y})}
                                           />
                                           <div className="absolute top-2 left-2 bg-background/80 backdrop-blur px-2 py-1 rounded text-[10px] font-mono border border-border z-10 pointer-events-none">Algo B</div>
                                        </div>
                                    ) : (
                                        <div className="text-center text-muted-foreground text-xs">No Output</div>
                                    )}
                                </div>
                            </div>
                         </div>
                     </div>
                 )}
              </div>
              
              <div className="h-12 border-t bg-card flex items-center justify-between px-4 shrink-0">
                 <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Zoom:</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomOut}><ZoomOut className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 font-mono w-16 text-center text-xs" onClick={toggleFit}>
                       {isFit ? "FIT" : `${Math.round(zoom * 100)}%`}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomIn}><ZoomIn className="w-4 h-4" /></Button>
                 </div>
                 {hoverPos && <div className="font-mono text-xs text-muted-foreground">x: {hoverPos.x}, y: {hoverPos.y}</div>}
              </div>
            </Card>
          </div>

          {/* Right Panel: Math & Inspector */}
          <div className="lg:col-span-3 xl:col-span-4 h-full overflow-y-auto min-w-0">
            {/* If comparison mode, show condensed traces or tabs? For simplicity, show Tab 1 / Tab 2 */}
            {comparisonMode ? (
                <div className="space-y-4">
                    <DemosaicMathExplanation 
                      cfaType={cfaType}
                      algorithm={algorithm}
                      trace={trace}
                      x={selectedPos?.x}
                      y={selectedPos?.y}
                      error={selectedPos && errorStats && (input?.mode === 'lab' || input?.mode === 'synthetic') ? {
                        rgb: { r: 0, g: 0, b: 0 },
                        l2: errorStats.l2Map ? errorStats.l2Map[selectedPos.y * input!.width + selectedPos.x] : 0
                      } : undefined}
                      errorStats={errorStats}
                      input={input}
                    />
                    <div className="text-center text-xs font-medium pt-2 border-t">Algorithm B</div>
                    <DemosaicMathExplanation 
                      cfaType={cfaType}
                      algorithm={algorithm2}
                      trace={trace2}
                      x={selectedPos?.x}
                      y={selectedPos?.y}
                      error={selectedPos && errorStats2 && (input?.mode === 'lab' || input?.mode === 'synthetic') ? {
                        rgb: { r: 0, g: 0, b: 0 },
                        l2: errorStats2.l2Map ? errorStats2.l2Map[selectedPos.y * input!.width + selectedPos.x] : 0
                      } : undefined}
                      errorStats={errorStats2}
                      input={input}
                    />
                </div>
            ) : (
                <DemosaicMathExplanation 
                  cfaType={cfaType}
                  algorithm={algorithm}
                  trace={trace}
                  x={selectedPos?.x}
                  y={selectedPos?.y}
                  error={selectedPos && errorStats && (input?.mode === 'lab' || input?.mode === 'synthetic') ? {
                    rgb: { r: 0, g: 0, b: 0 },
                    l2: errorStats.l2Map ? errorStats.l2Map[selectedPos.y * input!.width + selectedPos.x] : 0
                  } : undefined}
                  errorStats={errorStats}
                  input={input}
                />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
