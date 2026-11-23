import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type Lenis from 'lenis';

interface Ctx {
  lenis: Lenis;
  reduced: boolean;
}

// 텍스트를 단어(또는 글자) 단위 span 으로 쪼갠다. 안쪽 태그(<em> 등)는 유지한다.
function split(el: HTMLElement, mode: 'words' | 'chars') {
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of (child.textContent ?? '').split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.append(' ');
            continue;
          }
          const w = document.createElement('span');
          w.className = 'w';
          if (mode === 'chars') {
            for (const c of part) {
              const s = document.createElement('span');
              s.className = 'ch';
              s.textContent = c;
              w.append(s);
            }
          } else {
            const s = document.createElement('span');
            s.className = 'wi';
            s.textContent = part;
            w.append(s);
          }
          frag.append(w);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName !== 'BR') {
        walk(child);
      }
    }
  };
  walk(el);
  return el.querySelectorAll<HTMLElement>(mode === 'chars' ? '.ch' : '.wi');
}

export function initPage({ lenis, reduced }: Ctx) {
  const cleanups: (() => void)[] = [];
  const on = <K extends keyof HTMLElementEventMap>(
    el: HTMLElement | Window,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
  ) => {
    el.addEventListener(type, fn as EventListener);
    cleanups.push(() => el.removeEventListener(type, fn as EventListener));
  };

  const ctx = gsap.context(() => {});
  const splits = new Map<HTMLElement, NodeListOf<HTMLElement>>();

  // 1단계: 등장 애니메이션 전 초기 상태
  ctx.add(() => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-split]')) {
      const parts = split(el, el.dataset.split === 'chars' ? 'chars' : 'words');
      splits.set(el, parts);
      if (!reduced) gsap.set(parts, { yPercent: 115, rotate: el.dataset.split === 'chars' ? 8 : 0 });
    }
    if (!reduced) {
      const reveals = document.querySelectorAll('[data-reveal]');
      const rules = document.querySelectorAll('.rule[data-draw]');
      if (reveals.length) gsap.set(reveals, { autoAlpha: 0, y: 40 });
      if (rules.length) gsap.set(rules, { scaleX: 0 });
    }
  });

  // 헤더 메뉴 열고 닫기
  const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const menu = document.querySelector<HTMLElement>('[data-menu]');
  if (toggle && menu) {
    const set = (open: boolean) => {
      menu.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    on(toggle, 'click', (e) => {
      e.stopPropagation();
      set(!menu.classList.contains('is-open'));
    });
    const close = (e: Event) => {
      if (!menu.contains(e.target as Node)) set(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && set(false);
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    cleanups.push(() => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', esc);
    });
  }

  // 로고 옆 터미널 줄: 명령을 한 글자씩 쳤다가 지우고 다음 명령으로 넘어간다
  const typer = document.querySelector<HTMLElement>('[data-typer]');
  const typed = typer?.querySelector<HTMLElement>('[data-typer-text]');
  if (typer && typed) {
    const commands: string[] = JSON.parse(typer.dataset.typer ?? '[]');
    if (reduced) typed.textContent = commands[0] ?? '';
    else {
      let n = 0;
      let pos = 0;
      let deleting = false;
      let timer = 0;
      const tick = () => {
        const cmd = commands[n % commands.length];
        pos += deleting ? -1 : 1;
        typed.textContent = cmd.slice(0, pos);
        let wait = deleting ? 18 : 45 + Math.random() * 60;
        if (!deleting && pos >= cmd.length) {
          deleting = true;
          wait = 2600;
        } else if (deleting && pos <= 0) {
          deleting = false;
          n++;
          wait = 400;
        }
        timer = window.setTimeout(tick, wait);
      };
      timer = window.setTimeout(tick, 600);
      cleanups.push(() => clearTimeout(timer));
    }
  }

  // 맨 위로 버튼
  for (const el of document.querySelectorAll<HTMLElement>('[data-top]')) {
    on(el, 'click', () => lenis.scrollTo(0, { duration: 1.6 }));
  }

  // 코드 블록 복사 버튼
  for (const pre of document.querySelectorAll<HTMLElement>('.prose pre')) {
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.textContent = 'copy';
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.querySelector('code')?.innerText ?? '');
        btn.textContent = 'copied';
      } catch {
        btn.textContent = 'failed';
      }
      setTimeout(() => (btn.textContent = 'copy'), 1500);
    });
    pre.append(btn);
  }

  // 목차: 현재 읽는 섹션 표시
  const tocLinks = document.querySelectorAll<HTMLAnchorElement>('[data-toc] a');
  if (tocLinks.length) {
    const map = new Map<Element, HTMLAnchorElement>();
    for (const a of tocLinks) {
      const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
      if (target) map.set(target, a);
      a.addEventListener('click', (e) => {
        if (!target) return;
        e.preventDefault();
        lenis.scrollTo(target, { offset: -90 });
        history.replaceState(null, '', a.hash);
      });
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          tocLinks.forEach((l) => l.classList.remove('is-active'));
          map.get(entry.target)?.classList.add('is-active');
        }
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    map.forEach((_, h) => io.observe(h));
    cleanups.push(() => io.disconnect());
  }

  // 라이트업 카테고리 필터
  const filterRoot = document.querySelector<HTMLElement>('[data-filter-root]');
  if (filterRoot) {
    const buttons = filterRoot.querySelectorAll<HTMLButtonElement>('[data-filter]');
    const rows = document.querySelectorAll<HTMLElement>('[data-category]');
    const counter = document.querySelector<HTMLElement>('[data-filter-count]');
    const apply = (cat: string, animate: boolean) => {
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === cat)));
      const shown: HTMLElement[] = [];
      rows.forEach((r) => {
        const match = cat === 'all' || r.dataset.category === cat;
        r.hidden = !match;
        if (match) shown.push(r);
      });
      if (counter) counter.textContent = String(shown.length).padStart(2, '0');
      if (animate && !reduced) {
        gsap.fromTo(shown, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.04, ease: 'power3.out' });
      }
      ScrollTrigger.refresh();
      lenis.resize();
    };
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        const cat = b.dataset.filter!;
        const url = new URL(location.href);
        if (cat === 'all') url.searchParams.delete('c');
        else url.searchParams.set('c', cat);
        history.replaceState(history.state, '', url);
        apply(cat, true);
      }),
    );
    const initial = new URL(location.href).searchParams.get('c');
    if (initial && [...buttons].some((b) => b.dataset.filter === initial)) apply(initial, false);
  }

  // 2단계: 등장 애니메이션과 스크롤 연동
  const play = () => {
    if (reduced) return;
    ctx.add(() => {
      splits.forEach((parts, el) => {
        const chars = el.dataset.split === 'chars';
        gsap.to(parts, {
          yPercent: 0,
          rotate: 0,
          duration: chars ? 1.2 : 1.1,
          ease: 'expo.out',
          stagger: chars ? 0.025 : 0.035,
          delay: Number(el.dataset.delay ?? 0),
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        });
      });

      for (const el of document.querySelectorAll<HTMLElement>('[data-reveal]')) {
        gsap.to(el, {
          autoAlpha: 1,
          y: 0,
          duration: 1.1,
          ease: 'expo.out',
          delay: Number(el.dataset.delay ?? 0),
          scrollTrigger: { trigger: el, start: 'top 92%', once: true },
        });
      }

      for (const el of document.querySelectorAll<HTMLElement>('.rule[data-draw]')) {
        gsap.to(el, {
          scaleX: 1,
          duration: 1.4,
          ease: 'expo.inOut',
          scrollTrigger: { trigger: el, start: 'top 95%', once: true },
        });
      }

      // 스크롤에 맞춰 그려지는 곡선
      for (const path of document.querySelectorAll<SVGPathElement>('[data-draw-path]')) {
        const len = path.getTotalLength();
        gsap.fromTo(
          path,
          { strokeDasharray: len, strokeDashoffset: len },
          {
            strokeDashoffset: 0,
            ease: 'none',
            scrollTrigger: { trigger: path.closest('section') ?? path, start: 'top 85%', end: 'center 35%', scrub: 0.6 },
          },
        );
      }

      for (const el of document.querySelectorAll<HTMLElement>('[data-speed]')) {
        gsap.to(el, {
          yPercent: () => Number(el.dataset.speed) * -100,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      }

      // 숫자 카운트업
      for (const el of document.querySelectorAll<HTMLElement>('[data-count]')) {
        const obj = { v: 0 };
        gsap.to(obj, {
          v: Number(el.dataset.count),
          duration: 1.6,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
          onUpdate: () => (el.textContent = String(Math.round(obj.v)).padStart(2, '0')),
        });
      }
    });

    // 스크롤 속도에 따라 빨라지고 방향이 바뀌는 마키
    for (const el of document.querySelectorAll<HTMLElement>('[data-marquee]')) {
      const track = el.querySelector<HTMLElement>('.marquee-track')!;
      let x = 0;
      let dir = -1;
      const tick = () => {
        const v = lenis.velocity;
        if (Math.abs(v) > 0.5) dir = v > 0 ? -1 : 1;
        x += dir * (0.04 + Math.min(Math.abs(v) * 0.02, 0.6));
        if (x <= -50) x += 50;
        if (x > 0) x -= 50;
        track.style.transform = `translate3d(${x}%,0,0)`;
      };
      gsap.ticker.add(tick);
      cleanups.push(() => gsap.ticker.remove(tick));
    }

    ScrollTrigger.refresh();
  };

  const destroy = () => {
    cleanups.forEach((fn) => fn());
    ctx.revert();
    ScrollTrigger.getAll().forEach((t) => t.kill());
  };

  return { play, destroy };
}
