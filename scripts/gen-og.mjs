#!/usr/bin/env node
/** 生成 1200×630 默认 OG 分享图：深底 + 镜音双子双色光晕 + 装饰网格。无第三方依赖。 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const W = 1200, H = 630;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

// 颜色工具
const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RIN = hx('#f5a623'); // 镜音铃 暖黄
const LEN = hx('#3ba7ff'); // 镜音连 冷蓝
const BG = hx('#0d0b16');

const data = Buffer.alloc(H * (1 + W * 3));
const gauss = (d, s) => Math.exp(-(d * d) / (2 * s * s));

for (let y = 0; y < H; y++) {
  const row = y * (1 + W * 3);
  data[row] = 0; // filter: none
  for (let x = 0; x < W; x++) {
    // 垂直渐变底色
    const t = y / H;
    let r = BG[0] + 12 * t, g = BG[1] + 6 * t, b = BG[2] + 22 * t;

    // 铃的暖黄光晕（左上）
    const dA = Math.hypot(x - 300, y - 180);
    const wA = gauss(dA, 240) * 0.85;
    // 连的冷蓝光晕（右下）
    const dB = Math.hypot(x - 920, y - 470);
    const wB = gauss(dB, 260) * 0.8;
    r += RIN[0] * wA + LEN[0] * wB;
    g += RIN[1] * wA + LEN[1] * wB;
    b += RIN[2] * wA + LEN[2] * wB;

    // 装饰：中央水平亮线（双子“连线”）
    const lineD = Math.abs(y - H / 2);
    if (lineD < 1.5) {
      const fade = gauss(x - W / 2, 420);
      r += 255 * 0.35 * fade;
      g += 220 * 0.35 * fade;
      b += 160 * 0.35 * fade;
    }
    // 装饰点阵：两列圆点（象征双子）
    for (const [cx, color] of [[150, RIN], [1050, LEN]]) {
      for (let i = 0; i < 5; i++) {
        const cy = 150 + i * 82;
        const dd = Math.hypot(x - cx, y - cy);
        if (dd < 7) { r += color[0] * 0.9; g += color[1] * 0.9; b += color[2] * 0.9; }
      }
    }

    const i = row + 1 + x * 3;
    data[i] = Math.min(255, r);
    data[i + 1] = Math.min(255, g);
    data[i + 2] = Math.min(255, b);
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolor

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(data, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = process.argv[2] ?? 'public/og-default.png';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
