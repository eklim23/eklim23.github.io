# eklim23.github.io

## 글 쓰기

### 1. 새 글 만들기

```bash
npm run new
```

질문에 답하면 글 파일이 만들어지고 VS Code에서 바로 열립니다.

> 사진은 스크린샷을 찍고 글 안에서 ⌘V 하면 글 폴더에 저장되고 `![](./image.png)` 가 들어갑니다.
> 이 기능은 VS Code에서 `site` 폴더를 열었을 때만 동작합니다(`npm run new` 가 그렇게 열어 줍니다).

```
src/content/writeups/basic-bof/index.md     ← 라이트업
src/content/projects/my-tool/index.md       ← 프로젝트
```

### 2. 미리보기

```bash
npm run dev
```

브라우저에서 http://localhost:4321 을 열면 저장할 때마다 바로 반영됩니다.

### 3. 다 쓰면

파일 맨 위의 `draft: true` 를 `draft: false` 로 바꿉니다.
`draft: true` 인 글은 내 컴퓨터에서만 보이고 사이트에는 올라가지 않습니다.

### 4. 올리기

```bash
git add .
git commit -m "라이트업: basic-bof"
git push
```

push 하면 1~2분 뒤 사이트에 반영됩니다.

---

## 글 맨 위 정보 (라이트업)

```yaml
---
title: basic-bof           # 제목
description: 한 줄 요약     # 비워도 됨
platform: Dreamhack        # 비우면 Dreamhack
category: pwn              # web, pwn, rev, crypto, forensics, misc 중 하나
level: 1                   # 비워도 됨
date: 2026-11-17
tags: [bof, rop]           # 비워도 됨
link: https://...          # 문제 주소, 비워도 됨
draft: true
---
```

## 마크다운 문법

````md
## 큰 제목            ← 오른쪽 목차에 나옵니다
### 작은 제목

**굵게**, `인라인 코드`, [링크](https://dreamhack.io)

- 목록
1. 번호 목록

```python
from pwn import *
```

| 오프셋 | 내용 |
| --- | --- |
| rbp-0x20 | buf |

![스크린샷](./debug.png)      ← 이미지는 글 폴더 안에 넣기

> [!NOTE]
> 참고 상자

> [!TIP]
> 팁 상자

> [!WARNING]
> 주의 상자

> [!IMPORTANT] 제목을 직접 쓸 수도 있음
> 내용
````

## 내 정보 바꾸기

| 파일 | 내용 |
| --- | --- |
| `src/data/site.ts` | 이름, 이메일, 링크 |
| `src/data/resume.ts` | 이력서 |
