# 질병 저장소 독립화 — 전환 완료 기록

기준일: 2026-10-25. 대상: ansqhd5774-Choi/nhunnhun_disease. 이 문서는 구현·운영 준비 검증과 실제 글 발행을 구분한다.

## 반영한 구조
- 프로젝트 지침·원고·기술 코드·GitHub workflow·원장을 이 저장소 안에서 처리한다. 다른 카테고리 저장소의 기준을 읽거나 원고를 전달하지 않는다.
- 편집 기준은 PROJECT_INSTRUCTIONS.txt와 SUBTOPIC_STANDARD.md다. 프로젝트 설정에 붙여넣는 PROJECT_PROMPT.txt는 2551자로 8,000자 이하다. 기존 분야별 소제목·내용 기준은 유지했다.
- 저장소·category·direct/SP1·sourceId를 제출 전에 검사한다. 신규 수동 실행의 콘텐츠 검사도 선택한 원고 한 건만 대상으로 한다.
- 신규 posts/ → publish-posts.yml. 기존 수정 updates/ → direct-author-update.yml → update-posts.yml. 결과도 동일 sourceId와 이 저장소 원장만 추적한다.
- 기존 디자인·강조·이미지·PC/모바일 공개 검증 코드는 로컬로 복제했다. 원본 runtime f1c381b5d4314dc46552abdfda39fd3e3955ef84와 해당 카테고리 기술 fixture의 최종 렌더 hash가 같다.

## 실제 운영 연결
- 신형 Windows 호스트에 전용 러너를 연결했고 GitHub에서 online을 확인했다. 세 추가 러너는 관리자 서비스·주기적 watchdog 없이 사용자 로그인 시 숨김 실행한다. 구형 PC 설정은 변경하지 않았다.
- 네 저장소의 TISTORY_WRITER_HOST를 동일한 실제 호스트로 고정했다. TISTORY_PUBLISH_ENABLED=true를 설정했다.
- writer-session.mjs가 같은 물리 호스트의 ProgramData 원자 잠금을 사용한다. 다른 호스트는 거절하며 중단된 잠금을 자동 탈취·삭제하지 않는다.
- 병렬 실행 중 기본 ~/setup-pnpm 디렉터리의 EBUSY를 실제 확인했다. 설치 경로를 runner.temp/run/job/attempt 단위로 분리한 뒤 네 저장소 실행을 다시 성공시켰다.
- 일회성 러너 등록 비밀값은 삭제했다. 다른 저장소로 전달하는 실행 경로는 사용하지 않는다.

## 실제 준비 검증 — PASS
- Run: [40181013747](https://github.com/ansqhd5774-Choi/nhunnhun_disease/actions/runs/40181013747)
- 실행 source commit: c5d0e1a7882cbb6810a8a056481d733f187c6818
- 올바른 저장소·분야·호스트, Chrome 구성/로컬 CDP 연결, 실제 호스트 잠금 획득·반환을 확인했다.
- 편집기 열기·글 제출·재발행은 실행하지 않았다. 이 결과는 로그인 재인증이나 신규 글 공개 end-to-end 성공을 대신하지 않는다.
- 이후 변경한 선택 원고 검사·러너 라벨 진단·운영 문서는 위 준비 검사에서 확인한 잠금/Chrome 코드를 바꾸지 않았다.

## 자동 검사
- 로컬 전체 선택 검사 78: PASS 78, FAIL 0.
- 이 저장소의 기술 회귀·독립화·선택 원고 검사 전체 PASS.
- 격리·동시 잠금·작업별 패키지 경로·선택 원고 범위·렌더 snapshot 검사 PASS.

## 사용자 프로젝트 설정에서 남은 항목
- ChatGPT의 각 프로젝트 설정에 이 저장소 PROJECT_PROMPT.txt를 붙여넣는다. GitHub 문서를 고친 것이 이미 등록된 ChatGPT 프로젝트 지침을 자동 교체하지는 않는다.
- GitHub 연결 앱의 프로젝트별 접근 권한은 이번 코드 변경으로 자동 분리되지 않는다. 작성·실행 경로의 독립화와 계정 접근 권한을 구분한다.
- 같은 Windows 사용자·호스트를 유지한다. 러너를 다른 PC 또는 다른 사용자로 옮길 때는 현재 잠금 모델을 그대로 다중 호스트에 사용하지 않는다.

## 이력 보호와 복구
- 기존 원고·원장·숫자 URL·articleId는 변경하지 않았다. 예전 ready/submitting 원고를 새 저장소에 한꺼번에 재접수하지 않는다.
- submitting은 원래 제출 상태를 먼저 확정하고 재제출하지 않는다. 새 수정은 새 revision ID와 같은 기존 URL을 사용한다.
- 과거 drafts/·handoffs/는 보존 자료이며 현재 자동 제출 경로가 아니다.

## 동시 요청 대기 시간
- 네 저장소의 동시 요청은 같은 호스트 잠금에서 최대 30분 대기한다. 60초 만에 busy로 실패하던 기본값을 조정했다.
- 신규/수정 작업 제한은 55분으로 맞춰, 대기 후 기존 제출·검증 시간 예산을 유지한다. 잠금을 강제로 빼앗거나 최종 제출을 재시도하지 않는다.
- 잠금 획득 순서의 엄격한 FIFO나 영속 대기열을 보장하는 구조는 아니다.
