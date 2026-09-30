# dev.minahdev.cloud

개발 로그. Jekyll + GitHub Pages. `main` 에 push 하면 2~3분 뒤 반영된다.

## 글 쓰기

`_posts/YYYY-MM-DD-영문-슬러그.md` 파일 하나를 만든다. 파일명의 날짜가 발행일이 되고,
슬러그가 주소가 된다 (`/2026/09/30/slug/`). **한글 파일명은 쓰지 않는다** — 주소가 깨진다.

```markdown
---
title: "제목 — 부제도 여기"
date: 2026-09-30 21:00:00 +0900
project: Pace
tags: [백엔드, 디버깅]
summary: 목록에 보일 한 줄. 결론을 미리 말해도 된다.
---

본문. 마크다운이다.

## 소제목

`## 소제목` 이 오른쪽 「이 페이지 안에서」에 자동으로 들어간다. 3~5개가 적당하다.
```

| 항목 | 설명 |
|---|---|
| `title` | 콜론이 들어가면 따옴표로 감싼다 |
| `date` | `+0900` 까지 적는다. 미래 날짜면 빌드에 안 들어간다 |
| `project` | `Pace` 또는 `Arda`. `_config.yml` 의 `projects` 에 있는 이름이어야 그 로그에 묶인다 |
| `tags` | 갈래. 프로젝트 이름은 넣지 않는다 (`project` 가 따로 있다) |
| `summary` | 없어도 되지만 목록이 허전해진다 |

## 무엇을 쓰나

증상 → 원인 → 고른 방법과 그 이유 → 확인. 잘 된 자랑이 아니라 **무엇이 잘못됐고 무엇을
골랐는지**를 근거와 함께 적는다. 측정한 것이 있으면 숫자를 남긴다. 커밋 해시를 인용하면
나중에 되짚기 좋다.

안 된 것, 못 한 것도 적는다. 기존 글들이 그렇게 쓰여 있다.

## 올리기

```bash
cd ~/projects/dev.minahdev.cloud
git add -A && git commit -m "글: 제목" && git push
```

## 미리보기

```bash
bundle exec jekyll serve --port 4001
```

`http://localhost:4001` — 파일을 고치면 자동으로 다시 빌드된다(`_config.yml` 은 예외, 재시작 필요).

## 프로젝트 추가

1. `_config.yml` 의 `projects:` 에 항목 하나
2. 루트에 `<이름>.md` — `layout: project` · `project_name` · `permalink` 세 줄
3. 글에 `project: <이름>`

현관 카드 · 좌측 색인 묶음 · 프로젝트 로그 페이지가 전부 따라온다.

## 구조

```
_layouts/default.html   셸 (상단 바 · 좌측 색인 · 우측 절 목록)
_layouts/project.html   프로젝트 로그 페이지
_layouts/post.html      글
assets/site.css         전부. 색은 :root 토큰
assets/shell.js         색인 필터 · 모바일 서랍 · 절 목록 생성
_config.yml             사이트 이름 · 프로젝트 · 상단 링크
CNAME                   dev.minahdev.cloud — 지우지 말 것
```
