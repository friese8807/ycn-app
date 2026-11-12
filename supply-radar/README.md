# 수급 레이더

외국인·기관·개인이 사고 있는지 팔고 있는지 보는 웹앱입니다.
주소: https://friese8807.github.io/ycn-app/supply-radar/

| 파일 | 역할 |
| --- | --- |
| `index.html` | 웹앱 화면 (홈 화면에 추가해서 사용) |
| `icon-180.png`, `icon-512.png`, `manifest.json` | 홈 화면 아이콘 |
| `widget.js` | 아이폰 Scriptable 위젯 |
| `fetch.cjs`, `watchlist.json` | GitHub Actions가 약 5분마다 `supply-radar-data` 브랜치의 `data.json`을 갱신 |
| `Code.gs` | (선택) Apps Script 데이터 서버 — 연결하면 모든 종목, 15초 간격 |

- 기본 동작: 서버 주소 없이 `watchlist.json`의 종목과 코스피·코스닥을 약 5분 간격으로 표시합니다.
- 종목을 바꾸려면 `watchlist.json`을 고칩니다.
- 실시간에 가깝게 보려면 `Code.gs`를 Apps Script 웹 앱(액세스: 모든 사용자)으로 배포하고, 앱 메뉴의 "데이터 서버 주소"에 붙여 넣습니다.
- 시장 전체 수급은 장중 값, 종목별 수급은 거래일 단위 집계입니다. 금액은 수량 × 종가 추정치입니다.
- 데이터 출처: 네이버 증권. 투자 판단의 참고용입니다.
