// 글쓰기 화면이 GitHub 저장소를 직접 읽고 쓴다. 토큰은 이 브라우저(localStorage)에만 저장된다.
export const OWNER = 'eklim23';
export const REPO = 'eklim23.github.io';
export const CONTENT = 'src/content';

const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const TOKEN_KEY = 'write:token';

// 개발 서버에서는 ?branch= 로 다른 브랜치에 저장해 볼 수 있다.
export const BRANCH = (import.meta.env.DEV && new URLSearchParams(location.search).get('branch')) || 'main';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (t: string | null) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 저장소를 쓸 수 없는 브라우저에서는 이번 세션만 유지된다 */
  }
};

async function gh<T>(path: string, init: RequestInit = {}, token = getToken()): Promise<T> {
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const msg = await res.json().then((j) => j.message).catch(() => res.statusText);
    throw new Error(`GitHub ${res.status}: ${msg}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/** 토큰이 이 저장소에 쓰기 권한이 있는지 확인한다. */
export async function checkToken(token: string) {
  const repo = await gh<{ permissions?: { push?: boolean } }>('', {}, token);
  if (!repo.permissions?.push) throw new Error('이 토큰에는 저장소 쓰기 권한이 없습니다.');
}

// UTF-8 문자열 ↔ base64
const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export interface RepoPost {
  kind: 'writeups' | 'projects';
  slug: string;
  files: string[]; // 글 폴더 안의 파일 이름들 (index.md, image-1.png …)
}

/** 저장소의 글 폴더 목록 */
export async function listPosts(): Promise<RepoPost[]> {
  const tree = await gh<{ tree: { path: string; type: string }[] }>(`/git/trees/${BRANCH}?recursive=1`);
  const posts = new Map<string, RepoPost>();
  for (const { path, type } of tree.tree) {
    const m = path.match(/^src\/content\/(writeups|projects)\/([a-z0-9][a-z0-9-]*)\/([^/]+)$/);
    if (!m || type !== 'blob') continue;
    const key = `${m[1]}/${m[2]}`;
    if (!posts.has(key)) posts.set(key, { kind: m[1] as RepoPost['kind'], slug: m[2], files: [] });
    posts.get(key)!.files.push(m[3]);
  }
  return [...posts.values()].filter((p) => p.files.includes('index.md'));
}

export async function readFile(path: string) {
  const file = await gh<{ content: string }>(`/contents/${encodeURI(path)}?ref=${BRANCH}`);
  return fromBase64(file.content);
}

/** 화면에 보여줄 때 쓰는 원본 파일 주소 */
export const rawUrl = (path: string) =>
  `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path.split('/').map(encodeURIComponent).join('/')}`;

export type Change = { path: string; text: string } | { path: string; blob: Blob } | { path: string; remove: true };

/** 여러 파일을 커밋 하나로 저장한다. */
export async function commit(message: string, changes: Change[]) {
  const ref = await gh<{ object: { sha: string } }>(`/git/ref/heads/${BRANCH}`);
  const parent = await gh<{ tree: { sha: string } }>(`/git/commits/${ref.object.sha}`);

  const tree = await Promise.all(
    changes.map(async (c) => {
      if ('remove' in c) return { path: c.path, mode: '100644', type: 'blob', sha: null };
      const body =
        'text' in c
          ? { content: c.text, encoding: 'utf-8' }
          : { content: toBase64(new Uint8Array(await c.blob.arrayBuffer())), encoding: 'base64' };
      const blob = await gh<{ sha: string }>('/git/blobs', { method: 'POST', body: JSON.stringify(body) });
      return { path: c.path, mode: '100644', type: 'blob', sha: blob.sha };
    }),
  );

  const newTree = await gh<{ sha: string }>('/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: parent.tree.sha, tree }),
  });
  const newCommit = await gh<{ sha: string }>('/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }),
  });
  await gh(`/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: newCommit.sha }) });
  return newCommit.sha;
}

/** 마지막 배포 상태 (사이트 반영 여부를 알려주기 위해) */
export async function latestDeploy() {
  const runs = await gh<{ workflow_runs: { head_sha: string; status: string; conclusion: string | null }[] }>(
    `/actions/runs?branch=${BRANCH}&per_page=1`,
  );
  return runs.workflow_runs[0] ?? null;
}
