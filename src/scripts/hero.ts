import { navigate } from 'astro:transitions/client';
import { Bricks, type BrickLink } from './bricks';

// 메인 화면 창 안의 레고 블록. 블록 하나가 라이트업 하나와 연결된다.
export function initHero(reduced: boolean) {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-bricks]');
  if (!canvas) return null;
  const links: BrickLink[] = JSON.parse(document.getElementById('brick-links')?.textContent ?? '[]');
  const tip = document.querySelector<HTMLElement>('[data-brick-tip]');

  const move = (e: PointerEvent) => {
    if (tip) tip.style.transform = `translate(${e.clientX + 18}px, ${e.clientY + 18}px)`;
  };
  window.addEventListener('pointermove', move);

  let bricks: Bricks;
  try {
    bricks = new Bricks(canvas, links, {
      reduced,
      onHover: (link) => {
        canvas.style.cursor = link ? 'pointer' : '';
        if (!tip) return;
        tip.hidden = !link;
        if (link) {
          tip.querySelector('[data-tip-meta]')!.textContent = link.meta;
          tip.querySelector('[data-tip-title]')!.textContent = link.title;
        }
      },
      onClick: (link) => navigate(link.href),
    });
  } catch (err) {
    console.warn('WebGL을 사용할 수 없습니다.', err);
    canvas.remove();
    window.removeEventListener('pointermove', move);
    return null;
  }

  return {
    destroy() {
      bricks.destroy();
      window.removeEventListener('pointermove', move);
    },
  };
}
