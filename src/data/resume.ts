// 이력서 내용. 항목을 추가하면 /resume 페이지에 그대로 나온다.
// 비어 있는 섹션은 화면에 나오지 않는다.

export interface ResumeItem {
  title: string;
  org?: string;
  period?: string;
  detail?: string[];
  link?: string;
}

export const resume = {
  summary: '', // 자기소개 몇 줄

  // 예)
  // { title: '컴퓨터공학과', org: '○○대학교', period: '2024 — 현재' },
  education: [] as ResumeItem[],

  // 예)
  // { title: '○○ 보안 동아리', period: '2025 — 현재', detail: ['웹 해킹 스터디'] },
  experience: [] as ResumeItem[],

  awards: [] as ResumeItem[],
  certifications: [] as ResumeItem[],

  // 예)
  // { group: '언어', items: ['Python', 'C'] },
  skills: [] as { group: string; items: string[] }[],
};
