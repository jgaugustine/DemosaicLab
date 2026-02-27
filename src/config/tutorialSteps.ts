import type { ReactNode } from "react";

export type TutorialTarget =
  | "center-overlay"
  | "image-panel"
  | "zoom-bar"
  | "cfa-panel"
  | "view-panel"
  | "comparison-layout"
  | "comparison-preset"
  | "algorithm-panel"
  | "canvas-panel"
  | "math-panel"
  | "benchmark-btn"
  | "benchmark-config"
  | "benchmark-run-btn"
  | "benchmark-exit-btn";

export type TutorialEvent =
  | "image-loaded"
  | "zoom-changed"
  | "cfa-changed"
  | "view-mode-changed"
  | "algorithm-changed"
  | "comparison-enabled"
  | "comparison-layout-changed"
  | "comparison-preset-changed"
  | "pixel-selected"
  | "benchmark-opened"
  | "benchmark-run"
  | "benchmark-exited";

export interface TutorialStep {
  id:
    | "welcome"
    | "image"
    | "zoom"
    | "cfa"
    | "view-modes"
    | "algorithm"
    | "comparison"
    | "comparison-layout"
    | "comparison-preset"
    | "benchmark"
    | "benchmark-config"
    | "benchmark-run"
    | "benchmark-done"
    | "pixel-inspector"
    | "finish";
  title: string;
  body: ReactNode;
  target: TutorialTarget;
  advanceOn?: TutorialEvent;
}

export const tutorialSteps: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to DemosaicLab",
    target: "center-overlay",
    body: "DemosaicLab lets you explore how cameras reconstruct full-color images from a single-channel mosaic sensor. This hands-on tour will walk you through loading an image, zooming, viewing different CFAs, comparing algorithms, and using the pixel inspector.",
  },
  {
    id: "image",
    title: "Select a synthetic pattern",
    target: "image-panel",
    body: "Start with Synthetic mode and pick a pattern from the dropdown — Zone Plate, Starburst, Color Sweep, etc. Each pattern tests different aspects of demosaicing. The tour will not continue until you've selected a pattern.",
    advanceOn: "image-loaded",
  },
  {
    id: "zoom",
    title: "Learn to zoom",
    target: "center-overlay",
    body: "Use the zoom controls below the canvas: the minus/plus buttons step zoom in and out, or click the FIT/percentage button to toggle fit-to-view vs pixel-level zoom. You can also use Ctrl+scroll on the canvas to zoom. Try zooming in, then press Next.",
  },
  {
    id: "cfa",
    title: "Explore different color filter arrays",
    target: "cfa-panel",
    body: "Switch between Bayer (2×2 RGGB) and X-Trans (6×6) patterns. Each CFA samples color differently — Bayer is common in most cameras; X-Trans reduces moiré. Try switching and see how the mosaic and reconstruction change.",
    advanceOn: "cfa-changed",
  },
  {
    id: "view-modes",
    title: "Switch between Original, CFA, and Reconstruction",
    target: "view-panel",
    body: "The view toggle lets you see the Original (ground truth), the CFA mosaic (what the sensor captures — one color per pixel), and the Reconstruction (demosaiced result). Switch to CFA view to see the raw mosaic, then back to Reconstruction.",
    advanceOn: "view-mode-changed",
  },
  {
    id: "algorithm",
    title: "Try different demosaicing algorithms",
    target: "algorithm-panel",
    body: "Pick from simple algorithms (Nearest Neighbor, Bilinear) to advanced ones (Edge Sensing, Polynomial, Residual Interpolation). PSNR and MSE scores show reconstruction accuracy. Change the algorithm and watch the result update.",
    advanceOn: "algorithm-changed",
  },
  {
    id: "comparison",
    title: "Enable Comparison Mode",
    target: "view-panel",
    body: "Comparison Mode lets you view two or four viewports at once. Turn on the Comparison Mode switch to see side-by-side or 4-up layouts. Enable it now.",
    advanceOn: "comparison-enabled",
  },
  {
    id: "comparison-layout",
    title: "Choose layout",
    target: "comparison-layout",
    body: "Pick Side-by-Side for two viewports, or 4-Up for four viewports in a grid. Layout changes apply immediately. Try switching to see the difference.",
    advanceOn: "comparison-layout-changed",
  },
  {
    id: "comparison-preset",
    title: "Pick a comparison preset",
    target: "comparison-preset",
    body: "Presets define what each viewport shows: Original vs Reconstruction, CFA vs Reconstruction, Algorithm Comparison (algorithms A vs B), CFA Comparison (Bayer vs X-Trans), or Custom. Choose Algorithm Comparison to compare your two selected algorithms.",
    advanceOn: "comparison-preset-changed",
  },
  {
    id: "benchmark",
    title: "Enter Benchmark Mode",
    target: "benchmark-btn",
    body: "Benchmark Mode runs multiple algorithms across CFAs and reports PSNR/MSE scores. Click the Benchmark Mode button to enter.",
    advanceOn: "benchmark-opened",
  },
  {
    id: "benchmark-config",
    title: "Configure your benchmark",
    target: "benchmark-config",
    body: "Select which algorithms and test images to run. You can also pick CFA patterns (Bayer, X-Trans), set iterations, and enable quality metrics. The defaults work well to start.",
  },
  {
    id: "benchmark-run",
    title: "Run the benchmark",
    target: "benchmark-run-btn",
    body: "Click Run Benchmark to execute. The progress bar shows status. Results will appear below when complete. Try running it now.",
    advanceOn: "benchmark-run",
  },
  {
    id: "benchmark-done",
    title: "View results and exit",
    target: "benchmark-exit-btn",
    body: "View results in the Table, Charts, and Error Heatmaps tabs. Export to CSV or JSON if needed. Click Exit Benchmark Mode when you're done to return to the lab.",
    advanceOn: "benchmark-exited",
  },
  {
    id: "pixel-inspector",
    title: "Use the pixel inspector",
    target: "math-panel",
    body: "Click any pixel on the canvas to select it. The right panel shows the math behind the selected algorithm for that pixel — how the CFA samples it and how the algorithm reconstructs the color. PSNR/MSE error maps appear when ground truth is available. Click a pixel now.",
    advanceOn: "pixel-selected",
  },
  {
    id: "finish",
    title: "You're ready to explore demosaicing",
    target: "center-overlay",
    body: "You've loaded an image, zoomed, explored CFAs and view modes, compared algorithms, run benchmarks, and used the pixel inspector. Re-open this tour anytime from the header.",
  },
];

export const getFirstTutorialStepId = (): TutorialStep["id"] | null =>
  tutorialSteps.length > 0 ? tutorialSteps[0].id : null;

export const getTutorialStepById = (
  id: TutorialStep["id"] | null | undefined,
): TutorialStep | null =>
  id ? tutorialSteps.find((step) => step.id === id) ?? null : null;
