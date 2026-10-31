# Teomoony-f — 터무니 화면 · 서버

**단지코드 하나로 건축물대장 · 토지 · 건물 · 실거래가를 한 화면에서 본다.**

🔗 **서비스 바로가기: [https://teomoony.com](https://teomoony.com)** · [지역별 단지](https://teomoony.com/r) · [소개](https://teomoony.com/about)

터무니(Teomoony)는 흩어져 있는 공공데이터를 단지 단위로 이어 보여 주는 조회 서비스입니다.
이 저장소는 그중 **화면과 API 서버**입니다. 데이터를 받아 DB 에 넣는 쪽은
[Teomoony-b](https://github.com/kkm4512/Teomoony-b) 에 있습니다.

```
브라우저 ──> Express (:5173) ──> SQL Server (Teomoony DB)
                  │
                  └─ public/  바닐라 JS + Leaflet (빌드 단계 없음)
```

## 무엇을 보여 주나

- **검색** — 단지명 · 주소 · 단지코드 · 법정동
- **지도** — 단지 마커, 필지 · 건물 외곽선 폴리곤, 법정동 경계, 항공사진 전환
- **단지 상세** — 제원(총괄표제부 우선), 실거래(평형별), 관리비, 건축인허가, 동 목록, 필지, 공시지가
- **대장 없는 신축** — 건축물대장이 아직 없는 단지를 K-apt 축으로 따로 표시 (단지코드는 발급하지 않음)
- **빈칸의 사유** — 값이 없으면 줄을 지우지 않고 `아직 적재 전` · `해당 없음` · `확인 불가` ·
  `원본에 값 없음` 중 무엇인지 적습니다. 넷 다 아니면 `⚠ 분류되지 않음` — 버그 신호입니다

## 데이터 출처

화면의 모든 숫자는 아래 공공데이터에서 왔고, 적재 과정은 Teomoony-b 의 코드로 확인할 수 있습니다.

| 출처 | 쓰는 것 |
|---|---|
| 공공데이터포털 (국토교통부) | 건축물대장, 아파트 · 연립 · 오피스텔 등 실거래가, 건축인허가 |
| 공동주택관리정보시스템 K-apt (공공데이터포털) | 공동주택 단지정보, 관리비 |
| 브이월드 VWorld (국토교통부) | 연속지적도 · 공시지가, 건물 외곽선, 법정동 경계, 토지특성, 배경지도 · 항공사진 |
| 청약홈 (한국부동산원) | 분양 공고 · 경쟁률 |
| 그 밖의 공공 API | 학교 · 유치원 · 어린이집 · 학원, 병원 · 약국, 버스정류장, 상가정보, 서울시 정비사업 |

각 데이터의 이용 조건은 해당 제공기관의 약관을 따릅니다.

## 원칙

- **원본을 훼손하지 않습니다.** 받은 값을 고치거나 채워 넣지 않습니다. 코드로 이어지지 않는 것은
  추측으로 잇지 않고, 추정 연결은 화면에 추정이라고 밝힙니다. 다른 단지의 값이 사실처럼 붙느니 비워 둡니다.
- **비상업입니다.** 공공데이터를 이어 보여 주는 개인 프로젝트이며 상업적 목적으로 운영하지 않습니다.
- **키는 저장소에 없습니다.** API 키 · 비밀번호는 `.env` 에만 두고, `.env` 는 git 에 올리지 않습니다.

## 실행

준비물: **Node.js 18 이상**, 데이터가 적재된 **SQL Server** (Teomoony-b 의 README 참고)

```powershell
git clone https://github.com/kkm4512/Teomoony-f.git
cd Teomoony-f
npm install
copy .env.example .env      # 값을 채운다 — 아래 표
npm start                   # http://localhost:5173
```

### 설정 (`.env`)

설정은 `.env.example` 에 이름만 적혀 있습니다. 복사해서 값을 채우세요.
Teomoony-b 를 옆 폴더(`..\Teomoony`)에 두었다면 그쪽 `.env` 를 자동으로 함께 읽으므로
DB 설정을 두 번 적지 않아도 됩니다(이 폴더의 `.env` 가 우선).

| 변수 | 필수 | 용도 |
|---|---|---|
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | ✅ | SQL Server 접속 |
| `PORT` | | 서버 포트 (기본 5173) |
| `VWORLD_KEY` · `VWORLD_DOMAIN` | | 배경지도 타일 · 지오코딩. 없거나 도메인이 맞지 않으면 OpenStreetMap 으로 내려갑니다 |
| `VWORLD_NED_KEY` | | VWorld 국가중점데이터 조회 |
| `AUTH_SECRET` · `ROOT_PASSWORD` | | 로그인. `AUTH_SECRET` 이 비면 로그인 기능은 열리지 않습니다 (`node tools/auth_init.js` 가 만들어 줍니다) |
| `ANTHROPIC_API_KEY` · `ANTHROPIC_MODEL` | | AI 검색. 없으면 AI 검색만 꺼집니다 |

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | 적재 현황 |
| GET | `/api/config` | 지도 키 보유 여부 |
| GET | `/api/complexes?q=&recap=&limit=` | 단지 · 법정동 · 신축 검색 |
| GET | `/api/complexes/:id` | 단지 상세 (동 · 필지 · 건물 · 실거래 · 관리비 · 인허가) |
| GET | `/api/complexes/:id/geo` · `/buildings` | 그 단지의 필지 · 건물 외곽선 (GeoJSON) |
| GET | `/api/complexes/markers?bbox=` | 단지 마커 |
| GET | `/api/parcels?bbox=` · `/api/buildings?bbox=` | 지도 영역의 필지 · 건물 (GeoJSON) |
| GET | `/api/lawds?bbox=` · `/api/lawds/:lawd/geo` | 법정동 경계 + 요약 |
| GET | `/api/newbuilds?bbox=` · `/api/newbuilds/:kaptCode` | 대장 없는 신축 |

`bbox` 는 `minLng,minLat,maxLng,maxLat` (EPSG:4326). 줌 15 미만에서는 필지를 그리지 않습니다.

## 알아둘 것

- **실거래 "없음" 에도 종류가 있습니다.** 단독 · 토지 · 상업용 거래는 지번이 가려져(`1**`) 단지에 붙일 수 없고,
  신축은 대장이 아직 없으며, 신고 지번이 단지와 다른 거래도 있습니다. 거래가 없는 것과 붙일 수 없는 것은 다릅니다.
- **좌표계는 EPSG:4326** 입니다. 다른 좌표계로 들어오는 소스는 적재 시점에 변환해 넣습니다.
- 검색은 `LIKE '%…%'` 라 전국 규모에서는 전문검색이 필요합니다.
