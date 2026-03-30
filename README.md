# Flight Tracker Frontend

실시간 항공기 위치 추적 웹 애플리케이션의 프론트엔드입니다. 인터랙티브 지도 위에서 항공기의 현재 위치, 비행 경로, 텔레메트리 정보를 시각화합니다.

## 주요 기능

- **실시간 항공기 추적** — 60초 간격으로 지도 범위 내 항공기 위치를 자동 갱신
- **비행 경로 시각화** — 선택한 항공기의 전체 비행 경로 및 웨이포인트 표시
- **항공기 상세 정보** — 고도, 속도, 방위각, 수직 속도, 출발/도착 공항 등
- **인터랙티브 지도** — Leaflet 기반 다크 테마 지도, 클릭으로 항공기 선택
- **가장 가까운 공항 조회** — 출발지 및 현재 위치 기준 최근접 공항 표시

## 기술 스택

| 분류 | 기술 |
|------|------|
| 프레임워크 | Next.js 14 (App Router) |
| 언어 | TypeScript 5 |
| 지도 | Leaflet + React Leaflet |
| 스타일링 | Tailwind CSS |
| 패키지 매니저 | Bun |

## 시작하기

### 요구사항

- Node.js 18 이상 또는 Bun
- 백엔드 API 서버 실행 중

### 설치 및 실행

```bash
# 의존성 설치
bun install
# 또는
npm install

# 환경변수 설정
cp .env.local.example .env.local
# NEXT_PUBLIC_API_URL 값을 백엔드 API 주소로 수정

# 개발 서버 실행
bun dev
# 또는
npm run dev
```

브라우저에서 `http://localhost:3000` 으로 접속합니다.

### 환경변수

`.env.local` 파일에 아래 변수를 설정합니다.

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

## 사용 가능한 스크립트

```bash
bun dev      # 개발 서버 실행
bun build    # 프로덕션 빌드
bun start    # 프로덕션 서버 실행
bun lint     # ESLint 검사
```

## 프로젝트 구조

```
flight-track-fe/
├── app/
│   ├── layout.tsx          # 루트 레이아웃
│   ├── page.tsx            # 메인 페이지 (항공기 목록 + 패널)
│   └── globals.css         # 전역 스타일 및 커스텀 애니메이션
├── components/
│   └── TrackingGlobe.tsx   # Leaflet 지도 컴포넌트
├── lib/
│   ├── types.ts            # API 계약 타입 정의
│   └── api.ts              # API 클라이언트 함수
└── .env.local              # 환경변수 (API URL)
```

## 백엔드 API 명세

프론트엔드가 사용하는 API 엔드포인트입니다.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/tracking/aircraft` | 지도 범위 내 항공기 목록 조회 (`lamin`, `lomin`, `lamax`, `lomax` 쿼리 파라미터) |
| GET | `/api/tracking/track` | 특정 항공기 비행 경로 조회 (`icao24` 쿼리 파라미터) |
| GET | `/api/airports/nearest` | 좌표 기준 최근접 공항 조회 (`lat`, `lng` 쿼리 파라미터) |
