# 기준 지표와 이관 범위

2026-11-12, 정적 분석 범위: 원본 커밋의 `back/`.

채팅 HTTP/STOMP k6 스크립트 2개를 보존했습니다. 합성 계정과 DB 초기화 절차가 아직 없어 이번 실행에서 부하·지연·커버리지를 측정하지 않았습니다. 과거 JSON 보고서는 재검증 없이 성과로 이관하지 않았습니다.

```sh
python3 scripts/prepare.py
python3 scripts/metrics.py checkout/back --output results/static-reproduced.json
```

fan-in/out은 내부 정적 import로 연결된 서로 다른 파일 수입니다. 런타임 호출과 지연을 나타내지 않습니다. 지표와 해결 여부는 분리해 기록합니다.
