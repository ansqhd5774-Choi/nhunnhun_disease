# 질병 승인 원고 → 공통 발행 러너 전달

이 경로의 `direct-*.json`만 공통 러너의 정기 동기화 대상으로 간주합니다.

- `evidence/authoring-handoffs/<sourceId>.json`에 **동일한 완성 JSON 전체**를 먼저 보존합니다(Gate 0).
- 신뢰 가능한 자료와 의료 안전 사항을 확인하고 `category=질병`, `contentStandard=SP1`, `status=ready`, `approved=true`인 **기존 숫자 URL 수정 원고**만 이 경로에 넣습니다.
- 두 파일의 원문 SHA256이 다르거나 기존 공통 러너 원고/원장이 이미 있으면 자동 전달을 중지하거나 건너뜁니다.
- 공통 발행 러너 저장소 `nhunnhun_blog`의 `sync-disease-updates.yml`이 약 10분 간격으로 이 승인 경로를 확인하고, 원고 저장·커밋 고정 재조회 후 기존 `direct-author-update.yml`로 **source_id를 지정해 전달**합니다. 일정 실행은 지연될 수 있습니다.
- **새 글 발행**은 관리자 기존 글 전체 목록에 대한 사전 대상 판정이 필요하므로 이 경로에서 자동 생성하지 않습니다.
- GitHub 원고 저장 또는 workflow 전달 성공은 티스토리 공개 완료를 뜻하지 않습니다. 해당 source의 `updated + PUBLIC_VERIFIED`를 별도로 확인합니다.
- 제출 중·실패 상태의 source를 덮어쓰거나 자동 재제출하지 않습니다.

기존 `evidence/authoring-handoffs/` 보존본은 승인 경로가 아니며, **보존만으로 발행이 시작되지 않습니다.**
