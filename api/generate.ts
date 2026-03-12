import { VercelRequest, VercelResponse } from '@vercel/node';
import { Canvas, loadImage, FontLibrary } from 'skia-canvas';
import path from 'path';
import fs from 'fs';

// Constants from src/settings.ts
const settings = {
  canvasHeight: 250,
  canvasWidth: 900,
  fontSize: 84,
  textBaseLine: 0.68,
  horizontalTilt: -0.4,
  paddingX: 10,
  graphOffset: { X: -15, Y: 0 },
  hollowPath: [
    [284, 136],
    [321, 153],
    [159, 410],
    [148, 403],
  ],
};

// Attempt to register fonts if they exist
const fontDir = path.join(process.cwd(), 'public/fonts/RoGSans');
if (fs.existsSync(fontDir)) {
  const fonts = fs.readdirSync(fontDir).filter(f => f.endsWith('.woff2') || f.endsWith('.otf') || f.endsWith('.ttf'));
  for (const font of fonts) {
    try {
      FontLibrary.use(path.join(fontDir, font));
    } catch (e) {
      console.error(`Failed to load font ${font}:`, e);
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const {
      textL = 'Blue',
      textR = 'Archive',
      transparent = 'false',
      graphX = '-15',
      graphY = '0'
    } = req.query;

    const isTransparent = transparent === 'true';
    const gX = parseInt(graphX as string);
    const gY = parseInt(graphY as string);

    // Path to assets
    const haloPath = path.join(process.cwd(), 'src/assets/image/halo.png');
    const crossPath = path.join(process.cwd(), 'src/assets/image/cross.png');

    // Load images
    const [halo, cross] = await Promise.all([
      loadImage(haloPath),
      loadImage(crossPath)
    ]);

    // Create a temporary canvas to measure text
    const tempCanvas = new Canvas(settings.canvasWidth, settings.canvasHeight);
    const tempCtx = tempCanvas.getContext('2d');
    const font = `${settings.fontSize}px RoGSanSrfStd-Bd, "GlowSansSC-Normal-Heavy_diff", sans-serif`;
    tempCtx.font = font;

    const textMetricsL = tempCtx.measureText(textL as string);
    const textMetricsR = tempCtx.measureText(textR as string);

    // Calculate widths (simplified port from canvas.ts)
    // In skia-canvas, the metrics might differ slightly from browser
    let textWidthL = textMetricsL.width - (settings.textBaseLine * settings.canvasHeight) * settings.horizontalTilt;
    let textWidthR = textMetricsR.width + (settings.textBaseLine * settings.canvasHeight) * settings.horizontalTilt;
    
    const canvasWidthL = Math.max(textWidthL + settings.paddingX, settings.canvasWidth / 2);
    const canvasWidthR = Math.max(textWidthR + settings.paddingX, settings.canvasWidth / 2);
    
    // Final canvas
    const canvas = new Canvas(canvasWidthL + canvasWidthR, settings.canvasHeight);
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    
    // Clear/Background
    if (!isTransparent) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw Blue Text
    ctx.fillStyle = '#128AFA';
    ctx.textAlign = 'end';
    ctx.setTransform(1, 0, settings.horizontalTilt, 1, 0, 0);
    ctx.fillText(textL as string, canvasWidthL, settings.canvasHeight * settings.textBaseLine);
    
    // Draw Halo
    ctx.resetTransform();
    ctx.drawImage(
      halo,
      canvasWidthL - settings.canvasHeight / 2 + gX,
      gY,
      settings.canvasHeight,
      settings.canvasHeight
    );

    // Draw Black Text
    ctx.fillStyle = '#2B2B2B';
    ctx.textAlign = 'start';
    if (isTransparent) {
      // In skia-canvas, destination-out works similarly
      ctx.globalCompositeOperation = 'destination-out';
    }
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 12;
    ctx.setTransform(1, 0, settings.horizontalTilt, 1, 0, 0);
    ctx.strokeText(textR as string, canvasWidthL, settings.canvasHeight * settings.textBaseLine);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillText(textR as string, canvasWidthL, settings.canvasHeight * settings.textBaseLine);
    
    // Draw Hollow Path
    ctx.resetTransform();
    const graph = {
      X: canvasWidthL - settings.canvasHeight / 2 + settings.graphOffset.X,
      Y: gY,
    };
    ctx.beginPath();
    ctx.moveTo(
      graph.X + (settings.hollowPath[0][0] / 500) * settings.canvasHeight,
      graph.Y + (settings.hollowPath[0][1] / 500) * settings.canvasHeight
    );
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(
        graph.X + (settings.hollowPath[i][0] / 500) * settings.canvasHeight,
        graph.Y + (settings.hollowPath[i][1] / 500) * settings.canvasHeight
      );
    }
    ctx.closePath();
    if (isTransparent) {
      ctx.globalCompositeOperation = 'destination-out';
    }
    ctx.fillStyle = 'white';
    ctx.fill();
    
    // Draw Cross
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(
      cross,
      canvasWidthL - settings.canvasHeight / 2 + settings.graphOffset.X,
      gY,
      settings.canvasHeight,
      settings.canvasHeight
    );

    // Output image
    const buffer = await canvas.toBuffer('png');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 's-maxage=86400');
    res.status(200).send(buffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate logo' });
  }
}
