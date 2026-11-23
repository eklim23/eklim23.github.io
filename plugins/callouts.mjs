// GitHub 스타일 강조 상자를 지원한다.
//
//   > [!NOTE]
//   > 내용
//
// [!NOTE] 뒤에 글자를 쓰면 상자 제목이 된다.  예) > [!WARNING] 주의할 점
import { defineHastPlugin } from 'satteri';

const TYPES = {
  NOTE: '참고',
  TIP: '팁',
  IMPORTANT: '중요',
  WARNING: '주의',
  CAUTION: '위험',
};

const MARKER = /^\s*\[!(\w+)\][ \t]*([^\n]*)\n?/;

export const callouts = defineHastPlugin({
  name: 'callouts',
  element: {
    filter: ['blockquote'],
    visit(node) {
      const children = [...node.children];
      const firstIndex = children.findIndex((c) => c.type === 'element');
      const first = children[firstIndex];
      const text = first?.tagName === 'p' ? first.children[0] : null;
      if (text?.type !== 'text') return;

      const m = text.value.match(MARKER);
      const key = m?.[1].toUpperCase();
      if (!m || !TYPES[key]) return;

      const rest = text.value.slice(m[0].length);
      let para = [...first.children];
      if (rest) para[0] = { ...text, value: rest };
      else {
        para.shift();
        if (para[0]?.type === 'element' && para[0].tagName === 'br') para.shift();
        if (para[0]?.type === 'text') para[0] = { ...para[0], value: para[0].value.replace(/^\n/, '') };
      }
      if (para.length) children[firstIndex] = { ...first, children: para };
      else children.splice(firstIndex, 1);

      return {
        type: 'element',
        tagName: 'aside',
        properties: { className: ['callout', `callout-${key.toLowerCase()}`] },
        children: [
          {
            type: 'element',
            tagName: 'p',
            properties: { className: ['callout-title'] },
            children: [{ type: 'text', value: m[2].trim() || TYPES[key] }],
          },
          ...children,
        ],
      };
    },
  },
});
