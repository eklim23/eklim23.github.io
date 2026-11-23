import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initPage } from './page';
import { initHero } from './hero';

// 이 모듈은 첫 방문 때 한 번만 실행된다. 이후 페이지 이동은 astro:* 이벤트로 처리한다.
gsap.registerPlugin(ScrollTrigger);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const lenis = new Lenis({ lerp: reduced ? 1 : 0.1, smoothWheel: !reduced });
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
lenis.on('scroll', ScrollTrigger.update);

// 아래로 스크롤하면 헤더의 로고와 문구를 숨기고, 위로 올리면 다시 보여준다
lenis.on('scroll', ({ scroll, direction }: Lenis) => {
  document.querySelector('.header')?.classList.toggle('is-hidden', scroll > 120 && direction === 1);
});

let page: ReturnType<typeof initPage> | null = null;
let hero: ReturnType<typeof initHero> = null;

document.addEventListener('astro:before-swap', () => {
  page?.destroy();
  hero?.destroy();
  page = null;
  hero = null;
});

document.addEventListener('astro:after-swap', () => {
  if (!location.hash) lenis.scrollTo(0, { immediate: true, force: true });
});

document.addEventListener('astro:page-load', () => {
  lenis.resize();
  hero = initHero(reduced);
  page = initPage({ lenis, reduced });
  page.play();
});
