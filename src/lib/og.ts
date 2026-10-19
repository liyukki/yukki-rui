/**
 * 每篇文章的分享图（OG image）纯逻辑。
 *
 * 为什么放在 lib 里：图片生成要跑 satori + resvg（构建期），但「长什么样」这件事
 * 希望被单元测试覆盖，所以卡片结构在这里用纯对象拼好，渲染器只负责把它变成 PNG。
 *
 * 设计约定：
 * - 尺寸 1200×630（主流社交平台的 1.91:1）
 * - 配色与站点 light 主题 token 对齐；字体是像素字体（Ark Pixel 12px，OFL）
 * - 字号取 12 的整数倍（12/24/36/72），像素字体在整数倍下最清晰
 * - 只用 flex 布局（satori 不支持 block/inline 的正常排版）
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/**
 * 分享图的站内路径（还没加部署 base，交给 withBase）。
 *
 * 为什么要去掉 id 里的点：Astro 生成路由时会把参数里的 `.` 丢掉，
 * `hello-world.en` 的页面路径实际是 `/en/posts/hello-worlden/`，
 * 所以 `src/pages/og/[...slug].png.ts` 产出的文件也叫 `hello-worlden.png`。
 * 这里必须与之保持一致，否则文章页的 og:image 会指向不存在的文件。
 */
export function ogImagePath(id: string): string {
  return `/og/${id.replace(/\./g, '')}.png`;
}

/** 截断过长文字，避免溢出版面；中文按字算，英文按字符算（够用即可）。 */
export function clampText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const chars = [...clean];
  if (chars.length <= max) return clean;
  return `${chars.slice(0, Math.max(1, max - 1)).join('')}…`;
}

export interface OgCardInput {
  title: string;
  description: string;
  lang: 'zh' | 'en';
  tags: readonly string[];
  /** 已格式化好的日期，例如 2026年10月16日 */
  dateLabel: string;
  siteName: string;
  siteUrl: string;
}

/** 各语言标题/摘要的字数上限：中文方块字更占地方，放得更少。 */
export function ogTextLimits(lang: 'zh' | 'en'): { title: number; description: number } {
  return lang === 'zh' ? { title: 20, description: 40 } : { title: 52, description: 88 };
}

const COLORS = {
  bg: '#fdf3e3',
  card: '#fffdf7',
  edge: '#d8c9a8',
  text: '#2c2438',
  dim: '#716688',
  accent: '#f5a623',
  accent2: '#3ba7ff',
  link: '#9a5f00',
} as const;

const FONT = 'Ark Pixel';

type VNode = {
  type: string;
  props: {
    style: Record<string, string | number>;
    children?: string | VNode | Array<string | VNode>;
  };
};

function box(style: Record<string, string | number>, children: VNode['props']['children']): VNode {
  return { type: 'div', props: { style: { display: 'flex', ...style }, children } };
}

function text(content: string, style: Record<string, string | number>): VNode {
  return box(style, content);
}

/**
 * 拼一张分享卡片。返回 satori 能吃的 VDOM 对象。
 * 结构：顶部站名 + 语言徽标；中部标签、标题、摘要；底部站点地址 + 日期。
 */
export function buildOgCard(input: OgCardInput): VNode {
  const limits = ogTextLimits(input.lang);
  const tags = input.tags.slice(0, 3);
  const langLabel = input.lang === 'zh' ? '中文' : 'EN';

  const top = box(
    {
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      flexShrink: 0,
    },
    [
      box({ alignItems: 'center' }, [
        box({ width: 36, height: 36, background: COLORS.accent, marginRight: 18 }, ''),
        text(input.siteName, { fontFamily: FONT, fontSize: 36, color: COLORS.text, letterSpacing: 4 }),
      ]),
      box(
        {
          alignItems: 'center',
          border: `4px solid ${COLORS.edge}`,
          padding: '6px 20px',
          color: COLORS.link,
        },
        text(langLabel, { fontFamily: FONT, fontSize: 24 }),
      ),
    ],
  );

  const middleChildren: Array<VNode | string> = [];
  if (tags.length > 0) {
    middleChildren.push(
      text(tags.map((tag) => `#${tag}`).join('  '), {
        fontFamily: FONT,
        fontSize: 24,
        color: COLORS.link,
        marginBottom: 20,
      }),
    );
  }
  middleChildren.push(
    text(clampText(input.title, limits.title), {
      fontFamily: FONT,
      fontSize: 64,
      lineHeight: 1.2,
      color: COLORS.text,
    }),
  );
  middleChildren.push(
    text(clampText(input.description, limits.description), {
      fontFamily: FONT,
      fontSize: 36,
      lineHeight: 1.35,
      color: COLORS.dim,
      marginTop: 24,
    }),
  );
  const middle = box(
    {
      flexDirection: 'column',
      flex: '1',
      width: '100%',
      paddingTop: 24,
      // 兜底：极端长文也不许压到底部那一行（宁可裁掉一点摘要）
      overflow: 'hidden',
    },
    middleChildren,
  );

  const bottom = box(
    { alignItems: 'center', justifyContent: 'space-between', width: '100%', flexShrink: 0 },
    [
      text(input.siteUrl, { fontFamily: FONT, fontSize: 24, color: COLORS.dim }),
      text(input.dateLabel, { fontFamily: FONT, fontSize: 24, color: COLORS.dim }),
    ],
  );

  return box(
    {
      position: 'relative',
      // satori 默认 content-box：不声明的话 height 630 会再叠加上下 padding，
      // 底部那一行和右下装饰会被裁到画布外。
      boxSizing: 'border-box',
      flexDirection: 'column',
      justifyContent: 'space-between',
      width: `${OG_WIDTH}px`,
      height: `${OG_HEIGHT}px`,
      padding: '64px 72px',
      background: COLORS.bg,
      fontFamily: FONT,
      color: COLORS.text,
    },
    [
      // 顶部彩色细条：像素风格的装饰
      box(
        { position: 'absolute', top: 0, left: 0, width: `${OG_WIDTH}px`, flexDirection: 'row' },
        [
          box({ width: '50%', height: 12, background: COLORS.accent }, ''),
          box({ width: '50%', height: 12, background: COLORS.accent2 }, ''),
        ],
      ),
      // 右下角像素方块装饰
      box(
        { position: 'absolute', bottom: 24, right: 24, flexDirection: 'row', alignItems: 'flex-end' },
        [
          box({ width: 12, height: 12, background: COLORS.accent, marginRight: 6 }, ''),
          box({ width: 12, height: 24, background: COLORS.accent2, marginRight: 6 }, ''),
          box({ width: 12, height: 36, background: COLORS.edge }, ''),
        ],
      ),
      top,
      middle,
      bottom,
    ],
  );
}
