// 사이트 기본 정보. TODO 표시된 값을 본인 정보로 바꾸면 된다.
export const site = {
  name: '이름', // TODO
  handle: 'eklim23',
  role: '', // TODO: 예) 정보보호학과 3학년. 비워두면 표시하지 않는다.
  description: '라이트업, 프로젝트, 이력서',
  email: '', // TODO: 비워두면 표시하지 않는다.
  links: [
    { label: 'GitHub', href: 'https://github.com/eklim23' },
    // { label: 'Dreamhack', href: 'https://dreamhack.io/users/...' },
  ],
};

export const categories = {
  web: 'Web',
  pwn: 'Pwnable',
  rev: 'Reversing',
  crypto: 'Crypto',
  forensics: 'Forensics',
  misc: 'Misc',
} as const;
