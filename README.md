# DemosaicLab

DemosaicLab is an educational tool designed to help users understand how **demosaicing algorithms** work. It allows you to visualize the reconstruction of color images from raw sensor data (CFA mosaics) using various algorithms like Nearest Neighbor, Bilinear Interpolation, and more.

## Features

### 1. Input Modes
*   **Lab / Synthetic Mode**: Upload any standard image (JPEG/PNG) or generate synthetic test patterns (Zone Plate, Checkerboard, etc.). The tool treats this image as **Ground Truth**, simulates a sensor CFA (Bayer or X-Trans), and then reconstructs it. This allows for precise error calculation (MSE, PSNR).
*   **Real RAW Mode**: Upload raw **DNG** files directly. The tool extracts the raw CFA data and allows you to demosaic it. Since there is no ground truth, error metrics are disabled, but you can inspect the raw pixel values.

### 2. Algorithms (Implemented from Scratch)
All demosaicing logic is implemented in pure TypeScript with no external image processing libraries, ensuring the code is transparent and educational.
*   **Nearest Neighbor**: Fast but prone to artifacts.
*   **Bilinear Interpolation**: Standard baseline for smooth reconstruction.
*   **X-Trans Basic**: A fundamental interpolation for Fujifilm's 6x6 sensor pattern.

### 3. Pixel-Level Inspection
*   **Zoom In**: See the individual pixels of the reconstructed image or the raw CFA mosaic.

### 4. Side-by-Side Comparison
*   Compare two different algorithms (e.g., Nearest vs. Bilinear) side-by-side on the same image to easily spot differences in edge handling and artifacts.

## How to Run

This is a standard Vite + React application.

```bash
cd DemosaicLab
npm install
npm run dev
```

## Implementation Details

*   **CFA Simulation**: `src/lib/cfa.ts`
*   **Demosaicers**: `src/lib/demosaic.ts` (contains all the pixel math)
*   **DNG Decoding**: Uses `utif.js` to extract raw buffer data.

## Limitations

*   **RAW Support**: Currently limited to uncompressed or standard DNG files. Proprietary RAW formats (CR2, NEF, RAF) must be converted to DNG first.
*   **Performance**: Algorithms run in JavaScript on the main thread. Very large images (>20MP) are downscaled upon load to ensure the UI remains responsive.

