# 한입 건강 — 질병 프로젝트

이 저장소는 nhunnhun.tistory.com의 질병 카테고리 전용 원고 및 프로젝트 지침을 보관합니다.

- 프로젝트 지침: [PROJECT_INSTRUCTIONS.txt](PROJECT_INSTRUCTIONS.txt)
- 현재 고정 소주제 기준: [SUBTOPIC_STANDARD.md](SUBTOPIC_STANDARD.md)
- 기존 글 승인 전달 경로: [handoffs/approved/](handoffs/approved/README.md)
- 공통 발행 러너: [nhunnhun_blog](https://github.com/ansqhd5774-Choi/nhunnhun_blog)

`SUBTOPIC_STANDARD.md`의 6개 소주제를 질병 원고의 기본 구조로 사용합니다. 의료 안전·근거·이미지·강조·저장·발행·공개 검증 규칙은 `PROJECT_INSTRUCTIONS.txt`와 공통 발행 계약을 계속 적용합니다.

프로젝트 지침·증거 보존 원고를 이 저장소에 저장하는 것만으로 Tistory Actions가 시작되지는 않습니다. 완성·보존·검토가 끝난 기존 글 수정 원고를 `handoffs/approved/<sourceId>.json`에 별도로 배치한 경우에만 공통 저장소의 `sync-disease-updates.yml` 정기 확인 대상으로 삼습니다. 새 글은 자동 전달 범위가 아니며, 기존 글도 공통 발행 러너의 수신·실행·`updated + PUBLIC_VERIFIED` 확인까지 별도 추적합니다.
