// 글 파일을 만들고 찾는 공통 함수. bin/new.mjs 와 웹 에디터(plugins/editor)가 같이 쓴다.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = new URL('../src/content/', import.meta.url).pathname;
export const KINDS = ['writeups', 'projects'];
export const CATEGORIES = ['web', 'pwn', 'rev', 'crypto', 'forensics', 'misc'];
export const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function postDir(kind, slug) {
  if (!KINDS.includes(kind) || !SLUG.test(slug)) throw new Error('잘못된 글 주소입니다.');
  return join(ROOT, kind, slug);
}

export function createPost(kind, { title, slug, platform = 'Dreamhack', category = 'web', level = '' }) {
  if (!title) throw new Error('제목이 필요합니다.');
  if (kind === 'writeups' && !CATEGORIES.includes(category)) throw new Error('분야가 올바르지 않습니다.');
  const dir = postDir(kind, slug);
  const file = join(dir, 'index.md');
  if (existsSync(file)) throw new Error(`이미 있는 글입니다: ${kind}/${slug}`);

  const values = {
    title: title.replaceAll('"', '\\"'),
    date: new Date().toLocaleDateString('sv-SE'),
    platform,
    category,
    level,
  };
  const template = readFileSync(join(ROOT, kind, '_template.md'), 'utf8');
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, template.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? ''));
  return file;
}

export function listPosts() {
  const posts = [];
  for (const kind of KINDS) {
    const base = join(ROOT, kind);
    for (const slug of readdirSync(base)) {
      const file = join(base, slug, 'index.md');
      if (!SLUG.test(slug) || !existsSync(file)) continue;
      const head = readFileSync(file, 'utf8').slice(0, 600);
      const title = head.match(/^title:\s*"?(.*?)"?\s*$/m)?.[1] || slug;
      const date = head.match(/^date:\s*(\S+)/m)?.[1] ?? '';
      const draft = /^draft:\s*true/m.test(head);
      posts.push({ kind, slug, title, date, draft });
    }
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date));
}
