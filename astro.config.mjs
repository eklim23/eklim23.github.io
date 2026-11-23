// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import { callouts } from './plugins/callouts.mjs';

// https://astro.build/config
export default defineConfig({
  // 저장소 이름을 <아이디>.github.io 로 만들면 이 주소가 그대로 사이트 주소가 된다.
  site: 'https://eklim23.github.io',
  prefetch: { prefetchAll: true },
  markdown: {
    processor: satteri({ hastPlugins: [callouts], features: { smartPunctuation: false } }),
    shikiConfig: { theme: 'github-dark-default', wrap: false },
  },
});
