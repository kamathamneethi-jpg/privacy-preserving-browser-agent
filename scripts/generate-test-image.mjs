/**
 * Generates synthetic test PNG image for image PII redaction pipeline: tests/fixtures/pii-image-demo.png
 * Contains:
 * Customer Information
 * Name: Shahrukh
 * ID: hi_23
 * Email: sde@sf.com
 * Phone: 9876543210
 * Card: 4532 1234 5678 9012
 */

import zlib from "node:zlib";
import fs from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, "../tests/fixtures/pii-image-demo.png");

// Simple 8x16 bitmap font data for alphanumeric and symbols
const FONT_MAP = {
  ' ': [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  'A': [0,0,0x18,0x24,0x42,0x42,0x7E,0x42,0x42,0x42,0x42,0,0,0,0,0],
  'B': [0,0,0x7C,0x42,0x42,0x7C,0x42,0x42,0x42,0x7C,0,0,0,0,0,0],
  'C': [0,0,0x3C,0x42,0x40,0x40,0x40,0x40,0x42,0x3C,0,0,0,0,0,0],
  'D': [0,0,0x78,0x44,0x42,0x42,0x42,0x42,0x44,0x78,0,0,0,0,0,0],
  'E': [0,0,0x7E,0x40,0x40,0x7C,0x40,0x40,0x40,0x7E,0,0,0,0,0,0],
  'F': [0,0,0x7E,0x40,0x40,0x7C,0x40,0x40,0x40,0x40,0,0,0,0,0,0],
  'G': [0,0,0x3C,0x42,0x40,0x40,0x4E,0x42,0x42,0x3C,0,0,0,0,0,0],
  'H': [0,0,0x42,0x42,0x42,0x7E,0x42,0x42,0x42,0x42,0,0,0,0,0,0],
  'I': [0,0,0x3C,0x18,0x18,0x18,0x18,0x18,0x18,0x3C,0,0,0,0,0,0],
  'J': [0,0,0x1E,0x06,0x06,0x06,0x06,0x46,0x46,0x3C,0,0,0,0,0,0],
  'K': [0,0,0x42,0x44,0x48,0x70,0x48,0x44,0x42,0x42,0,0,0,0,0,0],
  'L': [0,0,0x40,0x40,0x40,0x40,0x40,0x40,0x40,0x7E,0,0,0,0,0,0],
  'M': [0,0,0x42,0x66,0x5A,0x42,0x42,0x42,0x42,0x42,0,0,0,0,0,0],
  'N': [0,0,0x42,0x62,0x52,0x4A,0x46,0x42,0x42,0x42,0,0,0,0,0,0],
  'O': [0,0,0x3C,0x42,0x42,0x42,0x42,0x42,0x42,0x3C,0,0,0,0,0,0],
  'P': [0,0,0x7C,0x42,0x42,0x7C,0x40,0x40,0x40,0x40,0,0,0,0,0,0],
  'Q': [0,0,0x3C,0x42,0x42,0x42,0x42,0x4A,0x44,0x3A,0,0,0,0,0,0],
  'R': [0,0,0x7C,0x42,0x42,0x7C,0x48,0x44,0x42,0x42,0,0,0,0,0,0],
  'S': [0,0,0x3C,0x42,0x40,0x3C,0x02,0x02,0x42,0x3C,0,0,0,0,0,0],
  'T': [0,0,0x7E,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0,0,0,0,0,0],
  'U': [0,0,0x42,0x42,0x42,0x42,0x42,0x42,0x42,0x3C,0,0,0,0,0,0],
  'V': [0,0,0x42,0x42,0x42,0x42,0x42,0x24,0x24,0x18,0,0,0,0,0,0],
  'W': [0,0,0x42,0x42,0x42,0x42,0x5A,0x66,0x42,0x42,0,0,0,0,0,0],
  'X': [0,0,0x42,0x42,0x24,0x18,0x24,0x42,0x42,0x42,0,0,0,0,0,0],
  'Y': [0,0,0x42,0x42,0x24,0x18,0x18,0x18,0x18,0x18,0,0,0,0,0,0],
  'Z': [0,0,0x7E,0x04,0x08,0x10,0x20,0x40,0x40,0x7E,0,0,0,0,0,0],
  'a': [0,0,0,0,0x3C,0x02,0x3E,0x42,0x46,0x3A,0,0,0,0,0,0],
  'b': [0,0x40,0x40,0x40,0x5C,0x62,0x42,0x42,0x62,0x5C,0,0,0,0,0,0],
  'c': [0,0,0,0,0x3C,0x42,0x40,0x40,0x42,0x3C,0,0,0,0,0,0],
  'd': [0,0x02,0x02,0x02,0x3A,0x46,0x42,0x42,0x46,0x3A,0,0,0,0,0,0],
  'e': [0,0,0,0,0x3C,0x42,0x7E,0x40,0x42,0x3C,0,0,0,0,0,0],
  'f': [0,0x0E,0x10,0x10,0x3C,0x10,0x10,0x10,0x10,0x10,0,0,0,0,0,0],
  'g': [0,0,0,0,0x3A,0x46,0x42,0x46,0x3A,0x02,0x44,0x38,0,0,0,0],
  'h': [0,0x40,0x40,0x40,0x5C,0x62,0x42,0x42,0x42,0x42,0,0,0,0,0,0],
  'i': [0,0x18,0,0,0x38,0x18,0x18,0x18,0x18,0x3C,0,0,0,0,0,0],
  'j': [0,0x06,0,0,0x0E,0x06,0x06,0x06,0x06,0x46,0x3C,0,0,0,0,0],
  'k': [0,0x40,0x40,0x40,0x44,0x48,0x70,0x48,0x44,0x42,0,0,0,0,0,0],
  'l': [0,0x38,0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x3C,0,0,0,0,0,0],
  'm': [0,0,0,0,0x76,0x5A,0x42,0x42,0x42,0x42,0,0,0,0,0,0],
  'n': [0,0,0,0,0x5C,0x62,0x42,0x42,0x42,0x42,0,0,0,0,0,0],
  'o': [0,0,0,0,0x3C,0x42,0x42,0x42,0x42,0x3C,0,0,0,0,0,0],
  'p': [0,0,0,0,0x5C,0x62,0x42,0x62,0x5C,0x40,0x40,0x40,0,0,0,0],
  'q': [0,0,0,0,0x3A,0x46,0x42,0x46,0x3A,0x02,0x02,0x02,0,0,0,0],
  'r': [0,0,0,0,0x5C,0x62,0x40,0x40,0x40,0x40,0,0,0,0,0,0],
  's': [0,0,0,0,0x3E,0x40,0x3C,0x02,0x42,0x3C,0,0,0,0,0,0],
  't': [0,0x10,0x10,0x3C,0x10,0x10,0x10,0x10,0x12,0x0C,0,0,0,0,0,0],
  'u': [0,0,0,0,0x42,0x42,0x42,0x42,0x46,0x3A,0,0,0,0,0,0],
  'v': [0,0,0,0,0x42,0x42,0x42,0x24,0x24,0x18,0,0,0,0,0,0],
  'w': [0,0,0,0,0x42,0x42,0x5A,0x5A,0x66,0x42,0,0,0,0,0,0],
  'x': [0,0,0,0,0x42,0x24,0x18,0x18,0x24,0x42,0,0,0,0,0,0],
  'y': [0,0,0,0,0x42,0x42,0x46,0x3A,0x02,0x44,0x38,0,0,0,0,0],
  'z': [0,0,0,0,0x7E,0x08,0x10,0x20,0x40,0x7E,0,0,0,0,0,0],
  '0': [0,0,0x3C,0x46,0x4A,0x52,0x62,0x42,0x42,0x3C,0,0,0,0,0,0],
  '1': [0,0,0x18,0x28,0x08,0x08,0x08,0x08,0x08,0x3E,0,0,0,0,0,0],
  '2': [0,0,0x3C,0x42,0x02,0x04,0x18,0x20,0x40,0x7E,0,0,0,0,0,0],
  '3': [0,0,0x3C,0x42,0x02,0x1C,0x02,0x02,0x42,0x3C,0,0,0,0,0,0],
  '4': [0,0,0x0C,0x14,0x24,0x44,0x7E,0x04,0x04,0x04,0,0,0,0,0,0],
  '5': [0,0,0x7E,0x40,0x7C,0x02,0x02,0x02,0x42,0x3C,0,0,0,0,0,0],
  '6': [0,0,0x3C,0x42,0x40,0x7C,0x42,0x42,0x42,0x3C,0,0,0,0,0,0],
  '7': [0,0,0x7E,0x02,0x04,0x08,0x10,0x20,0x20,0x20,0,0,0,0,0,0],
  '8': [0,0,0x3C,0x42,0x42,0x3C,0x42,0x42,0x42,0x3C,0,0,0,0,0,0],
  '9': [0,0,0x3C,0x42,0x42,0x42,0x3E,0x02,0x42,0x3C,0,0,0,0,0,0],
  ':': [0,0,0,0,0x18,0x18,0,0x18,0x18,0,0,0,0,0,0,0],
  '@': [0,0,0x3C,0x42,0x5A,0x5A,0x5E,0x40,0x42,0x3C,0,0,0,0,0,0],
  '.': [0,0,0,0,0,0,0,0,0x18,0x18,0,0,0,0,0,0],
  '_': [0,0,0,0,0,0,0,0,0,0,0,0x7E,0,0,0,0],
  '-': [0,0,0,0,0,0,0x7E,0,0,0,0,0,0,0,0,0]
};

function createPng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  function crc32(buf) {
    let table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1));
      table[i] = c;
    }
    let c = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
    return (c ^ (-1)) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdrChunk = makeChunk("IHDR", ihdrData);
  const scanlineLen = width * 4 + 1;
  const idatRaw = Buffer.alloc(height * scanlineLen);
  for (let y = 0; y < height; y++) {
    idatRaw[y * scanlineLen] = 0;
    rgbaBuffer.copy(idatRaw, y * scanlineLen + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(idatRaw);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

export function generatePiiDemoImage() {
  const width = 640;
  const height = 480;
  const rgba = Buffer.alloc(width * height * 4);

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (y * width + x) * 4;
    rgba[idx] = r;
    rgba[idx + 1] = g;
    rgba[idx + 2] = b;
    rgba[idx + 3] = a;
  }

  function fillRect(rx, ry, rw, rh, r, g, b, a = 255) {
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        setPixel(x, y, r, g, b, a);
      }
    }
  }

  function drawText(text, startX, startY, scale = 2, r = 15, g = 23, b = 42) {
    let curX = startX;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const glyph = FONT_MAP[char] || FONT_MAP[' '];
      for (let row = 0; row < 16; row++) {
        const bits = glyph[row] || 0;
        for (let col = 0; col < 8; col++) {
          if ((bits >> (7 - col)) & 1) {
            for (let sy = 0; sy < scale; sy++) {
              for (let sx = 0; sx < scale; sx++) {
                setPixel(curX + col * scale + sx, startY + row * scale + sy, r, g, b);
              }
            }
          }
        }
      }
      curX += 8 * scale;
    }
    return {
      x: startX,
      y: startY,
      width: (curX - startX),
      height: 16 * scale
    };
  }

  // 1. Light background #f1f5f9
  fillRect(0, 0, width, height, 241, 245, 249);

  // 2. White card container with shadow/border
  const cardX = 40;
  const cardY = 30;
  const cardW = 560;
  const cardH = 420;
  fillRect(cardX, cardY, cardW, cardH, 255, 255, 255);

  // Card border #e2e8f0
  for (let x = cardX; x < cardX + cardW; x++) {
    setPixel(x, cardY, 226, 232, 240);
    setPixel(x, cardY + cardH - 1, 226, 232, 240);
  }
  for (let y = cardY; y < cardY + cardH; y++) {
    setPixel(cardX, y, 226, 232, 240);
    setPixel(cardX + cardW - 1, y, 226, 232, 240);
  }

  // Header Title
  drawText("Customer Information", cardX + 30, cardY + 25, 2, 30, 41, 59);

  // Inner profile box #f8fafc with border
  const boxX = cardX + 25;
  const boxY = cardY + 70;
  const boxW = cardW - 50;
  const boxH = 300;
  fillRect(boxX, boxY, boxW, boxH, 248, 250, 252);
  for (let x = boxX; x < boxX + boxW; x++) {
    setPixel(x, boxY, 226, 232, 240);
    setPixel(x, boxY + boxH - 1, 226, 232, 240);
  }
  for (let y = boxY; y < boxY + boxH; y++) {
    setPixel(boxX, y, 226, 232, 240);
    setPixel(boxX + boxW - 1, y, 226, 232, 240);
  }

  // The 5 Required PII lines with clear positions
  const bboxes = [];
  const lines = [
    { text: "Name: Shahrukh", pii: "Shahrukh", type: "NAME" },
    { text: "ID: hi_23", pii: "hi_23", type: "ID" },
    { text: "Email: sde@sf.com", pii: "sde@sf.com", type: "EMAIL" },
    { text: "Phone: 9876543210", pii: "9876543210", type: "PHONE" },
    { text: "Card: 4532 1234 5678 9012", pii: "4532 1234 5678 9012", type: "CREDIT_CARD" }
  ];

  let curY = boxY + 25;
  for (const line of lines) {
    const textBbox = drawText(line.text, boxX + 25, curY, 2, 15, 23, 42);
    bboxes.push({
      ...line,
      bbox: textBbox
    });
    curY += 50;
  }

  const pngBuffer = createPng(width, height, rgba);
  return { pngBuffer, bboxes, width, height };
}

// Generate and write file
const { pngBuffer, bboxes } = generatePiiDemoImage();
fs.mkdirSync(dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, pngBuffer);
console.log(`✔ Generated synthetic test image: ${outputPath} (${pngBuffer.length} bytes, ${bboxes.length} PII fields)`);
