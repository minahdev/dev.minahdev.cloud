---
title: "로그인 응답 시간으로 계정 존재 여부가 샜다 — 예외를 잡는 대신 입력을 정규화한다"
date: 2026-08-26 21:00:00 +0900
project: Pace
tags: [보안, 백엔드, FastAPI]
summary: 답을 같게 만드는 것으로는 부족했다. 비용도 같아야 한다. 그리고 try/except 로 감싸 실패할 때 더미를 한 번 더 돌리는 방법은 반대 방향으로 샌다.
---

## 내용은 같아졌는데 시간이 갈렸다

앞선 커밋 `cfdf5f1` 에서 로그인 실패 응답의 **내용**을 통일했다. OAuth 로 가입한 계정의 `password_hash` 는 `!oauth-no-password` 같은 자리표시자라 bcrypt 가 이걸 해시로 못 읽고 `ValueError("Invalid salt")` 를 던졌고, `minahai/main.py` 의 로그인 핸들러가 그 문자열을 그대로 401 본문에 실어 보냈다.

```python
except ValueError as e:
    raise HTTPException(status_code=401, detail=str(e)) from e
```

없는 계정은 "아이디 또는 비밀번호가 올바르지 않습니다" 를 받고 OAuth 계정만 `Invalid salt` 를 받으니, 로그인 폼만 두들겨도 어떤 아이디가 OAuth 로 존재하는지 알 수 있었다. 이게 사용자 열거(user enumeration)다. 공격자가 유효한 아이디 목록을 먼저 확보하면 크리덴셜 스터핑·표적 피싱의 대상이 좁혀지고, "이 사람이 이 서비스를 쓴다"는 사실 자체도 새는 정보다.

문제는 내용을 통일한 뒤에도 남아 있었다. 답은 같아졌는데 **그 답이 나오는 시간**이 갈렸다.

## 원인 — 실패 경로는 bcrypt 를 아예 돌지 않았다

당시 `minahai/apps/users/app/use_cases/login_interactor.py` 는 이렇게 생겼다.

```python
if user is None:
    raise ValueError("아이디 또는 비밀번호가 올바르지 않습니다.")
try:
    matched = bcrypt.checkpw(
        schema.password.encode("utf-8"),
        user.password_hash.encode("utf-8"),
    )
except (ValueError, TypeError):
    matched = False
if not matched:
    raise ValueError("아이디 또는 비밀번호가 올바르지 않습니다.")
```

세 경로의 비용이 서로 다르다.

- 계정이 없으면 `user is None` 에서 바로 던진다. bcrypt 를 한 번도 돌지 않는다.
- OAuth 자리표시자면 `checkpw` 가 해시를 파싱하다 즉시 `ValueError` 로 죽는다. 역시 실제 연산은 없다.
- 비밀번호 계정만 bcrypt 전체 연산을 돈다.

bcrypt 는 일부러 느리게 설계된 함수다. 그 느림이 여기서는 신호가 된다. 응답 시간만 재도 "이 아이디가 비밀번호 계정으로 존재하는가" 를 알 수 있었다. 내용을 아무리 똑같이 맞춰도 타이밍 채널은 그대로였다.

## try/except 로 감싸면 반대 방향으로 샌다

먼저 떠오르는 방법은 예외를 잡아서 메꾸는 쪽이다. `checkpw` 를 그대로 두고, 실패했을 때 더미 해시로 한 번 더 돌려 시간을 채우는 식이다.

이건 틀렸다. 그러면 '틀린 비밀번호' 경로만 bcrypt 를 두 번 돌게 된다. 정확히 말하면 이렇게 갈린다.

- 없는 계정 / OAuth 계정: 예외 → 더미 한 번 = bcrypt 1회
- 존재하는 비밀번호 계정: 정상 계산 → 실패하면 또 더미 = bcrypt 2회

원래 누출은 "존재하는 계정이 더 느리다" 였는데, 이 방법은 "존재하는 계정이 **두 배** 느리다" 로 바꾼다. 방향이 반대로 뒤집히는 것도 아니고 더 크게 벌어진다. 예외를 사후에 보상하는 구조는 보상 횟수 자체가 정보가 된다.

## 고른 방법 — 입력을 정규화한다

그래서 예외를 잡는 대신 **입력을 정규화**했다. 유효한 bcrypt 해시가 아니면 미리 더미로 바꿔놓고, 어느 경로든 정확히 한 번, 같은 비용으로 계산한다.

```python
# 실패 경로에서도 같은 비용을 쓰게 만드는 더미 해시.
_DUMMY_HASH = bcrypt.hashpw(b"timing-equalizer", bcrypt.gensalt()).decode("utf-8")
```

```python
user = await self._repository.find_user(LoginQuery(user_id=schema.userId))

# 어느 경로로 가든 bcrypt 를 정확히 한 번, 같은 비용으로 돌린다.
stored = user.password_hash if user is not None else _DUMMY_HASH
if not stored.startswith("$2"):
    stored = _DUMMY_HASH

matched = verify_password(schema.password, stored)
if user is None or not matched:
    raise ValueError("아이디 또는 비밀번호가 올바르지 않습니다.")
```

세 가지가 같이 바뀌었다.

첫째, `user is None` 조기 반환이 없어졌다. 계정이 없어도 더미로 계산을 돌리고, `user is None` 판정은 bcrypt 이후로 미룬다. 조기 반환은 읽기 좋은 코드지만 여기서는 그 자체가 누출이다.

둘째, 판정 기준이 "알려진 자리표시자인가" 가 아니라 "bcrypt 해시처럼 생겼는가"(`$2` 접두어)다. `!oauth-no-password` 상수는 지금 `apps/auth/services.py`·`apps/users/auth/mobile_service.py`·`apps/users/oauth/oauth_router.py` 세 곳에 각각 따로 박혀 있다. 자리표시자 문자열과 비교하는 방식이었다면 네 번째 복사본이 생기는 순간 조용히 깨진다. 접두어 검사는 그 목록을 몰라도 된다.

셋째, `_DUMMY_HASH` 는 모듈 로드 때 한 번만 만든다. 요청마다 `gensalt()` 를 새로 돌리면 그 비용이 또 경로별로 달라질 여지가 생긴다.

한 가지 짚어둘 것은 `minahai/core/matrix/security.py` 의 `verify_password` 안에도 try/except 가 여전히 있다는 점이다.

```python
def verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False
```

이건 남겨두는 최후 방어선이고, 로그인 경로에서 실제로 시간을 맞추는 것은 그 앞의 정규화다. 예외 처리를 지운 게 아니라, **예외에 기대지 않게** 만든 것이다.

## 확인 — 세 분포가 겹친다

각 경로를 15회씩 재서 중앙값을 봤다.

| 경로 | 중앙값 |
|---|---|
| 없는 계정 | 268ms |
| OAuth 계정 | 274ms |
| 비밀번호 계정 | 261ms |

중앙값 편차 4.8%, 세 분포가 서로 겹친다. 완전히 같은 값을 만드는 것이 목표가 아니다. bcrypt 연산이 한 번 들어간 뒤로는 경로 간 차이가 요청마다 생기는 잡음에 묻혀야 하고, 분포가 겹친다는 것이 그 확인이다.

## 곁가지 — 이쪽은 버그 수정이 아니다

같은 커밋에서 `schedule_access_interactor.py` 의 `bcrypt.checkpw` 직접 호출도 `verify_password` 헬퍼로 바꿨다.

이건 **버그 수정이 아니라 중복 제거**다. 이 경로의 `password_hash` 는 같은 파일의 `set_password` 에서 `bcrypt.hashpw` 로만 만들어지므로 항상 유효한 해시다. 자리표시자가 들어올 길이 없어서 실제로 터지지는 않았다. 구분해서 적어두는 이유는, 나중에 이 줄을 보고 "여기도 같은 취약점이 있었다" 고 읽으면 사실이 아니기 때문이다.

덧붙여 이 정리는 반쪽이다. 검증은 헬퍼로 모았지만 `set_password` 는 아직 `bcrypt.hashpw`·`bcrypt.gensalt` 를 직접 부른다. `security.py` 에 `hash_password` 가 있는데도 그렇다. 해싱 쪽 중복은 남아 있다.

그리고 이 수정에는 회귀 테스트가 없다. `apps/auth/tests/test_security.py` 에 `verify_password` 왕복 테스트 하나가 있을 뿐, 자리표시자 입력이나 경로별 비용을 검증하는 테스트는 없다. 측정은 손으로 15회씩 돌린 값이고, 다음에 누가 조기 반환을 다시 넣으면 아무것도 막아주지 않는다.

## 남는 교훈

응답을 같게 만드는 것과 응답 비용을 같게 만드는 것은 다른 일이다. 인증처럼 "존재 여부" 자체가 비밀인 경로에서는 내용·상태코드·헤더만 맞춰봐야 절반이고, 각 분기가 실제로 어떤 연산을 몇 번 하는지까지 세어야 한다.

그리고 타이밍을 맞출 때는 **예외를 사후에 보상하지 말고 입력을 사전에 정규화하는 쪽**을 고르는 편이 안전하다. 보상은 "보상이 필요했는가" 라는 새 정보를 만들고, 그 정보는 대개 원래 막으려던 것과 같은 것을 알려준다. 분기를 지워버릴 수 있으면 분기마다 비용을 맞춰 넣는 것보다 낫다.

마지막으로, 조기 반환처럼 평소에 권장되는 습관이 보안 경로에서는 그대로 누출이 될 수 있다. 읽기 좋은 코드와 시간이 같은 코드가 충돌할 때는 왜 그렇게 썼는지 주석으로 남겨야 한다. 안 남기면 다음 사람이 "이 `if` 를 위로 올리면 깔끔한데" 하고 되돌려놓는다.
