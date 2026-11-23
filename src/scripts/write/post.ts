import { parse, stringify } from 'yaml';

export type Kind = 'writeups' | 'projects';

export interface Meta {
  title: string;
  description: string;
  date: string;
  draft: boolean;
  // 라이트업
  platform: string;
  category: string;
  level: string;
  tags: string[];
  link: string;
  // 프로젝트
  period: string;
  role: string;
  stack: string[];
  repo: string;
  demo: string;
  featured: boolean;
}

export const today = () => new Date().toLocaleDateString('sv-SE');

export const emptyMeta = (): Meta => ({
  title: '',
  description: '',
  date: today(),
  draft: true,
  platform: 'Dreamhack',
  category: 'web',
  level: '',
  tags: [],
  link: '',
  period: '',
  role: '',
  stack: [],
  repo: '',
  demo: '',
  featured: false,
});

const str = (v: unknown) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

/** index.md → 속성 + 본문 */
export function parsePost(source: string): { meta: Meta; body: string } {
  const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const data = (m ? parse(m[1]) : {}) ?? {};
  const meta = emptyMeta();
  Object.assign(meta, {
    title: str(data.title),
    description: str(data.description),
    date: str(data.date) || today(),
    draft: data.draft === true,
    platform: str(data.platform) || 'Dreamhack',
    category: str(data.category) || 'web',
    level: str(data.level),
    tags: list(data.tags),
    link: str(data.link),
    period: str(data.period),
    role: str(data.role),
    stack: list(data.stack),
    repo: str(data.repo),
    demo: str(data.demo),
    featured: data.featured === true,
  });
  // 템플릿 안내 주석은 편집 화면에 보이지 않게 뺀다
  const body = (m ? m[2] : source).replace(/^\s*<!--[\s\S]*?-->\s*/, '');
  return { meta, body };
}

/** 속성 + 본문 → index.md. 빈 값은 적지 않는다. */
export function serializePost(kind: Kind, meta: Meta, body: string) {
  const keys =
    kind === 'writeups'
      ? (['title', 'description', 'platform', 'category', 'level', 'date', 'tags', 'link', 'draft'] as const)
      : (['title', 'description', 'date', 'period', 'role', 'stack', 'repo', 'demo', 'featured', 'draft'] as const);
  const data: Record<string, unknown> = {};
  for (const k of keys) {
    const v = meta[k];
    if (v === '' || (Array.isArray(v) && v.length === 0)) continue;
    // 레벨은 숫자면 숫자로 저장한다 (level: 3)
    data[k] = k === 'level' && /^\d+$/.test(String(v)) ? Number(v) : v;
  }
  if (kind === 'projects' && !data.description) data.description = '';
  return `---\n${stringify(data, { lineWidth: 0 })}---\n\n${body.trim()}\n`;
}

/** 영문 제목이면 그대로 주소로, 한글뿐이면 날짜 기반 주소를 만든다. */
export function makeSlug(title: string) {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return s || `post-${today().replaceAll('-', '')}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 편집기가 마크다운을 다시 쓰면서 강조 상자 표시를 이스케이프하는 경우가 있어 원래대로 돌린다.
 *   > \[!NOTE]  →  > [!NOTE]
 */
export const fixCallouts = (md: string) => md.replace(/^(\s*>\s*)\\\[!(\w+)\\?\]/gm, '$1[!$2]');

/**
 * 편집기가 남기는 군더더기를 정리한다.
 * - 빈 문단이 <br /> 한 줄로 저장되는 것
 * - 사진 설명 자리에 크기 비율(1.00)이 들어가는 것
 */
export const cleanMarkdown = (md: string) =>
  fixCallouts(md)
    .replace(/^[ \t]*<br\s*\/?>[ \t]*$/gm, '')
    .replace(/!\[\d+(?:\.\d+)?\]\(/g, '![](')
    .replace(/\n{3,}/g, '\n\n');
