import sharp from 'sharp';
import { createCanvas, registerFont, CanvasRenderingContext2D } from 'canvas';
import path from 'path';
import { TextBlock } from './types';

// Register Inter font
const fontDir = path.join(process.cwd(), 'public', 'fonts');

let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  try {
    registerFont(path.join(fontDir, 'Inter-Bold.ttf'), { family: 'Inter', weight: 'bold' });
    registerFont(path.join(fontDir, 'Inter-Regular.ttf'), { family: 'Inter', weight: 'normal' });
    fontsRegistered = true;
  } catch {
    console.warn('Font registration failed, using system fonts');
  }
}

interface Size {
  width: number;
  height: number;
}

const FEED_SIZE: Size = { width: 1080, height: 1350 };
const STORY_SIZE: Size = { width: 1080, height: 1920 };

const TEXT_SIZES = {
  large: { primary: 76, secondary: 46 },
  standard: { primary: 52, secondary: 34 },
  small: { primary: 42, secondary: 28 },
};

const PLACEMENT_ZONES: Record<string, { x: number; yMin: number; yMax: number; align: CanvasTextAlign }> = {
  'top-center-safe': { x: 0.5, yMin: 0.17, yMax: 0.30, align: 'center' },
  'top-left-safe': { x: 0.10, yMin: 0.17, yMax: 0.30, align: 'left' },
  'top-right-safe': { x: 0.90, yMin: 0.17, yMax: 0.30, align: 'right' },
  'center-safe': { x: 0.5, yMin: 0.35, yMax: 0.65, align: 'center' },
  'center-left-safe': { x: 0.10, yMin: 0.35, yMax: 0.65, align: 'left' },
  'center-right-safe': { x: 0.90, yMin: 0.35, yMax: 0.65, align: 'right' },
  'bottom-center-safe': { x: 0.5, yMin: 0.70, yMax: 0.83, align: 'center' },
  'bottom-left-safe': { x: 0.10, yMin: 0.70, yMax: 0.83, align: 'left' },
  'bottom-right-safe': { x: 0.90, yMin: 0.70, yMax: 0.83, align: 'right' },
};

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getAverageLuminance(imageData: Buffer, x: number, y: number, w: number, h: number, imgWidth: number): number {
  let total = 0;
  let count = 0;
  const sampleStep = 4;

  for (let sy = y; sy < y + h && sy < imageData.length / (imgWidth * 4); sy += sampleStep) {
    for (let sx = x; sx < x + w && sx < imgWidth; sx += sampleStep) {
      const idx = (sy * imgWidth + sx) * 4;
      if (idx + 2 < imageData.length) {
        const r = imageData[idx];
        const g = imageData[idx + 1];
        const b = imageData[idx + 2];
        total += 0.299 * r + 0.587 * g + 0.114 * b;
        count++;
      }
    }
  }
  return count > 0 ? total / count : 128;
}

function applyCapitalization(text: string, cap: string): string {
  if (cap === 'upper') return text.toUpperCase();
  if (cap === 'sentence') return text;
  return text; // mixed — leave as-is
}

export async function renderTextOnImage(
  imageBuffer: Buffer,
  textBlocks: TextBlock[],
  targetSize: Size
): Promise<Buffer> {
  ensureFonts();

  // Resize/crop image to target size
  const resized = await sharp(imageBuffer)
    .resize(targetSize.width, targetSize.height, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();

  // Get raw pixel data for luminance analysis
  const rawData = await sharp(resized)
    .raw()
    .ensureAlpha()
    .toBuffer();

  const canvas = createCanvas(targetSize.width, targetSize.height);
  const ctx = canvas.getContext('2d');

  // Draw the image onto canvas
  const { createImageData } = require('canvas');
  const img = await loadImageToCanvas(resized, canvas, ctx);

  // Render each text block
  const renderedBoxes: BoundingBox[] = [];

  for (const block of textBlocks) {
    const zone = PLACEMENT_ZONES[block.placement] || PLACEMENT_ZONES['center-safe'];
    const sizes = TEXT_SIZES[block.text_size] || TEXT_SIZES['standard'];
    const fontSize = sizes.primary;
    const isBold = block.capitalization === 'upper' || block.text_size === 'large';
    const fontWeight = isBold ? 'bold' : 'normal';

    const processedText = applyCapitalization(block.text, block.capitalization);
    const lines = processedText.split('\\n').flatMap(l => l.split('\n'));

    const paddingH = 20;
    const paddingV = 12;
    const pillRadius = 20;
    const lineGap = 6;

    ctx.font = `${fontWeight} ${fontSize}px Inter, "Segoe UI", Arial, sans-serif`;

    // Measure all lines
    const lineMeasurements = lines.map(line => {
      const metrics = ctx.measureText(line);
      return {
        text: line,
        width: metrics.width,
        height: fontSize * 1.2,
      };
    });

    // Calculate total block height
    const totalHeight = lineMeasurements.reduce((sum, m) => sum + m.height + paddingV * 2, 0)
      + (lines.length - 1) * lineGap;

    // Position
    const yCenter = (zone.yMin + zone.yMax) / 2 * targetSize.height;
    let startY = yCenter - totalHeight / 2;

    // Check for collisions and adjust
    const maxLineWidth = Math.max(...lineMeasurements.map(m => m.width));
    const blockBox: BoundingBox = {
      x: zone.align === 'center' ? targetSize.width / 2 - (maxLineWidth + paddingH * 2) / 2 :
         zone.align === 'left' ? zone.x * targetSize.width :
         zone.x * targetSize.width - maxLineWidth - paddingH * 2,
      y: startY,
      width: maxLineWidth + paddingH * 2,
      height: totalHeight,
    };

    // Collision avoidance
    for (const existing of renderedBoxes) {
      const gap = 40;
      if (boxesOverlap(blockBox, existing, gap)) {
        if (blockBox.y < existing.y) {
          blockBox.y = existing.y - blockBox.height - gap;
        } else {
          blockBox.y = existing.y + existing.height + gap;
        }
        startY = blockBox.y;
      }
    }

    // Ensure within middle third
    const minY = targetSize.height * 0.12;
    const maxY = targetSize.height * 0.88 - totalHeight;
    startY = Math.max(minY, Math.min(maxY, startY));
    blockBox.y = startY;

    renderedBoxes.push(blockBox);

    // Determine pill color from luminance
    let useDarkPill = block.pill_color === 'dark';
    if (block.style === 'pill') {
      const sampleX = Math.max(0, Math.floor(blockBox.x));
      const sampleY = Math.max(0, Math.floor(startY));
      const sampleW = Math.min(Math.floor(blockBox.width), targetSize.width - sampleX);
      const sampleH = Math.min(Math.floor(totalHeight), targetSize.height - sampleY);

      const luminance = getAverageLuminance(rawData, sampleX, sampleY, sampleW, sampleH, targetSize.width);
      // Override AI suggestion if it would result in poor contrast
      if (luminance > 128) {
        useDarkPill = true; // light background → dark pill
      } else {
        useDarkPill = false; // dark background → light pill
      }
    }

    // Render each line
    let currentY = startY;
    for (const line of lineMeasurements) {
      const lineX = zone.align === 'center' ? targetSize.width / 2 :
                     zone.align === 'left' ? zone.x * targetSize.width + paddingH :
                     zone.x * targetSize.width - paddingH;

      ctx.font = `${fontWeight} ${fontSize}px Inter, "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = zone.align;
      ctx.textBaseline = 'top';

      if (block.style === 'pill') {
        const pillX = zone.align === 'center' ? lineX - line.width / 2 - paddingH :
                       zone.align === 'left' ? lineX - paddingH :
                       lineX - line.width - paddingH;
        const pillY = currentY;
        const pillW = line.width + paddingH * 2;
        const pillH = line.height + paddingV * 2;

        // Draw pill background
        ctx.fillStyle = useDarkPill ? '#000000' : '#FFFFFF';
        roundRect(ctx, pillX, pillY, pillW, pillH, pillRadius);
        ctx.fill();

        // Draw text
        ctx.fillStyle = useDarkPill ? '#FFFFFF' : '#000000';
        ctx.fillText(line.text, lineX, currentY + paddingV);
      } else {
        // Plain white text
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(line.text, lineX, currentY + paddingV);
      }

      currentY += line.height + paddingV * 2 + lineGap;
    }
  }

  return canvas.toBuffer('image/png');
}

async function loadImageToCanvas(
  imageBuffer: Buffer,
  canvas: ReturnType<typeof createCanvas>,
  ctx: CanvasRenderingContext2D
) {
  const { Image } = require('canvas');
  const img = new Image();
  img.src = imageBuffer;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return img;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function boxesOverlap(a: BoundingBox, b: BoundingBox, gap: number): boolean {
  return !(a.x + a.width + gap < b.x ||
           b.x + b.width + gap < a.x ||
           a.y + a.height + gap < b.y ||
           b.y + b.height + gap < a.y);
}

export async function renderFeedImage(imageBuffer: Buffer, textBlocks: TextBlock[]): Promise<Buffer> {
  return renderTextOnImage(imageBuffer, textBlocks, FEED_SIZE);
}

export async function renderStoryImage(imageBuffer: Buffer, textBlocks: TextBlock[]): Promise<Buffer> {
  return renderTextOnImage(imageBuffer, textBlocks, STORY_SIZE);
}
