---
title: "로그아웃해도 다시 로그인되던 문제 — 폐기 요청이 취소되고 있었다"
date: 2026-08-10 21:00:00 +0900
project: Pace
tags: [프론트, 디버깅, 보안]
summary: 로그아웃 버튼이 서버 폐기 요청을 띄우기만 하고 기다리지 않은 채 화면을 옮겼다. 이동이 요청을 끊어 세션 쿠키가 살아남고, 다음 화면이 그 쿠키로 로그인 상태를 되살렸다. 로컬은 왕복이 1ms 라 재현되지 않았다.
---

로그아웃을 눌러도 잠시 뒤 다시 로그인 상태로 돌아왔다. **배포된 도메인에서만** 재현된다. 로컬 개발 서버에서는 몇 번을 눌러도 멀쩡했다. 이 글은 그 차이가 왜 생겼는지와 무엇을 고쳤는지의 기록이다. 근거 커밋은 `e77156e` 하나다.

## 증상 — 배포한 곳에서만 로그아웃이 풀린다

로그아웃을 부르는 화면은 두 군데다. 마이페이지(`minahview/components/mypage/my-profile.tsx`)와 프로필 시트(`minahview/components/nav/profile-sheet.tsx`). 둘 다 같은 함수를 갖고 있었고, 그때 모습은 이랬다.

```tsx
function logout() {
  clearLoggedInUserId()
  window.dispatchEvent(new Event(AUTH_SESSION_EVENT))
  window.location.href = "/"
}
```

세 줄 다 동기 호출처럼 보인다. 문제는 첫 줄이 동기 호출이 아니었다는 것이다.

## 원인 — 이동이 폐기 요청을 끊는다

`minahview/lib/auth-session.ts` 의 `clearLoggedInUserId` 는 이랬다.

```ts
export function clearLoggedInUserId(): void {
  localStorage.removeItem(PACE_USER_ID_KEY)
  localStorage.removeItem(PACE_USER_ROLE_KEY)
  notifyAuthChange()
  // 서버 세션(httpOnly 쿠키)도 함께 폐기.
  if (typeof window !== "undefined") {
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => {})
  }
}
```

`localStorage` 두 키는 그 자리에서 지워진다. 하지만 서버 세션 폐기는 `void fetch` 다 — 요청을 띄우는 데서 끝나고 결과를 보지 않는다. 그리고 호출부의 다음 줄이 `window.location.href = "/"` 다.

브라우저는 문서를 옮기는 순간 진행 중이던 요청을 끊는다. 서버는 `POST /api/auth/logout` 을 받지 못하고, httpOnly 세션 쿠키는 그대로 남는다. 수명은 짧지 않다 — `minahview/lib/session.ts` 에 `SESSION_TTL_SECONDS = 60 * 60 * 24 * 7`, 7일이다.

여기서 되살아난다. 새 문서가 뜨면 루트 레이아웃(`minahview/app/layout.tsx`)에 붙어 있는 `SessionHydrator` 가 `/api/auth/me` 를 부른다. 쿠키가 유효하니 200 이고, 응답의 `userId`·`role` 이 `localStorage` 캐시에 다시 쓰인다. 방금 지운 두 키가 돌아온다. 이 구조는 의도한 것이다 — 로그인의 진실원은 httpOnly 쿠키이고 `localStorage` 는 동기 UI 를 위한 캐시일 뿐이다. 쿠키가 살아 있으면 캐시를 지운 쪽이 이길 방법이 없다.

되살리는 경로는 하나 더 있다. `minahview/components/require-auth.tsx` 도 캐시가 비어 있으면 `hydrateSessionFromServer()` 를 부른 뒤 재판정한다. 즉 쿠키가 살아남은 이상 어느 화면으로 가든 복구된다.

**로컬에서 재현되지 않은 이유가 이 문제의 핵심이다.** 왕복이 1ms 라 이동이 시작되기 전에 요청이 이미 나가서 대부분 성공한다. 그래서 개발 중에는 멀쩡해 보였다. 배포 도메인에서는 그 여유가 없다. 버그가 없었던 게 아니라 경합에서 이길 확률이 달랐을 뿐이다.

## 고친 것 둘

**첫째, 기다린다.** `clearLoggedInUserId` 가 프라미스를 돌려주고, 호출부 두 곳이 이동 전에 `await` 한다.

```ts
export function clearLoggedInUserId(): Promise<void> {
  localStorage.removeItem(PACE_USER_ID_KEY)
  localStorage.removeItem(PACE_USER_ROLE_KEY)
  notifyAuthChange()
  if (typeof window === "undefined") return Promise.resolve()
  return fetch("/api/auth/logout", { method: "POST", keepalive: true }).then(
    () => undefined,
    () => undefined,
  )
}
```

실패도 `undefined` 로 접는다. 폐기 요청이 에러를 냈다고 화면에 남아 있을 이유는 없다. `keepalive: true` 는 문서가 바뀌어도 요청이 살아남게 하는 표식이다. 기다리는 것이 본 수단이고 `keepalive` 는 그래도 이동이 끼어들 때를 위한 보험이다 — 둘 중 하나만 하지 않았다.

읽다가 눈에 걸린 것이 하나 있다. 호출부는 `await` 뒤에 `AUTH_SESSION_EVENT` 를 한 번 더 던지는데, `clearLoggedInUserId` 안의 `notifyAuthChange()` 가 `fetch` 전에 이미 같은 이벤트를 던진다. 리스너가 재판정만 하므로 동작이 깨지지는 않지만 한쪽은 필요 없다. 지금 코드에도 그대로 남아 있다.

**둘째, 지울 때도 구울 때와 같은 옵션을 쓴다.** 로그아웃 라우트가 이랬다.

```ts
// 전
res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 })
// 후
res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 })
```

쿠키를 **구울 때는** `sessionCookieOptions()` 를 쓰면서 **지울 때는** `path` 와 `maxAge` 두 개만 손으로 적고 있었다. 빠진 것은 이 세 개다.

```ts
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  }
}
```

브라우저는 속성이 맞아야 같은 쿠키로 보고 지우므로, 같은 옵션에 `maxAge` 만 0 으로 바꿔 덮어쓰게 했다. 문제의 모양이 여기서 드러난다 — 쿠키를 굽는 곳은 셋(로그인·OAuth·역할 전환)인데 전부 이 헬퍼를 쓰고, 옵션을 손으로 적는 곳은 지우는 한 군데뿐이었다.

## 확인한 것과 확인하지 못한 것

확인한 것. 쿠키통에 세션 쿠키를 넣고 `POST /api/auth/logout` 을 불러, 응답이 `Set-Cookie: <세션쿠키>=; Path=/; Max-Age=0; HttpOnly; SameSite=lax` 로 실제 삭제 지시를 내보내는 것을 봤다.

확인하지 못한 것이 둘이다. 하나는 경합 자체다. 로컬에서는 원래 재현되지 않으니 로컬이 초록이라고 고쳐졌다는 근거가 되지 않는다. **배포 도메인에서의 확인이 남아 있다.** 커밋 본문에도 그렇게 적어 뒀다.

다른 하나는 위 검증 출력에서 바로 보인다 — `Secure` 가 없다. `secure` 는 `NODE_ENV === "production"` 일 때만 붙기 때문이다. 문제는 배포에서만 났는데 검증은 배포에서만 붙는 속성이 빠진 상태로 했다는 뜻이다. 이 한 칸은 여전히 비어 있다.

덧붙여, 이 커밋 뒤에 같은 파일들을 네 번 더 건드렸지만(`9f18eb8`·`692a8be`·`2d57089`·`b2cd127`) 로그아웃 경로의 코드는 커밋 당시와 같다. 호출부도 여전히 두 곳이다.

## 남는 교훈

fire-and-forget 은 화면이 그대로 남아 있을 때만 fire-and-forget 이다. 문서를 옮기는 코드가 뒤에 붙는 순간 그 요청은 "보냈다"가 아니라 "보내려고 했다"가 되고, 로컬의 1ms 왕복은 그 차이를 가려 준다. 그리고 상태를 만드는 코드와 없애는 코드가 같은 옵션 출처를 공유하지 않으면, 굽는 쪽만 헬퍼를 쓰는 동안 지우는 쪽이 조용히 어긋난다 — 삭제는 생성의 대칭이어야 하고, 대칭은 같은 함수에서 나올 때만 유지된다.
