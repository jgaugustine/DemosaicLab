import { useEffect, useRef, useState } from 'react';
import { PixelRGB } from '@/types/demosaic';

interface DemosaicCanvasProps {
  image?: ImageData;
  width: number;
  height: number;
  onPixelHover?: (x: number, y: number) => void;
  onPixelClick?: (x: number, y: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function DemosaicCanvas({ 
  image, 
  width, 
  height, 
  onPixelHover,
  onPixelClick,
  className,
  style
}: DemosaicCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = width;
    canvas.height = height;
    
    ctx.putImageData(image, 0, 0);
  }, [image, width, height]);

  // Calculate visual scale to correctly map mouse coordinates
  useEffect(() => {
    const handleResize = () => {
        if (canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            // If the canvas element is smaller than the image, we are scaled down
            // But wait, the canvas intrinsic size is width/height.
            // The CSS size is rect.width/rect.height.
            // So the scale factor from Screen -> Image is width / rect.width
            // We don't need to store this in state for mouse move, we calculate on fly.
        }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPixelHover || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Map visual coordinates to image coordinates
    // Image W/H are intrinsics. Rect W/H are display.
    
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    
    if (x >= 0 && x < width && y >= 0 && y < height) {
      onPixelHover(x, y);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPixelClick || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    
    if (x >= 0 && x < width && y >= 0 && y < height) {
      onPixelClick(x, y);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className={`${className} image-pixelated cursor-crosshair`}
      style={{ imageRendering: 'pixelated', ...style }} // Critical for pixel peeping
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      onMouseLeave={() => onPixelHover?.(-1, -1)} // Reset on leave
    />
  );
}
