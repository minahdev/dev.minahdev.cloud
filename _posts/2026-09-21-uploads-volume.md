---
title: "재생성하면 업로드 사진이 사라졌다 — named volume, 그리고 어긋난 서빙 경로"
date: 2026-09-21 21:00:00 +0900
project: Pace
tags: [Docker, 인프라, 디버깅]
summary: 커뮤니티 업로드가 컨테이너 쓰기 가능 레이어에만 있어서 재생성마다 날아갔다. named volume 으로 빼서 고쳤는데, 고치고 나서 저장 경로와 서빙 경로가 애초에 한 칸 어긋나 있는 걸 발견했다.
---

커뮤니티 게시물에 사진을 올리는 기능이 있다. 백엔드 컨테이너를 재빌드하고 나면 올렸던 사진이 없어졌다. 고친 커밋은 `9d1b787`, 바뀐 줄은 세 줄이다.

## 증상 — 재빌드하면 없다

올릴 때는 성공한다. `docker compose up --build` 로 백엔드를 다시 올리고 나면 그 사진들이 없다. DB 의 게시물 행은 남아 있다. 사라진 것은 파일뿐이다.

DB 는 남고 파일만 사라진다는 게 범위를 좁혀준다. Postgres·Redis·Neo4j 는 전부 볼륨을 달고 있고 업로드 파일만 아무것도 달려 있지 않았다.

## 원인 — 쓰기 가능 레이어는 컨테이너와 수명을 같이 한다

이미지 레이어는 읽기 전용이다. 컨테이너를 만들면 그 위에 얇은 **쓰기 가능 레이어**가 하나 올라가고, 컨테이너 안에서 만든 파일은 전부 거기에 쌓인다. 이 레이어는 이미지가 아니라 **컨테이너에 딸린 것**이라 컨테이너가 없어지면 같이 없어진다.

여기서 갈리는 게 재시작과 재생성이다.

- `docker restart` — 같은 컨테이너를 다시 켠다. 쓰기 가능 레이어는 그대로다. 파일이 남는다.
- `docker compose up --build` — 이미지가 바뀌었으니 컨테이너를 **새로 만든다**. 새 컨테이너는 새 쓰기 가능 레이어를 받는다. 이전 파일은 이전 컨테이너와 함께 사라진다.

그래서 증상이 "가끔" 나는 것처럼 보였다. 재시작만 했을 때는 멀쩡했으니까.

저장 코드는 `minahai/apps/inbody/community_media.py` 다. 업로드마다 디렉터리를 보장하고 UUID 이름으로 쓴다.

```python
APPS_DIR = Path(__file__).resolve().parents[1]
COMMUNITY_UPLOAD_DIR = APPS_DIR / "uploads" / "community"
```

컨테이너 안에서 이 값은 `/app/apps/uploads/community` 다. Dockerfile 이 `WORKDIR /app` 에 `minahai/` 를 통째로 복사하니 `community_media.py` 는 `/app/apps/inbody/` 에 있고, `parents[1]` 이 `/app/apps` 가 된다.

그리고 이 디렉터리는 저장소에 없다. 이미지 안에도 없다. 런타임에 처음 생기는 디렉터리이고, 생긴 자리가 쓰기 가능 레이어다.

## bind mount 가 아니라 named volume

같은 `backend` 서비스에는 이미 마운트가 두 개 있었다. 둘 다 bind mount 다.

```yaml
# 로컬 학습 산출물(best.pt)을 컨테이너에서 그대로 읽도록 마운트
- ./minahai/apps/star_craft/resources/yolo_train/runs:/app/apps/star_craft/resources/yolo_train/runs
# 크롤/스크랩 결과(crawled.jsonl·scraped.jsonl)를 호스트에서 바로 확인하도록 마운트
- ./minahai/resources:/app/resources
```

주석에 고른 이유가 적혀 있다. **호스트에서 직접 열어봐야 하는 것**이라서 bind mount 다. 학습 산출물은 호스트에서 만들어 컨테이너가 읽고, 크롤 결과는 컨테이너가 쓴 걸 호스트에서 확인한다. 경로가 사람에게 보여야 하는 데이터다.

업로드 사진은 성격이 다르다. 호스트 탐색기로 열어볼 이유가 없고, 필요한 건 **없어지지 않는 것**뿐이다. bind mount 로 하면 호스트 경로가 계약에 들어온다. 저장소 워킹트리 안(`./minahai/apps/uploads`)으로 잡으면 사용자가 올린 사진이 git 저장소 디렉터리에 쌓이고, 저장소 밖으로 잡으면 그 절대경로가 머신마다 달라진다. 둘 다 원하는 게 아니다.

그래서 named volume 으로 했다. 추가된 세 줄이 전부다.

```yaml
services:
  backend:
    volumes:
      # 커뮤니티 사진 등 업로드 파일(apps/uploads/*)이 컨테이너 재생성·재빌드에도 남도록 볼륨에 둔다
      - community_uploads:/app/apps/uploads

volumes:
  community_uploads:
```

기존 설정과도 결이 맞는다. 살아남아야 하는 데이터는 이미 전부 named volume 이다 — `pgvector_data`, `redis_data`, `neo4j_data`, `pgadmin_data`, `n8n_data`. 사람이 들여다보는 것은 bind mount, 남아야 하는 것은 named volume. 업로드는 후자다.

빈 볼륨으로 시작하는 것도 문제가 안 된다. named volume 은 처음 붙을 때 비어 있지만, `main.py` 의 lifespan 이 기동할 때 `get_community_media_storage().ensure_dir()` 를 한 번 부르고 저장 함수도 매번 `ensure_dir()` 를 부른다. 디렉터리가 있다고 가정하는 코드가 없다. Dockerfile 에 `USER` 지시자가 없어서 root 로 돌기 때문에 새 볼륨 소유권으로 막히는 것도 없다.

한 가지 덜 눈에 띄는 연결고리가 있다. compose 파일 맨 위에 프로젝트명이 박혀 있다.

```yaml
# 디렉터리명이 바뀌어도 기존 project_* 볼륨을 계속 쓰도록 프로젝트명을 고정한다.
name: project
```

named volume 의 실제 이름에는 프로젝트명이 접두어로 붙는다. 이 볼륨은 `project_community_uploads` 가 된다. 프로젝트명을 고정해 둔 덕에 저장소 디렉터리 이름을 바꿔도 같은 볼륨을 계속 쓴다. 고정하지 않았다면 디렉터리명이 compose 프로젝트명이 되고, 디렉터리를 옮기는 순간 새 빈 볼륨이 붙어서 원래 증상이 그대로 재현된다. 볼륨으로 고쳤다고 끝이 아니라, 볼륨 이름이 안정적이어야 고친 게 유지된다.

이름 규칙은 하나 어긋난다. 다른 데이터 볼륨은 모두 `*_data` 인데 이것만 `community_uploads` 다. 동작에는 영향이 없다. `n8n_data` 만 `external: true` 로 선언돼 compose 가 만들지 않는 것도 이 파일에서 유일한 예외다. `community_uploads` 는 external 이 아니라서 처음 `up` 할 때 compose 가 만든다.

## 확인하다가 발견한 것 — 쓰는 경로와 내보내는 경로가 다르다

볼륨이 맞게 걸렸는지 보려고 파일을 내보내는 쪽을 열었다가 어긋난 걸 찾았다. `minahai/main.py` 에 정적 마운트가 있다.

```python
_UPLOADS_ROOT = Path(__file__).resolve().parent / "uploads"
_UPLOADS_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_UPLOADS_ROOT)), name="uploads")
```

`main.py` 는 컨테이너에서 `/app/main.py` 다. `parent` 는 `/app` 이므로 `_UPLOADS_ROOT` 는 `/app/uploads` 가 된다. 쓰는 쪽은 `/app/apps/uploads/community` 다. **`apps` 한 칸이 다르다.**

정리하면 이렇다.

| | 경로 |
|---|---|
| 저장 (`community_media.py`) | `/app/apps/uploads/community` |
| 볼륨 마운트 (`9d1b787`) | `/app/apps/uploads` |
| 정적 서빙 (`main.py`) | `/app/uploads` |

볼륨은 **쓰는 경로와 정확히 맞다**. 그래서 커밋이 하려던 일 — 바이트를 남기는 것 — 은 된다. 문제는 그 바이트를 꺼내는 URL 이다. 저장 함수는 `/uploads/community/<uuid>.jpg` 를 돌려주고, 프론트는 그걸 백엔드의 `GET /uploads/community/<uuid>.jpg` 로 프록시한다. 그 요청은 `StaticFiles` 를 타고 `/app/uploads/community/` 를 본다. 거기엔 아무것도 쓰이지 않는다.

백엔드 전체에 정적 마운트는 이 하나뿐이라(`app.mount`·`StaticFiles` 로 훑었다) 다른 마운트가 덮어주고 있는 것도 아니다. 그리고 `/app/uploads` 는 볼륨 밖이라 여전히 쓰기 가능 레이어 위에 있다. 이 커밋이 없애려던 그 자리다.

두 경로는 `ef42d7f`(2026-07-08) 에 같이 들어왔고 그 뒤로 둘 다 바뀌지 않았다. 볼륨을 붙인 `9d1b787` 이 지금 compose 파일에 남은 마지막 변경이다. 즉 커밋 메시지는 사실이지만 절반이다 — 파일이 사라지는 건 고쳤고, 사라지지 않은 파일을 내보내는 경로는 그대로다.

컨테이너를 띄워 확인한 게 아니라 코드를 읽어 얻은 결론이다. 결판내는 명령은 이 세 줄이다.

```bash
docker compose exec backend ls /app/apps/uploads/community
docker compose exec backend ls /app/uploads
docker volume inspect project_community_uploads
```

첫 줄에 파일이 있고 둘째 줄이 비어 있으면 위 표대로다.

## 지금은 여기까지

업로드를 컨테이너 볼륨에 두는 건 임시 해법이다. 볼륨은 그 도커 호스트에 묶여 있어서 백엔드를 여러 대로 늘리면 각자 다른 사진을 갖게 되고, 호스트를 옮기면 볼륨을 따로 옮겨야 하고, 백업은 DB 와 별도로 챙겨야 한다. 용량도 한 방향으로만 자란다. 파일 하나 크기는 서버에서 막는다 — `save()` 가 사진 10MB · 동영상 50MB 를 넘으면 400 을 낸다. 개수는 아니다. `community_media.py` 에 `MAX_FILES_PER_POST = 4` 가 선언돼 있지만 백엔드 어디에서도 쓰이지 않고(그 이름으로 훑어도 선언된 줄 하나뿐이다), 실제로 4개를 막는 건 프론트의 `MAX_COMMUNITY_MEDIA` 로 버튼을 비활성화하는 것뿐이다. 즉 한 글당 용량 상한은 UI 에만 있다. 그리고 지우는 경로는 어느 쪽에도 없다.

객체 저장소로 가는 길이 이 저장소에 아주 없지는 않다. `minahai/apps/admin/` 의 이미지 업로드는 이미 `S3ImageStoragePort` 와 boto3 구현(`S3ImageStorageAdapter`, 동기 라이브러리라 `asyncio.to_thread` 로 넘긴다)을 갖고 있다. 커뮤니티 쪽도 헥사고날이라 `CommunityMediaPort` 뒤에 `CommunityMediaLocalAdapter` 하나가 꽂혀 있을 뿐이다. 바꿀 자리는 그 어댑터 하나다.

다만 커뮤니티 미디어를 S3 로 옮긴다는 커밋도 문서도 저장소에 없다. 계획이 있다고 쓸 근거가 없으니 여기서 끊는다. 지금 상태는 "재생성에는 안 죽는다"까지다.

## 남는 교훈

컨테이너 안에 파일을 쓰는 코드는 전부 기본값이 휘발이다. 볼륨을 붙이지 않았다면 남는다고 가정한 쪽이 틀린 것이고, 재시작으로는 증상이 안 나기 때문에 한참 멀쩡해 보인다. 무엇이 사라지고 무엇이 남는지(DB 는 남고 파일만 사라졌다)를 먼저 갈라보면 원인이 금방 좁혀진다.

그리고 파일 저장은 **쓰는 경로와 내보내는 경로 두 개**다. 둘이 각자 자기 기준으로 경로를 계산하면 어긋나고, 어긋나도 업로드는 성공하기 때문에 조용하다. 볼륨을 붙일 때는 마운트 지점이 쓰는 쪽과 맞는지만 보지 말고 내보내는 쪽과도 같은 경로인지 같이 확인해야 한다. 한쪽만 맞으면 바이트는 남고 화면은 비어 있다.
