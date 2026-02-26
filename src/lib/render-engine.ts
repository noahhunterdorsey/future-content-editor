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

const SAFE_MARGIN_H = 40; // Minimum horizontal margin from image edges

const PLACEMENT_ZONES: Record<string, { x: number; yMin: number; yMax: number; align: TextAlign }> = {
  'top-center-safe': { x: 0.5, yMin: 0.17, yMax: 0.30, align: 'center' },
  'top-left-safe': { x: 0.12, yMin: 0.17, yMax: 0.30, align: 'left' },
  'top-right-safe': { x: 0.88, yMin: 0.17, yMax: 0.30, align: 'right' },
  'center-safe': { x: 0.5, yMin: 0.35, yMax: 0.65, align: 'center' },
  'center-left-safe': { x: 0.12, yMin: 0.35, yMax: 0.65, align: 'left' },
  'center-right-safe': { x: 0.88, yMin: 0.35, yMax: 0.65, align: 'right' },
  'bottom-center-safe': { x: 0.5, yMin: 0.70, yMax: 0.83, align: 'center' },
  'bottom-left-safe': { x: 0.12, yMin: 0.70, yMax: 0.83, align: 'left' },
  'bottom-right-safe': { x: 0.88, yMin: 0.70, yMax: 0.83, align: 'right' },
};

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// WASM + font initialization
let wasmInitialized = false;
let fontBoldBuffer: Buffer | null = null;
let fontRegularBuffer: Buffer | null = null;

async function ensureInitialized() {
  // Load fonts
  if (!fontBoldBuffer) {
    const fontDir = path.join(process.cwd(), 'public', 'fonts');
    try {
      fontBoldBuffer = fs.readFileSync(path.join(fontDir, 'Roboto-Bold.ttf'));
      fontRegularBuffer = fs.readFileSync(path.join(fontDir, 'Roboto-Regular.ttf'));
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
  const avgCharWidth = fontSize * (isBold ? 0.60 : 0.56);
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
  const maxContentWidth = targetSize.width - SAFE_MARGIN_H * 2;

  // SVG filter for plain text shadow (readability over light areas)
  const svgDefs = `<defs>
    <filter id="textShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="#000000" flood-opacity="0.7"/>
    </filter>
  </defs>`;

  for (const block of textBlocks) {
    const zone = PLACEMENT_ZONES[block.placement] || PLACEMENT_ZONES['center-safe'];
    const sizes = TEXT_SIZES[block.text_size] || TEXT_SIZES['standard'];
    const fontSize = sizes.primary;
    const isBold = true; // Always bold

    const processedText = applyCapitalization(block.text, block.capitalization);
    const lines = processedText.split('\\n').flatMap((l: string) => l.split('\n'));

    const paddingH = 16;
    const paddingV = 8;

    const lineMeasurements = lines.map((line: string) => ({
      text: line,
      width: Math.min(estimateTextWidth(line, fontSize, isBold), maxContentWidth - paddingH * 2),
      height: fontSize * 1.2,
    }));

    // Calculate total height
    let totalHeight: number;
    const pillLineH = fontSize * 1.2 + paddingV * 2; // Each pill line height (text + top/bottom padding)
    if (block.style === 'pill') {
      // Per-line pills with no gap — each line has its own pill, stacked flush
      totalHeight = pillLineH * lines.length;
    } else {
      // Plain text: lines with normal spacing
      const plainLineGap = 6;
      totalHeight = lineMeasurements.reduce((sum: number, m: { height: number }) => sum + m.height, 0)
        + (lines.length - 1) * plainLineGap;
    }

    const yCenter = (zone.yMin + zone.yMax) / 2 * targetSize.height;
    let startY = yCenter - totalHeight / 2;

    const maxLineWidth = Math.max(...lineMeasurements.map((m: { width: number }) => m.width));
    const blockWidth = Math.min(maxLineWidth + paddingH * 2, maxContentWidth);

    const blockBox: BoundingBox = {
      x: zone.align === 'center' ? targetSize.width / 2 - blockWidth / 2 :
         zone.align === 'left' ? zone.x * targetSize.width :
         zone.x * targetSize.width - blockWidth,
      y: startY,
      width: blockWidth,
      height: totalHeight,
    };

    // Clamp horizontal position to safe margins
    blockBox.x = Math.max(SAFE_MARGIN_H, Math.min(blockBox.x, targetSize.width - blockBox.width - SAFE_MARGIN_H));

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

    const fontWeight = '700'; // Always bold

    if (block.style === 'pill') {
      // Per-line pills: each line gets its own pill sized to its text, stacked with no gap
      const bgColor = useDarkPill ? '#000000' : '#FFFFFF';
      const textColor = useDarkPill ? '#FFFFFF' : '#000000';

      let currentY = startY;
      for (const line of lineMeasurements) {
        const pillW = line.width + paddingH * 2;
        let pillX: number;
        if (zone.align === 'center') {
          pillX = targetSize.width / 2 - pillW / 2;
        } else if (zone.align === 'left') {
          pillX = blockBox.x;
        } else {
          pillX = blockBox.x + blockBox.width - pillW;
        }

        // Clamp pill horizontally within safe margins
        pillX = Math.max(SAFE_MARGIN_H, Math.min(pillX, targetSize.width - pillW - SAFE_MARGIN_H));

        // Text positioned at exact center of pill
        const textX = pillX + pillW / 2;
        const textY = currentY + pillLineH / 2;

        const pillRadius = 10; // Slightly rounded corners, more squared up
        svgElements += `<rect x="${pillX}" y="${currentY}" width="${pillW}" height="${pillLineH}" rx="${pillRadius}" ry="${pillRadius}" fill="${bgColor}"/>`;
        svgElements += `<text x="${textX}" y="${textY}" font-family="Roboto" font-size="${fontSize}" font-weight="${fontWeight}" fill="${textColor}" text-anchor="middle" dominant-baseline="central">${escapeXml(line.text)}</text>`;

        currentY += pillLineH; // No gap — pills stack flush
      }
    } else {
      // Plain text with stroke outline for readability
      const plainLineGap = 6;
      let textY = startY;
      for (const line of lineMeasurements) {
        let lineX: number;
        if (zone.align === 'center') {
          lineX = targetSize.width / 2;
        } else if (zone.align === 'left') {
          lineX = Math.max(SAFE_MARGIN_H, zone.x * targetSize.width + paddingH);
        } else {
          lineX = Math.min(targetSize.width - SAFE_MARGIN_H, zone.x * targetSize.width - paddingH);
        }

        const textAnchor = zone.align === 'center' ? 'middle' : zone.align === 'left' ? 'start' : 'end';
        const yPos = textY + fontSize * 0.85;

        // Dark outline for contrast (drawn first, behind white fill)
        svgElements += `<text x="${lineX}" y="${yPos}" font-family="Roboto" font-size="${fontSize}" font-weight="${fontWeight}" fill="none" stroke="#000000" stroke-width="4" stroke-linejoin="round" text-anchor="${textAnchor}">${escapeXml(line.text)}</text>`;
        // White fill on top
        svgElements += `<text x="${lineX}" y="${yPos}" font-family="Roboto" font-size="${fontSize}" font-weight="${fontWeight}" fill="#FFFFFF" text-anchor="${textAnchor}">${escapeXml(line.text)}</text>`;

        textY += line.height + plainLineGap;
      }
    }
  }

  // Build SVG string
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetSize.width}" height="${targetSize.height}">${svgDefs}${svgElements}</svg>`;

  // Render SVG to PNG using resvg with proper font support
  const fontBuffers: Uint8Array[] = [];
  if (fontBoldBuffer) fontBuffers.push(new Uint8Array(fontBoldBuffer));
  if (fontRegularBuffer) fontBuffers.push(new Uint8Array(fontRegularBuffer));

  const resvg = new Resvg(svgString, {
    fitTo: { mode: 'width' as const, value: targetSize.width },
    font: {
      fontBuffers,
      loadSystemFonts: true,
      defaultFontFamily: 'Roboto',
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
