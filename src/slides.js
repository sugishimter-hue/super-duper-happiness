// PPT(강의용 16:9)와 카드뉴스(정사각형) 파일 만들기
import PptxGenJS from 'pptxgenjs';

export const THEMES = {
  lavender: { name: '라벤더', bg: 'F6F2FF', panel: 'FFFFFF', accent: '7C4DDB', text: '2B2236', sub: '6B6178' },
  navy: { name: '네이비 골드', bg: '13233F', panel: '1C3156', accent: 'F2C14E', text: 'FFFFFF', sub: 'C9D3E6' },
  coral: { name: '코랄', bg: 'FFF1EC', panel: 'FFFFFF', accent: 'E2604B', text: '3A2420', sub: '7A5A52' },
  forest: { name: '포레스트', bg: 'EEF5EF', panel: 'FFFFFF', accent: '2F7D57', text: '1F2D24', sub: '56695C' },
};
const FONT = 'Malgun Gothic';

// AI가 쓰는 출력 형식
export const SCHEMAS = {
  ppt: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '표지 제목' },
      subtitle: { type: 'string', description: '표지 부제 (대상·일시 등)' },
      slides: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' }, description: '슬라이드 핵심 문장 2~5개, 각 40자 이내' },
            notes: { type: 'string', description: '강사가 말할 내용 (발표자 노트)' },
          },
          required: ['title', 'bullets', 'notes'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'subtitle', 'slides'],
    additionalProperties: false,
  },
  cards: {
    type: 'object',
    properties: {
      cards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            headline: { type: 'string', description: '큰 글씨 한 줄 (20자 이내)' },
            body: { type: 'string', description: '작은 글씨 설명 (60자 이내, 없으면 빈 문자열)' },
          },
          required: ['headline', 'body'],
          additionalProperties: false,
        },
      },
      caption: { type: 'string', description: '인스타그램 캡션과 해시태그' },
    },
    required: ['cards', 'caption'],
    additionalProperties: false,
  },
};

// AI 없이(데모 모드) 마크다운 결과물을 슬라이드로 나누는 간단한 방법
const strip = (s) => s.replace(/\*\*|__|`/g, '').replace(/^>\s?/, '').trim();
export function fromMarkdown(md, kind, title) {
  const sections = [];
  let cur = null;
  for (const raw of String(md).split('\n')) {
    const line = raw.trim();
    if (!line || /^[-*]{3,}$/.test(line) || /^\|[\s:|-]+\|$/.test(line)) continue;
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) {
      cur = { title: strip(h[1]), bullets: [] };
      sections.push(cur);
      continue;
    }
    if (!cur) sections.push((cur = { title: title, bullets: [] }));
    const text = strip(line.replace(/^\s*([-*•]|\d+[.)])\s+/, '').replace(/^\|(.*)\|$/, (_, c) => c.split('|').map((x) => x.trim()).filter(Boolean).join(' · ')));
    if (text && cur.bullets.length < 6) cur.bullets.push(text.slice(0, 80));
  }
  const filled = sections.filter((s) => s.bullets.length);
  if (kind === 'cards') {
    const cards = filled.slice(0, 8).map((s) => ({ headline: s.title.slice(0, 22), body: s.bullets.slice(0, 2).join(' ').slice(0, 70) }));
    return { cards: cards.length ? cards : [{ headline: title, body: '' }], caption: '' };
  }
  return { title, subtitle: '', slides: filled.slice(0, 15).map((s) => ({ ...s, notes: '' })) };
}

export function normalize(kind, data, title) {
  if (kind === 'cards') {
    const cards = (data.cards || []).filter((c) => c.headline).slice(0, 10);
    return { cards: cards.length ? cards : [{ headline: title, body: '' }], caption: data.caption || '' };
  }
  return { title: data.title || title, subtitle: data.subtitle || '', slides: (data.slides || []).filter((s) => s.title).slice(0, 25) };
}

export async function buildPptx(kind, data, themeKey, footer) {
  const t = THEMES[themeKey] || THEMES.lavender;
  const pptx = new PptxGenJS();
  pptx.author = footer;
  pptx.company = footer;

  if (kind === 'cards') {
    pptx.defineLayout({ name: 'SQUARE', width: 7.5, height: 7.5 });
    pptx.layout = 'SQUARE';
    data.cards.forEach((c, i) => {
      const s = pptx.addSlide();
      s.background = { color: t.bg };
      s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 0.7, w: 0.9, h: 0.12, fill: { color: t.accent }, line: { color: t.accent } });
      s.addText(c.headline, { x: 0.6, y: 1.1, w: 6.3, h: 3.0, fontFace: FONT, fontSize: 40, bold: true, color: t.text, valign: 'top', fit: 'shrink' });
      if (c.body) s.addText(c.body, { x: 0.6, y: 4.3, w: 6.3, h: 1.9, fontFace: FONT, fontSize: 20, color: t.sub, valign: 'top', fit: 'shrink' });
      s.addText(`${i + 1} / ${data.cards.length}`, { x: 5.4, y: 6.6, w: 1.5, h: 0.4, fontFace: FONT, fontSize: 12, color: t.sub, align: 'right' });
      s.addText(footer, { x: 0.6, y: 6.6, w: 4.6, h: 0.4, fontFace: FONT, fontSize: 12, color: t.accent, bold: true });
    });
    if (data.caption) pptx.slides[0]?.addNotes(data.caption);
  } else {
    pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5
    const cover = pptx.addSlide();
    cover.background = { color: t.bg };
    cover.addShape(pptx.ShapeType.rect, { x: 0.8, y: 2.3, w: 1.2, h: 0.14, fill: { color: t.accent }, line: { color: t.accent } });
    cover.addText(data.title, { x: 0.8, y: 2.6, w: 11.7, h: 1.8, fontFace: FONT, fontSize: 44, bold: true, color: t.text, valign: 'top', fit: 'shrink' });
    if (data.subtitle) cover.addText(data.subtitle, { x: 0.8, y: 4.4, w: 11.7, h: 0.8, fontFace: FONT, fontSize: 22, color: t.sub });
    cover.addText(footer, { x: 0.8, y: 6.4, w: 11.7, h: 0.5, fontFace: FONT, fontSize: 16, color: t.accent, bold: true });

    data.slides.forEach((sl, i) => {
      const s = pptx.addSlide();
      s.background = { color: t.bg };
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: t.accent }, line: { color: t.accent } });
      s.addText(sl.title, { x: 0.8, y: 0.45, w: 11.7, h: 1.0, fontFace: FONT, fontSize: 30, bold: true, color: t.text, fit: 'shrink' });
      s.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.65, w: 11.7, h: 5.0, fill: { color: t.panel }, line: { color: t.panel }, rectRadius: 0.12 });
      if (sl.bullets.length) {
        s.addText(
          sl.bullets.map((b) => ({ text: b, options: { bullet: { indent: 22 }, paraSpaceAfter: 10 } })),
          { x: 1.2, y: 1.9, w: 10.9, h: 4.5, fontFace: FONT, fontSize: 22, color: t.text, valign: 'top', fit: 'shrink' },
        );
      }
      s.addText(`${i + 2}`, { x: 11.9, y: 6.85, w: 0.6, h: 0.4, fontFace: FONT, fontSize: 12, color: t.sub, align: 'right' });
      if (sl.notes) s.addNotes(sl.notes);
    });
  }
  return pptx.write({ outputType: 'nodebuffer' });
}
