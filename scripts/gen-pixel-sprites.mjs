/**
 * 生成手绘像素精灵（音符/星星/硬币/太阳/月亮），一次性执行脚本。
 * 依赖 sharp；本仓库当前由 astro 的 optionalDependencies 间接提供，
 * 换机器运行前请先执行 `npm i -D sharp`。
 */
import sharp from 'sharp';

const W = 16, H = 16;
const blank = () => Array.from({ length: H }, () => Array(W).fill('.'));
const px = (g, x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; };
const px2 = (g, x, y, c) => { px(g, x, y, c); px(g, x + 1, y, c); px(g, x, y + 1, c); px(g, x + 1, y + 1, c); };

/* 8x8 图案（逻辑坐标，渲染时 2 倍放大到 16x16）。
   O=描边, F=填充, H=高光, .=透明 */
const ART = {
  star4: (() => {
    const g = blank();
    const pts = [
      [3,0,'O'],[4,0,'O'],[2,1,'O'],[3,1,'F'],[4,1,'F'],[5,1,'O'],[1,2,'O'],[2,2,'F'],[3,2,'F'],[4,2,'F'],[5,2,'F'],[6,2,'O'],[0,3,'O'],[1,3,'F'],[2,3,'F'],[3,3,'F'],[4,3,'F'],[5,3,'F'],[6,3,'F'],[7,3,'O'],[0,4,'O'],[1,4,'F'],[2,4,'F'],[3,4,'F'],[4,4,'F'],[5,4,'F'],[6,4,'F'],[7,4,'O'],[1,5,'O'],[2,5,'F'],[3,5,'F'],[4,5,'F'],[5,5,'F'],[6,5,'O'],[2,6,'O'],[3,6,'F'],[4,6,'F'],[5,6,'O'],[3,7,'O'],[4,7,'O']
    ];
    for (const [x, y, c] of pts) px2(g, x, y, c);
    return g;
  })(),
  star5: (() => {
    const g = blank();
    const pts = [
      [3,0,'O'],[4,0,'O'],[3,1,'F'],[4,1,'F'],[0,2,'O'],[1,2,'O'],[2,2,'F'],[3,2,'F'],[4,2,'F'],[5,2,'F'],[6,2,'O'],[7,2,'O'],[1,3,'O'],[2,3,'F'],[3,3,'F'],[4,3,'F'],[5,3,'F'],[6,3,'O'],[2,4,'O'],[3,4,'F'],[4,4,'F'],[5,4,'O'],[1,5,'O'],[2,5,'F'],[3,5,'O'],[4,5,'O'],[5,5,'F'],[6,5,'O'],[1,6,'O'],[2,6,'O'],[5,6,'O'],[6,6,'O']
    ];
    for (const [x, y, c] of pts) px2(g, x, y, c);
    return g;
  })(),
  note8: (() => {
    const g = blank();
    const pts = [
      [4,0,'O'],[5,0,'O'],[6,0,'O'],[4,1,'O'],[5,1,'F'],[6,1,'O'],[4,2,'O'],[5,2,'F'],[6,2,'O'],[4,3,'O'],[5,3,'F'],[6,3,'O'],[4,4,'O'],[5,4,'F'],[6,4,'O'],[1,5,'O'],[2,5,'O'],[3,5,'O'],[4,5,'F'],[5,5,'O'],[6,5,'O'],[0,6,'O'],[1,6,'F'],[2,6,'F'],[3,6,'F'],[4,6,'F'],[5,6,'F'],[6,6,'O'],[1,7,'O'],[2,7,'O'],[3,7,'O'],[4,7,'O'],[5,7,'O']
    ];
    for (const [x, y, c] of pts) px2(g, x, y, c);
    return g;
  })(),
  note16: (() => {
    const g = blank();
    const pts = [
      [2,0,'O'],[3,0,'O'],[4,0,'O'],[5,0,'O'],[6,0,'O'],[7,0,'O'],[2,1,'O'],[3,1,'F'],[4,1,'O'],[5,1,'F'],[6,1,'O'],[7,1,'F'],[2,2,'O'],[3,2,'F'],[4,2,'O'],[5,2,'F'],[6,2,'O'],[2,3,'O'],[3,3,'F'],[4,3,'O'],[5,3,'F'],[6,3,'O'],[1,4,'O'],[2,4,'O'],[3,4,'O'],[4,4,'F'],[5,4,'O'],[6,4,'O'],[0,5,'O'],[1,5,'F'],[2,5,'F'],[3,5,'F'],[4,5,'F'],[5,5,'F'],[6,5,'O'],[7,5,'O'],[0,6,'O'],[1,6,'F'],[2,6,'F'],[3,6,'F'],[4,6,'F'],[5,6,'F'],[6,6,'O'],[1,7,'O'],[2,7,'O'],[3,7,'O'],[5,7,'O']
    ];
    for (const [x, y, c] of pts) px2(g, x, y, c);
    return g;
  })(),
  coin: (() => {
    const g = blank();
    const pts = [
      [2,0,'O'],[3,0,'O'],[4,0,'O'],[5,0,'O'],[1,1,'O'],[2,1,'F'],[3,1,'F'],[4,1,'F'],[5,1,'F'],[6,1,'O'],[0,2,'O'],[1,2,'H'],[2,2,'F'],[3,2,'F'],[4,2,'F'],[5,2,'F'],[6,2,'F'],[7,2,'O'],[0,3,'O'],[1,3,'F'],[2,3,'F'],[3,3,'F'],[4,3,'F'],[5,3,'O'],[6,3,'F'],[7,3,'O'],[0,4,'O'],[1,4,'F'],[2,4,'F'],[3,4,'F'],[4,4,'F'],[5,4,'O'],[6,4,'F'],[7,4,'O'],[0,5,'O'],[1,5,'H'],[2,5,'F'],[3,5,'F'],[4,5,'F'],[5,5,'F'],[6,5,'F'],[7,5,'O'],[1,6,'O'],[2,6,'F'],[3,6,'F'],[4,6,'F'],[5,6,'F'],[6,6,'O'],[2,7,'O'],[3,7,'O'],[4,7,'O'],[5,7,'O']
    ];
    for (const [x, y, c] of pts) px2(g, x, y, c);
    return g;
  })(),
  sun: (() => {
    const g = blank();
    const pts = [
      [3,1,'O'],[4,1,'O'],
      [2,2,'O'],[3,2,'F'],[4,2,'F'],[5,2,'O'],
      [1,3,'O'],[2,3,'F'],[3,3,'F'],[4,3,'F'],[5,3,'F'],[6,3,'O'],
      [1,4,'O'],[2,4,'F'],[3,4,'F'],[4,4,'F'],[5,4,'F'],[6,4,'O'],
      [2,5,'O'],[3,5,'F'],[4,5,'F'],[5,5,'O'],
      [3,6,'O'],[4,6,'O'],
      [3,0,'O'],[4,0,'O'],
      [0,3,'O'],[7,3,'O'],[0,4,'O'],[7,4,'O'],
      [1,1,'O'],[6,1,'O'],[1,6,'O'],[6,6,'O'],
      [3,7,'O'],[4,7,'O'],
    ];
    for (const [x, y, c] of pts) px2(g, x, y, c);
    px2(g, 3, 3, 'H');
    return g;
  })(),
  moon: (() => {
    const g = blank();
    const pts = [
      [4,0,'O'],[5,0,'O'],[3,1,'O'],[4,1,'F'],[5,1,'F'],[6,1,'O'],[2,2,'O'],[3,2,'F'],[4,2,'F'],[5,2,'O'],[2,3,'O'],[3,3,'F'],[4,3,'O'],[2,4,'O'],[3,4,'F'],[4,4,'O'],[2,5,'O'],[3,5,'F'],[4,5,'F'],[5,5,'O'],[3,6,'O'],[4,6,'F'],[5,6,'F'],[6,6,'O'],[4,7,'O'],[5,7,'O']
    ];
    for (const [x, y, c] of pts) px2(g, x, y, c);
    return g;
  })(),
};

const PALETTES = {
  'star-gold':  { O: '#b8860b', F: '#ffd93b', H: '#fff6c0' },
  'star-blue':  { O: '#1d5fa8', F: '#5ab0ff', H: '#d6ecff' },
  'note-orange':{ O: '#8a5200', F: '#f5a623', H: '#ffe1a6' },
  'note-blue':  { O: '#144a80', F: '#3ba7ff', H: '#bfe3ff' },
  'note-pink':  { O: '#8e2a5c', F: '#ff6bb3', H: '#ffc4de' },
  'coin-gold':  { O: '#a86e00', F: '#ffc93b', H: '#fff3b0' },
  'sun':        { O: '#c26a00', F: '#ffb63b', H: '#fff0b8' },
  'moon':       { O: '#3d5a99', F: '#9db8f0', H: '#e4edff' },
  'star-pink':  { O: '#8e2a5c', F: '#ff8ac2', H: '#ffd0e6' },
};

const OUT = 'public/pixel';

const targets = [
  ['star4', 'star-gold', 'star-gold.png'],
  ['star4', 'star-blue', 'star-blue.png'],
  ['star4', 'star-pink', 'star-pink.png'],
  ['star5', 'star-gold', 'star5-gold.png'],
  ['star5', 'note-blue', 'star5-blue.png'],
  ['note8', 'note-orange', 'note-orange.png'],
  ['note8', 'note-blue', 'note-blue.png'],
  ['note8', 'note-pink', 'note-pink.png'],
  ['note16', 'note-orange', 'note16-orange.png'],
  ['note16', 'note-blue', 'note16-blue.png'],
  ['coin', 'coin-gold', 'coin-sprite.png'],
  ['sun', 'sun', 'sun.png'],
  ['moon', 'moon', 'moon.png'],
];

for (const [shape, palette, file] of targets) {
  const grid = ART[shape];
  const pal = PALETTES[palette];
  const raw = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = grid[y][x];
    const i = (y * W + x) * 4;
    if (ch !== '.' && pal[ch]) {
      const hex = pal[ch];
      raw[i] = parseInt(hex.slice(1, 3), 16);
      raw[i + 1] = parseInt(hex.slice(3, 5), 16);
      raw[i + 2] = parseInt(hex.slice(5, 7), 16);
      raw[i + 3] = 255;
    }
  }
  await sharp(raw, { raw: { width: W, height: H, channels: 4 } })
    .resize(48, 48, { kernel: 'nearest' })
    .png()
    .toFile(`${OUT}/${file}`);
  console.log('wrote', file);
}
