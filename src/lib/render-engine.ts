import sharp from 'sharp';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import path from 'path';
import fs from 'fs';
import { TextBlock } from './types';

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

type TextAlign = 'center' | 'left' | 'right';

const PLACEMENT_ZONES: Record<string, { x: number; yMin: number; yMax: number; align: TextAlign }> = {
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

// WASM + font initialization
let wasmInitialized = false;
let interBoldBuffer: Buffer | null = null;
let interRegularBuffer: Buffer | null = null;

async function ensureInitialized() {
  // Load fonts
  if (!interBoldBuffer) {
    const fontDir = path.join(process.cwd(), 'public', 'fonts');
    try {
      interBoldBuffer = fs.readFileSync(path.join(fontDir, 'Inter-Bold.ttf'));
      interRegularBuffer = fs.readFileSync(path.join(fontDir, 'Inter-Regular.ttf'));
    } catch {
      console.warn('Font files not found');
    }
  }

  // Init WASM
  if (!wasmInitialized) {
    try {
      const wasmPath = path.join(
        process.cwd(),
        'node_modules',
        '@resvg',
        'resvg-wasm',
        'index_bg.wasm'
      );
      const wasmBuf = fs.readFileSync(wasmPath);
      await initWasm(wasmBuf);
      wasmInitialized = true;
    } catch (e: unknown) {
      if (e instanceof Error && e.message?.includes('Already initialized')) {
        wasmInitialized = true;
      } else {
        throw e;
      }
    }
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function estimateTextWidth(text: string, fontSize: number, isBold: boolean): number {
  const avgCharWidth = fontSize * (isBold ? 0.62 : 0.58);
  let width = 0;
  for (const char of text) {
    if (char === ' ') width += fontSize * 0.28;
    else if (/[A-Z]/.test(char)) width += avgCharWidth * 1.1;
    else if (/[mwMW]/.test(char)) width += avgCharWidth * 1.3;
    else if (/[iIlj1!|]/.test(char)) width += avgCharWidth * 0.5;
    else if (/[\u{1F000}-\u{1FFFF}]/u.test(char)) width += fontSize * 1.0;
    else width += avgCharWidth;
  }
  return width;
}

function applyCapitalization(text: string, cap: string): string {
  if (cap === 'upper') return text.toUpperCase();
  return text;
}

async function getImageLuminance(
  imageBuffer: Buffer,
  x: number,
  y: number,
  w: number,
  h: number,
  imgWidth: number,
  imgHeight: number
): Promise<number> {
  const sX = Math.max(0, Math.min(Math.floor(x), imgWidth - 1));
  const sY = Math.max(0, Math.min(Math.floor(y), imgHeight - 1));
  const sW = Math.min(Math.max(1, Math.floor(w)), imgWidth - sX);
  const sH = Math.min(Math.max(1, Math.floor(h)), imgHeight - sY);

  try {
    const { data } = await sharp(imageBuffer)
      .extract({ left: sX, top: sY, width: sW, height: sH })
      .resize(1, 1, { fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const r = data[0], g = data[1], b = data[2];
    return 0.299 * r + 0.587 * g + 0.114 * b;
  } catch {
    return 128;
  }
}

function boxesOverlap(a: BoundingBox, b: BoundingBox, gap: number): boolean {
  return !(a.x + a.width + gap < b.x ||
           b.x + b.width + gap < a.x ||
           a.y + a.height + gap < b.y ||
           b.y + b.height + gap < a.y);
}

export async function renderTextOnImage(
  imageBuffer: Buffer,
  textBlocks: TextBlock[],
  targetSize: Size
): Promise<Buffer> {
  await ensureInitialized();

  // Resize/crop image to target size
  const resized = await sharp(imageBuffer)
    .resize(targetSize.width, targetSize.height, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();

  // Build SVG overlay with text blocks
  const renderedBoxes: BoundingBox[] = [];
  let svgElements = '';

  for (const block of textBlocks) {
    const zone = PLACEMENT_ZONES[block.placement] || PLACEMENT_ZONES['center-safe'];
    const sizes = TEXT_SIZES[block.text_size] || TEXT_SIZES['standard'];
    const fontSize = sizes.primary;
    const isBold = block.capitalization === 'upper' || block.text_size === 'large';

    const processedText = applyCapitalization(block.text, block.capitalization);
    const lines = processedText.split('\\n').flatMap((l: string) => l.split('\n'));

    const paddingH = 20;
    const paddingV = 12;
    const pillRadius = 20;
    const lineGap = 6;

    const lineMeasurements = lines.map((line: string) => ({
      text: line,
      width: estimateTextWidth(line, fontSize, isBold),
      height: fontSize * 1.2,
    }));

    const totalHeight = lineMeasurements.reduce((sum: number, m: { height: number }) => sum + m.height + paddingV * 2, 0)
      + (lines.length - 1) * lineGap;

    const yCenter = (zone.yMin + zone.yMax) / 2 * targetSize.height;
    let startY = yCenter - totalHeight / 2;

    const maxLineWidth = Math.max(...lineMeasurements.map((m: { width: number }) => m.width));
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

    const minY = targetSize.height * 0.12;
    const maxY = targetSize.height * 0.88 - totalHeight;
    startY = Math.max(minY, Math.min(maxY, startY));
    blockBox.y = startY;
    renderedBoxes.push(blockBox);

    // Determine pill color from image luminance
    let useDarkPill = block.pill_color === 'dark';
    if (block.style === 'pill') {
      const luminance = await getImageLuminance(
        resized,
        blockBox.x, blockBox.y,
        blockBox.width, blockBox.height,
        targetSize.width, targetSize.height
      );
      useDarkPill = luminance > 128;
    }

    // Render each line as SVG
    let currentY = startY;
    for (const line of lineMeasurements) {
      let lineX: number;
      if (zone.align === 'center') {
        lineX = targetSize.width / 2;
      } else if (zone.align === 'left') {
        lineX = zone.x * targetSize.width + paddingH;
      } else {
        lineX = zone.x * targetSize.width - paddingH;
      }

      const textAnchor = zone.align === 'center' ? 'middle' : zone.align === 'left' ? 'start' : 'end';
      const fontWeight = isBold ? '700' : '400';

      if (block.style === 'pill') {
        const pillX = zone.align === 'center' ? lineX - line.width / 2 - paddingH :
                       zone.align === 'left' ? lineX - paddingH :
                       lineX - line.width - paddingH;
        const pillY = currentY;
        const pillW = line.width + paddingH * 2;
        const pillH = line.height + paddingV * 2;

        const bgColor = useDarkPill ? '#000000' : '#FFFFFF';
        const textColor = useDarkPill ? '#FFFFFF' : '#000000';

        svgElements += `<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillRadius}" ry="${pillRadius}" fill="${bgColor}"/>`;
        svgElements += `<text x="${lineX}" y="${currentY + paddingV + fontSize * 0.85}" font-family="Inter" font-size="${fontSize}" font-weight="${fontWeight}" fill="${textColor}" text-anchor="${textAnchor}">${escapeXml(line.text)}</text>`;
      } else {
        svgElements += `<text x="${lineX}" y="${currentY + paddingV + fontSize * 0.85}" font-family="Inter" font-size="${fontSize}" font-weight="${fontWeight}" fill="#FFFFFF" text-anchor="${textAnchor}">${escapeXml(line.text)}</text>`;
      }

      currentY += line.height + paddingV * 2 + lineGap;
    }
  }

  // Build SVG string
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetSize.width}" height="${targetSize.height}">${svgElements}</svg>`;

  // Render SVG to PNG using resvg with proper font support
  const fontBuffers: Uint8Array[] = [];
  if (interBoldBuffer) fontBuffers.push(new Uint8Array(interBoldBuffer));
  if (interRegularBuffer) fontBuffers.push(new Uint8Array(interRegularBuffer));

  const resvg = new Resvg(svgString, {
    fitTo: { mode: 'width' as const, value: targetSize.width },
    font: {
      fontBuffers,
      loadSystemFonts: false,
      defaultFontFamily: 'Inter',
    },
  });

  const overlayPng = resvg.render().asPng();

  // Composite the rendered text overlay onto the image
  const result = await sharp(resized)
    .composite([{ input: Buffer.from(overlayPng), top: 0, left: 0 }])
    .png()
    .toBuffer();

  return result;
}

export async function renderFeedImage(imageBuffer: Buffer, textBlocks: TextBlock[]): Promise<Buffer> {
  return renderTextOnImage(imageBuffer, textBlocks, FEED_SIZE);
}

export async function renderStoryImage(imageBuffer: Buffer, textBlocks: TextBlock[]): Promise<Buffer> {
  return renderTextOnImage(imageBuffer, textBlocks, STORY_SIZE);
}
