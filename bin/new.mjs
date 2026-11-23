// 새 글 만들기:  npm run new
// 몇 가지 질문에 답하면 src/content/<종류>/<이름>/index.md 를 만들어 준다.
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { CATEGORIES, SLUG, createPost, slugify } from './posts.mjs';

// 사이트 폴더를 VS Code 작업 폴더로 열어야 .vscode/settings.json(사진 붙여넣기 설정)이 적용된다.
function openInVSCode(file) {
  const code = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
  if (!existsSync(code)) return;
  spawn(code, [process.cwd(), '-g', file], { detached: true, stdio: 'ignore' }).unref();
  console.log('VS Code에서 열었습니다.');
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const lines = rl[Symbol.asyncIterator]();
const ask = async (q, fallback = '') => {
  process.stdout.write(fallback ? `${q} [${fallback}]: ` : `${q}: `);
  const { value, done } = await lines.next();
  if (done) process.exit(1);
  return value.trim() || fallback;
};

const kind = (await ask('종류 (1: 라이트업, 2: 프로젝트)', '1')) === '2' ? 'projects' : 'writeups';
const title = await ask('제목');
if (!title) {
  console.log('제목이 필요합니다.');
  process.exit(1);
}

let slug = '';
while (!slug) {
  slug = await ask('주소 이름 (영문 소문자, 숫자, -)', slugify(title));
  if (!SLUG.test(slug)) {
    console.log('영문 소문자, 숫자, - 만 쓸 수 있습니다.');
    slug = '';
  }
}

const opts = { title, slug };
if (kind === 'writeups') {
  opts.platform = await ask('플랫폼', 'Dreamhack');
  let category = '';
  while (!CATEGORIES.includes(category)) {
    category = await ask(`분야 (${CATEGORIES.join(', ')})`, 'web');
  }
  opts.category = category;
  opts.level = await ask('레벨 (없으면 엔터)');
}
rl.close();

try {
  const file = createPost(kind, opts);
  console.log(`\n만들었습니다: ${file}`);
  console.log(`미리보기: npm run dev 실행 후 http://localhost:4321/${kind}/${opts.slug}/`);
  openInVSCode(file);
} catch (err) {
  console.log(err.message);
  process.exit(1);
}
