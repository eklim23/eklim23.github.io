import { getCollection } from 'astro:content';

export async function getWriteups() {
  const items = await getCollection('writeups', ({ data }) => import.meta.env.DEV || !data.draft);
  return items.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getProjects() {
  const items = await getCollection('projects', ({ data }) => import.meta.env.DEV || !data.draft);
  return items.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function formatDate(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '.');
}

export function pad(n: number) {
  return String(n).padStart(2, '0');
}
