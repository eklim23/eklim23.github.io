import { Crepe } from '@milkdown/crepe';
import { insert } from '@milkdown/kit/utils';
import {
  CONTENT,
  checkToken,
  commit,
  getToken,
  latestDeploy,
  listPosts,
  rawUrl,
  readFile,
  setToken,
  type Change,
  type RepoPost,
} from './github';
import { cleanMarkdown, emptyMeta, makeSlug, parsePost, serializePost, type Kind, type Meta } from './post';
import { deleteImage, getImage, listDrafts, loadDraft, putImage, removeDraft, saveDraft, type Draft } from './drafts';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CATEGORIES: [string, string][] = [
  ['web', 'Web'],
  ['pwn', 'Pwnable'],
  ['rev', 'Reversing'],
  ['crypto', 'Crypto'],
  ['forensics', 'Forensics'],
  ['misc', 'Misc'],
];
const KIND_LABEL: Record<Kind, string> = { writeups: '라이트업', projects: '프로젝트' };
const NEW_BODY: Record<Kind, string> = {
  writeups: '## 문제\n\n\n\n## 분석\n\n\n\n## 풀이\n\n\n\n## 정리\n\n',
  projects: '## 개요\n\n\n\n## 구조\n\n\n\n## 구현\n\n\n\n## 정리\n\n',
};

interface ListItem {
  kind: Kind;
  id: string; // 저장소에 있는 글은 주소(slug), 새 글은 new-xxxx
  meta: Meta;
  repo: RepoPost | null;
  local: boolean; // 게시 안 된 변경이 브라우저에 있음
}

interface Current {
  kind: Kind;
  id: string;
  meta: Meta;
  repo: RepoPost | null;
  slugInput: string;
  images: Map<string, Blob>; // 아직 올리지 않은 사진
  urls: Map<string, string>; // 사진 이름 → 화면용 blob 주소
  dirty: boolean;
}

let items: ListItem[] = [];
let cur: Current | null = null;
let crepe: Crepe | null = null;
let saveTimer = 0;
let busy = false;
// 방금 게시한 글의 사이트 반영 상태 (글을 다시 열어도 상단에 계속 보여준다)
let deployNote: { href: string; html: string } | null = null;

// ---------- 공통 ----------
function toast(msg: string, ms = 3000) {
  const el = $('[data-toast]');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(Number(el.dataset.t));
  el.dataset.t = String(window.setTimeout(() => (el.hidden = true), ms));
}

function setStatus(html: string) {
  $('[data-status]').innerHTML = html;
}

function show(view: 'login' | 'app') {
  document.querySelectorAll<HTMLElement>('[data-view]').forEach((v) => (v.hidden = v.dataset.view !== view));
}

// ---------- 로그인 ----------
$('[data-login]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget as HTMLFormElement;
  const token = (form.elements.namedItem('token') as HTMLInputElement).value.trim();
  const err = $('[data-login-error]');
  err.textContent = '확인하는 중…';
  try {
    await checkToken(token);
    setToken(token);
    err.textContent = '';
    start();
  } catch (ex) {
    err.textContent = (ex as Error).message.includes('401') ? '토큰이 올바르지 않습니다.' : (ex as Error).message;
  }
});

$('[data-logout]').addEventListener('click', () => {
  if (!confirm('이 브라우저에서 토큰을 지울까요? 게시하지 않은 글은 그대로 남습니다.')) return;
  setToken(null);
  location.reload();
});

// ---------- 목록 ----------
async function loadList() {
  setStatus('불러오는 중…');
  const repo = await listPosts();
  const fromRepo = await Promise.all(
    repo.map(async (r) => {
      const { meta } = parsePost(await readFile(`${CONTENT}/${r.kind}/${r.slug}/index.md`));
      return { kind: r.kind, id: r.slug, meta, repo: r, local: false } satisfies ListItem;
    }),
  );
  const drafts = listDrafts();
  items = fromRepo.map((it) => {
    const d = drafts.find((x) => x.kind === it.kind && x.slug === it.id);
    return d ? { ...it, meta: d.meta, local: true } : it;
  });
  for (const d of drafts) {
    if (d.isNew) items.push({ kind: d.kind, id: d.slug, meta: d.meta, repo: null, local: true });
  }
  items.sort((a, b) => b.meta.date.localeCompare(a.meta.date));
  renderList();
  setStatus('');
}

function renderList() {
  const q = $<HTMLInputElement>('[data-search]').value.trim().toLowerCase();
  const html = (['writeups', 'projects'] as Kind[])
    .map((kind) => {
      const rows = items
        .filter((it) => it.kind === kind && (!q || it.meta.title.toLowerCase().includes(q)))
        .map((it) => {
          const active = cur && cur.kind === it.kind && cur.id === it.id ? ' is-active' : '';
          const icon =
            kind === 'writeups'
              ? `<span class="cat" data-cat="${esc(it.meta.category)}">${esc(it.meta.category.slice(0, 1).toUpperCase())}</span>`
              : `<span class="cat">P</span>`;
          const badge = it.local
            ? '<span class="badge badge-local">게시 안 됨</span>'
            : it.meta.draft
              ? '<span class="badge">임시</span>'
              : '';
          const title = it.meta.title
            ? `<span class="t">${esc(it.meta.title)}</span>`
            : '<span class="t is-empty">제목 없음</span>';
          return `<a class="side-item${active}" href="#${kind}/${it.id}">${icon}${title}${badge}</a>`;
        })
        .join('');
      return `<div class="side-group">${KIND_LABEL[kind]}</div>${rows || '<div class="side-item" style="color:var(--muted)">없음</div>'}`;
    })
    .join('');
  $('[data-list]').innerHTML = html;
}

$('[data-search]').addEventListener('input', renderList);

// ---------- 글 열기 ----------
async function open(kind: Kind, id: string) {
  if (busy) return;
  await flushDraft();
  const item = items.find((it) => it.kind === kind && it.id === id);
  const draft = loadDraft(kind, id);
  if (!item && !draft) {
    showEmpty();
    return;
  }

  let meta: Meta;
  let body: string;
  if (draft) {
    meta = draft.meta;
    body = draft.body;
  } else {
    setStatus('불러오는 중…');
    ({ meta, body } = parsePost(await readFile(`${CONTENT}/${kind}/${id}/index.md`)));
    setStatus('');
  }

  // 아직 올리지 않은 사진을 IndexedDB 에서 되살린다
  const images = new Map<string, Blob>();
  const urls = new Map<string, string>();
  for (const name of draft?.images ?? []) {
    const blob = await getImage(`${kind}/${id}/${name}`);
    if (blob) {
      images.set(name, blob);
      urls.set(name, URL.createObjectURL(blob));
    }
  }

  cur = { kind, id, meta, repo: item?.repo ?? null, slugInput: item?.repo ? id : '', images, urls, dirty: !!draft };
  renderPage(body);
  renderList();
  $('[data-side]').classList.remove('is-open');
}

function showEmpty() {
  cur = null;
  $('[data-page]').hidden = true;
  $('[data-actions]').hidden = true;
  $('[data-empty]').hidden = false;
  $('[data-crumb]').textContent = '';
  setStatus('');
  renderList();
}

async function createNew(kind: Kind) {
  const id = `new-${Date.now().toString(36)}`;
  const meta = emptyMeta();
  saveDraft({ kind, slug: id, meta, body: NEW_BODY[kind], isNew: true, images: [], updatedAt: Date.now() });
  items.unshift({ kind, id, meta, repo: null, local: true });
  location.hash = `${kind}/${id}`;
}

document.querySelectorAll<HTMLElement>('[data-new]').forEach((b) =>
  b.addEventListener('click', () => createNew(b.dataset.new as Kind)),
);

// ---------- 화면 그리기 ----------
function renderPage(body: string) {
  if (!cur) return;
  $('[data-empty]').hidden = true;
  $('[data-page]').hidden = false;
  $('[data-actions]').hidden = false;

  const title = $<HTMLTextAreaElement>('[data-title]');
  title.value = cur.meta.title;
  autosize(title);
  renderProps();
  renderTopbar();
  mountEditor(body);
  if (!cur.meta.title) title.focus();
}

function renderTopbar() {
  if (!cur) return;
  const published = !!cur.repo && !cur.meta.draft;
  $('[data-crumb]').innerHTML =
    `${KIND_LABEL[cur.kind]}<span class="sep">/</span>${esc(cur.meta.title || '제목 없음')}`;
  $('[data-publish]').textContent = published ? '업데이트' : '게시';
  const link = $<HTMLAnchorElement>('[data-view-link]');
  link.hidden = !cur.repo;
  link.href = `/${cur.kind}/${cur.id}/`;
  $('[data-revert]').hidden = !cur.repo;
  const href = `/${cur.kind}/${cur.id}/`;
  if (!busy)
    setStatus(
      cur.dirty ? '게시 안 된 변경 있음' : deployNote?.href === href ? deployNote.html : cur.repo ? '저장됨' : '',
    );
}

const ICON: Record<string, string> = {
  category: '◉',
  platform: '⌂',
  level: '#',
  date: '◷',
  tags: '≡',
  link: '↗',
  description: '¶',
  slug: '/',
  period: '◷',
  role: '☺',
  stack: '≡',
  repo: '↗',
  demo: '↗',
  featured: '★',
};

function renderProps() {
  if (!cur) return;
  const m = cur.meta;
  const row = (key: string, label: string, control: string) =>
    `<div class="prop"><span class="prop-label"><i>${ICON[key]}</i>${label}</span>${control}</div>`;
  const text = (key: keyof Meta, placeholder: string, type = 'text') =>
    `<input type="${type}" data-prop="${key}" value="${esc(String(m[key] ?? ''))}" placeholder="${placeholder}" />`;
  const listInput = (key: 'tags' | 'stack', placeholder: string) =>
    `<input type="text" data-prop-list="${key}" value="${esc(m[key].join(', '))}" placeholder="${placeholder}" />`;

  const slugRow = row(
    'slug',
    '주소',
    `<div class="prop-slug">/${cur.kind}/<input type="text" data-slug value="${esc(cur.repo ? cur.id : cur.slugInput)}" placeholder="${esc(makeSlugPreview())}" ${cur.repo ? 'disabled title="게시한 글의 주소는 바꿀 수 없습니다"' : ''} /></div>`,
  );

  let html = '';
  if (cur.kind === 'writeups') {
    const chips = CATEGORIES.map(
      ([k, label]) =>
        `<button type="button" class="chip-opt" data-cat="${k}" data-category="${k}" aria-pressed="${m.category === k}">${label}</button>`,
    ).join('');
    html =
      row('category', '분야', `<div class="chips">${chips}</div>`) +
      row('platform', '플랫폼', text('platform', 'Dreamhack')) +
      row('level', '레벨', text('level', '비어 있음')) +
      row('date', '날짜', text('date', '', 'date')) +
      row('tags', '태그', listInput('tags', '쉼표로 구분 (bof, rop)')) +
      row('link', '문제 링크', text('link', 'https://dreamhack.io/wargame/challenges/…', 'url')) +
      row('description', '요약', text('description', '목록에 보이는 한 줄 설명')) +
      slugRow;
  } else {
    html =
      row('description', '소개', text('description', '카드에 보이는 한두 문장')) +
      row('period', '기간', text('period', '2026.09 — 2026.11')) +
      row('role', '역할', text('role', '개인 프로젝트')) +
      row('stack', '기술', listInput('stack', '쉼표로 구분 (Python, FastAPI)')) +
      row('repo', '코드', text('repo', 'https://github.com/…', 'url')) +
      row('demo', '데모', text('demo', 'https://…', 'url')) +
      row('date', '날짜', text('date', '', 'date')) +
      row(
        'featured',
        '메인 노출',
        `<label class="toggle"><input type="checkbox" data-featured ${m.featured ? 'checked' : ''} /> 메인 화면에 먼저 보이기</label>`,
      ) +
      slugRow;
  }
  $('[data-props]').innerHTML = html;
}

function makeSlugPreview() {
  return cur?.meta.title ? makeSlug(cur.meta.title) : '제목에서 자동으로 만들어짐';
}

function autosize(t: HTMLTextAreaElement) {
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight}px`;
}

// ---------- 속성 편집 ----------
$('[data-title]').addEventListener('input', (e) => {
  if (!cur) return;
  const t = e.currentTarget as HTMLTextAreaElement;
  cur.meta.title = t.value.replace(/\n/g, ' ');
  autosize(t);
  const slug = document.querySelector<HTMLInputElement>('[data-slug]');
  if (slug && !cur.repo) slug.placeholder = makeSlugPreview();
  changed();
  renderTopbar();
});
// 제목에서 엔터를 치면 본문으로 내려간다
$('[data-title]').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    document.querySelector<HTMLElement>('.editor .ProseMirror')?.focus();
  }
});

$('[data-props]').addEventListener('input', (e) => {
  if (!cur) return;
  const el = e.target as HTMLInputElement;
  if (el.dataset.prop) (cur.meta as unknown as Record<string, string>)[el.dataset.prop] = el.value;
  else if (el.dataset.propList)
    (cur.meta as unknown as Record<string, string[]>)[el.dataset.propList] = el.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  else if (el.dataset.slug !== undefined) cur.slugInput = el.value.trim().toLowerCase();
  else if (el.dataset.featured !== undefined) cur.meta.featured = el.checked;
  else return;
  changed();
});

$('[data-props]').addEventListener('click', (e) => {
  const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-category]');
  if (!chip || !cur) return;
  cur.meta.category = chip.dataset.category!;
  document
    .querySelectorAll<HTMLElement>('[data-category]')
    .forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
  changed();
});

// ---------- 본문 편집기 ----------
async function mountEditor(body: string) {
  await crepe?.destroy();
  const root = $('[data-editor]');
  root.innerHTML = '';
  const c = cur!;

  crepe = new Crepe({
    root,
    defaultValue: body,
    features: { [Crepe.Feature.AI]: false, [Crepe.Feature.TopBar]: false, [Crepe.Feature.Latex]: false },
    featureConfigs: {
      [Crepe.Feature.Placeholder]: { text: "'/' 를 눌러 블록 추가, 사진은 붙여넣기(⌘V)", mode: 'block' },
      [Crepe.Feature.ImageBlock]: {
        onUpload: (file) => addImage(c, file),
        inlineOnUpload: (file) => addImage(c, file),
        blockOnUpload: (file) => addImage(c, file),
        proxyDomURL: (url) => displayUrl(c, url),
        blockUploadPlaceholderText: '사진을 붙여넣거나 끌어다 놓으세요',
        blockCaptionPlaceholderText: '사진 설명',
        inlineUploadPlaceholderText: '또는 사진 주소 붙여넣기',
        blockConfirmButton: '확인',
        inlineConfirmButton: '확인',
        blockUploadButton: '사진 올리기',
        inlineUploadButton: '사진 올리기',
      },
      [Crepe.Feature.CodeMirror]: { searchPlaceholder: '언어 검색', noResultText: '없음', copyText: '복사', previewLabel: '미리보기' },
      [Crepe.Feature.BlockEdit]: {
        textGroup: {
          label: '텍스트',
          text: { label: '텍스트' },
          h1: { label: '제목 1' },
          h2: { label: '제목 2' },
          h3: { label: '제목 3' },
          h4: null,
          h5: null,
          h6: null,
          quote: { label: '인용' },
          divider: { label: '구분선' },
        },
        listGroup: {
          label: '목록',
          bulletList: { label: '글머리 기호 목록' },
          orderedList: { label: '번호 매기기 목록' },
          taskList: { label: '할 일 목록' },
        },
        advancedGroup: {
          label: '고급',
          image: { label: '이미지' },
          codeBlock: { label: '코드' },
          table: { label: '표' },
          math: null,
        },
        buildMenu: (builder) => {
          const group = builder.addGroup('callout', '강조 상자');
          const callouts: [string, string, string][] = [
            ['NOTE', '참고', 'ℹ'],
            ['TIP', '팁', '✓'],
            ['WARNING', '주의', '!'],
            ['IMPORTANT', '중요', '★'],
          ];
          for (const [type, label, icon] of callouts) {
            group.addItem(`callout-${type}`, {
              label,
              icon: `<span style="font-weight:700">${icon}</span>`,
              onRun: (ctx) => insert(`> [!${type}]\n> 내용`)(ctx),
            });
          }
        },
      },
    },
  });
  let baseline: string | null = null;
  crepe.on((l) =>
    l.markdownUpdated((_ctx, md) => {
      if (baseline !== null && md !== baseline) changed();
    }),
  );
  await crepe.create();
  baseline = crepe.getMarkdown();
}

/** 붙여넣은 사진: 이름을 정해 보관하고, 본문에는 ./image-N.png 로 넣는다. */
async function addImage(c: Current, file: File) {
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '') || 'png';
  const taken = new Set([...(c.repo?.files ?? []), ...c.images.keys()]);
  let n = 1;
  while (taken.has(`image-${n}.${ext}`)) n++;
  const name = `image-${n}.${ext}`;
  c.images.set(name, file);
  c.urls.set(name, URL.createObjectURL(file));
  await putImage(`${c.kind}/${c.id}/${name}`, file);
  changed();
  return `./${name}`;
}

function displayUrl(c: Current, url: string) {
  const m = url.match(/^\.?\/?([^/:?#]+\.(?:png|jpe?g|gif|webp|svg|avif))$/i);
  if (!m) return url;
  return c.urls.get(m[1]) ?? rawUrl(`${CONTENT}/${c.kind}/${c.id}/${m[1]}`);
}

// ---------- 임시 저장 (브라우저) ----------
function changed() {
  if (!cur) return;
  cur.dirty = true;
  deployNote = null;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flushDraft, 400);
  if (!busy) setStatus('게시 안 된 변경 있음');
  const it = items.find((i) => i.kind === cur!.kind && i.id === cur!.id);
  if (it) {
    it.meta = cur.meta;
    if (!it.local) {
      it.local = true;
      renderList();
    }
  }
}

async function flushDraft() {
  clearTimeout(saveTimer);
  if (!cur || !crepe || !cur.dirty) return;
  const d: Draft = {
    kind: cur.kind,
    slug: cur.id,
    meta: cur.meta,
    body: cleanMarkdown(crepe.getMarkdown()),
    isNew: !cur.repo,
    images: [...cur.images.keys()],
    updatedAt: Date.now(),
  };
  saveDraft(d);
  renderListTitleOnly();
}

function renderListTitleOnly() {
  const active = document.querySelector('.side-item.is-active .t');
  if (active && cur) {
    active.textContent = cur.meta.title || '제목 없음';
    active.classList.toggle('is-empty', !cur.meta.title);
  }
}

// ---------- 게시 ----------
async function publish(asDraft: boolean) {
  if (!cur || !crepe || busy) return;
  const c = cur;
  if (!c.meta.title.trim()) {
    toast('제목을 먼저 적어 주세요.');
    $('[data-title]').focus();
    return;
  }
  const slug = c.repo ? c.id : c.slugInput || makeSlug(c.meta.title);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    toast('주소는 영문 소문자, 숫자, - 만 쓸 수 있어요.');
    return;
  }
  if (!c.repo && items.some((it) => it.kind === c.kind && it.id === slug && it.repo)) {
    toast(`이미 있는 주소예요: /${c.kind}/${slug}/`);
    return;
  }

  busy = true;
  $<HTMLButtonElement>('[data-publish]').disabled = true;
  setStatus(asDraft ? '임시 저장하는 중…' : '게시하는 중…');
  try {
    const meta = { ...c.meta, draft: asDraft };
    const body = cleanMarkdown(crepe.getMarkdown());
    const dir = `${CONTENT}/${c.kind}/${slug}`;

    // 본문에서 쓰는 사진만 올리고, 저장소에 있지만 더 이상 안 쓰는 사진은 지운다
    const used = new Set([...body.matchAll(/\]\(\.\/([^)\s]+)\)/g)].map((m) => decodeURIComponent(m[1])));
    const changes: Change[] = [{ path: `${dir}/index.md`, text: serializePost(c.kind, meta, body) }];
    for (const [name, blob] of c.images) if (used.has(name)) changes.push({ path: `${dir}/${name}`, blob });
    for (const name of c.repo?.files ?? []) {
      if (name !== 'index.md' && /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(name) && !used.has(name))
        changes.push({ path: `${dir}/${name}`, remove: true });
    }

    const verb = c.repo ? '수정' : asDraft ? '임시 저장' : '새 글';
    const sha = await commit(`${KIND_LABEL[c.kind]} ${verb}: ${meta.title}`, changes);

    // 브라우저 임시 저장 정리
    for (const name of c.images.keys()) await deleteImage(`${c.kind}/${c.id}/${name}`);
    removeDraft(c.kind, c.id);
    items = items.filter((it) => !(it.kind === c.kind && it.id === c.id));
    const files = [...new Set(['index.md', ...[...used].filter((n) => c.images.has(n) || c.repo?.files.includes(n))])];
    items.unshift({ kind: c.kind, id: slug, meta, repo: { kind: c.kind, slug, files }, local: false });
    busy = false;

    if (c.id !== slug) {
      cur = null; // 이전(new-…) 임시 글이 다시 저장되지 않게
      location.hash = `${c.kind}/${slug}`;
      await new Promise((r) => setTimeout(r));
    } else {
      cur = { ...c, meta, repo: { kind: c.kind, slug, files }, images: new Map(), dirty: false };
      renderTopbar();
      renderList();
    }
    watchDeploy(sha, asDraft, `/${c.kind}/${slug}/`);
  } catch (ex) {
    busy = false;
    setStatus('');
    toast(`저장하지 못했어요. ${(ex as Error).message}`, 6000);
  } finally {
    $<HTMLButtonElement>('[data-publish]').disabled = false;
  }
}

/** 배포가 끝나 사이트에 반영됐는지 지켜본다 */
async function watchDeploy(sha: string, asDraft: boolean, href: string) {
  const note = (html: string) => {
    deployNote = { href, html };
    if (cur && !cur.dirty && `/${cur.kind}/${cur.id}/` === href) setStatus(html);
  };
  note(asDraft ? 'GitHub에 임시 저장됨' : '게시됨 · 사이트 반영 중… (1~2분)');
  if (asDraft) return;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const run = await latestDeploy().catch(() => null);
    if (run?.head_sha !== sha || run.status !== 'completed') continue;
    note(
      run.conclusion === 'success'
        ? `사이트에 반영됨 · <a href="${href}" target="_blank">보기 ↗</a>`
        : '사이트 반영 실패 · GitHub Actions 확인 필요',
    );
    return;
  }
}

$('[data-publish]').addEventListener('click', () => publish(false));
$('[data-save-draft]').addEventListener('click', () => {
  $('[data-more-menu]').hidden = true;
  publish(true);
});

$('[data-revert]').addEventListener('click', async () => {
  $('[data-more-menu]').hidden = true;
  if (!cur?.repo || !confirm('게시하지 않은 변경을 버리고 저장된 버전으로 되돌릴까요?')) return;
  for (const name of cur.images.keys()) await deleteImage(`${cur.kind}/${cur.id}/${name}`);
  removeDraft(cur.kind, cur.id);
  const it = items.find((i) => i.kind === cur!.kind && i.id === cur!.id);
  if (it) it.local = false;
  const { kind, id } = cur;
  cur.dirty = false;
  cur = null;
  await open(kind, id);
});

$('[data-delete]').addEventListener('click', async () => {
  $('[data-more-menu]').hidden = true;
  if (!cur) return;
  const c = cur;
  if (!confirm(`"${c.meta.title || '제목 없음'}" 글을 삭제할까요? 되돌릴 수 없습니다.`)) return;
  try {
    if (c.repo) {
      setStatus('삭제하는 중…');
      await commit(
        `${KIND_LABEL[c.kind]} 삭제: ${c.meta.title}`,
        c.repo.files.map((f) => ({ path: `${CONTENT}/${c.kind}/${c.id}/${f}`, remove: true as const })),
      );
    }
    for (const name of c.images.keys()) await deleteImage(`${c.kind}/${c.id}/${name}`);
    removeDraft(c.kind, c.id);
    items = items.filter((it) => !(it.kind === c.kind && it.id === c.id));
    cur = null;
    location.hash = '';
    showEmpty();
    toast('삭제했어요.');
  } catch (ex) {
    setStatus('');
    toast(`삭제하지 못했어요. ${(ex as Error).message}`, 6000);
  }
});

// 더보기 메뉴
$('[data-more]').addEventListener('click', (e) => {
  e.stopPropagation();
  const m = $('[data-more-menu]');
  m.hidden = !m.hidden;
});
document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('.more')) $('[data-more-menu]').hidden = true;
});
$('[data-toggle-side]').addEventListener('click', () => $('[data-side]').classList.toggle('is-open'));

// ⌘S / Ctrl+S: 브라우저에 바로 저장
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    flushDraft();
    toast('이 브라우저에 저장했어요. 사이트에 올리려면 게시를 누르세요.');
  }
});
window.addEventListener('beforeunload', () => {
  flushDraft();
});

// ---------- 시작 ----------
function route() {
  const m = location.hash.match(/^#(writeups|projects)\/([a-z0-9-]+)$/);
  if (m) open(m[1] as Kind, m[2]);
  else showEmpty();
}

async function start() {
  show('app');
  try {
    await loadList();
  } catch (ex) {
    const msg = (ex as Error).message;
    if (msg.includes('401')) {
      setToken(null);
      show('login');
      $('[data-login-error]').textContent = '토큰이 만료됐거나 올바르지 않습니다. 다시 넣어 주세요.';
      return;
    }
    toast(`목록을 불러오지 못했어요. ${msg}`, 6000);
  }
  route();
}

window.addEventListener('hashchange', route);
if (getToken()) start();
else show('login');
