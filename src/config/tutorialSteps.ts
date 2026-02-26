import type { ReactNode } from "react";

export type TutorialTarget =
  | "center-overlay"
  | "mode-panel"
  | "image-panel"
  | "cfa-panel"
  | "algorithm-panel"
  | "canvas-panel"
  | "math-panel"
  | "view-panel";

export interface TutorialStep {
  id:
    | "welcome"
    | "mode"
    | "image"
    | "cfa"
    | "algorithm"
    | "canvas"
    | "math"
    | "comparison"
    | "finish";
  title: string;
  body: ReactNode;
  target: TutorialTarget;
}

export const tutorialSteps: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to DemosaicLab",
    target: "center-overlay",
    body: "DemosaicLab lets you explore how cameras reconstruct full-color images from a single-channel mosaic sensor. This tour walks you through the interface.",
  },
  {
    id: "mode",
    title: "Choose an input mode",
    target: "mode-panel",
    body: "Pick Synthetic to use procedural test patterns (zone plates, starbursts, etc.), JPEG Lab to upload an image as ground truth, or Real Raw to load actual DNG sensor data.",
  },
  {
    id: "image",
    title: "Select or upload an image",
    target: "image-panel",
    body: "In Synthetic mode, choose a pattern from the dropdown. In JPEG Lab or Real Raw mode, upload a file. The image will be sampled through a color filter array and then reconstructed.",
  },
  {
    id: "cfa",
    title: "Choose a color filter array",
    target: "cfa-panel",
    body: "Switch between Bayer (2×2 RGGB) and X-Trans (6×6) patterns. The CFA determines how the sensor samples color — different patterns affect demosaicing quality and artifact types.",
  },
  {
    id: "algorithm",
    title: "Pick a demosaicing algorithm",
    target: "algorithm-panel",
    body: "Compare algorithms from simple (Nearest Neighbor, Bilinear) to advanced (Edge Sensing, Hamilton-Adams, Polynomial, Residual Interpolation). Each trades speed for quality differently. PSNR and MSE scores show reconstruction accuracy.",
  },
  {
    id: "canvas",
    title: "Inspect the result",
    target: "canvas-panel",
    body: "The canvas shows Original, CFA mosaic, or Reconstruction views. Click any pixel to inspect its value. Use Ctrl+scroll to zoom and drag to pan. The zoom bar at the bottom switches between Fit and pixel-level zoom.",
  },
  {
    id: "math",
    title: "Math & error analysis",
    target: "math-panel",
    body: "The right panel shows the mathematical steps of the selected algorithm for the clicked pixel position, plus per-pixel error metrics when ground truth is available.",
  },
  {
    id: "comparison",
    title: "Comparison mode",
    target: "view-panel",
    body: "Enable Comparison Mode to view two algorithms or CFA patterns side by side (or 4-up). Viewports scroll in sync so you can spot differences at the same pixel location. Try the Benchmark button for automated batch testing.",
  },
  {
    id: "finish",
    title: "You're ready to explore demosaicing",
    target: "center-overlay",
    body: "Load an image, pick a CFA and algorithm, zoom into edges and fine detail, and compare reconstruction quality. You can re-open this tour anytime from the header.",
  },
];

export const getFirstTutorialStepId = (): TutorialStep["id"] | null =>
  tutorialSteps.length > 0 ? tutorialSteps[0].id : null;

export const getTutorialStepById = (
  id: TutorialStep["id"] | null | undefined,
): TutorialStep | null =>
  id ? tutorialSteps.find((step) => step.id === id) ?? null : null;
