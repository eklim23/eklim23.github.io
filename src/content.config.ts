import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// 글은 폴더 하나에 index.md 로 쓴다.  예) writeups/basic-bof/index.md → /writeups/basic-bof/
// 이미지는 같은 폴더에 넣고 ![설명](./image.png) 로 쓴다.
// _ 로 시작하는 파일은 사이트에 올라가지 않는다.
const writeups = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/writeups' }),
  schema: z.object({
    title: z.string(),
    description: z.string().nullish(),
    platform: z.string().nullish().transform((v) => v || 'Dreamhack'),
    category: z.enum(['web', 'pwn', 'rev', 'crypto', 'forensics', 'misc']),
    level: z.union([z.number(), z.string()]).nullish(),
    date: z.coerce.date(),
    tags: z.array(z.string()).nullish().transform((v) => v ?? []),
    link: z.url().nullish(),
    draft: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string().nullish(),
    date: z.coerce.date(),
    period: z.coerce.string().nullish(),
    role: z.string().nullish(),
    stack: z.array(z.string()).nullish().transform((v) => v ?? []),
    repo: z.url().nullish(),
    demo: z.url().nullish(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

export const collections = { writeups, projects };
