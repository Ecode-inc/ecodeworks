# ecode-internal

통합 사내 솔루션 (일정관리 + 문서화 + 칸반 + 비밀번호 금고 + QA 연동)

## 작업 규칙

### 팀 에이전트 기반 작업 프로세스

모든 작업은 반드시 **팀 에이전트 기능**으로 각각의 파트를 나눠서 병렬로 작업한다.
각 에이전트가 작업을 완료한 후, **리뷰어 에이전트가 웹 검색을 통해 검증**한 뒤 최종 반영한다.

- **구현 에이전트**: 실제 코드 작성 담당 (백엔드/프론트엔드/인프라 등 파트별로 분리)
- **리뷰어 에이전트**: 구현 결과를 웹 검색으로 최신 문서/패턴과 대조하여 검증 후 승인
- 리뷰어가 확인하지 않은 코드는 머지하지 않는다

### 기술 스택

- **Backend**: Cloudflare Workers + Hono + D1 (SQLite) + R2
- **Realtime**: Durable Objects + WebSocket
- **Frontend**: React 18 + Vite + Tailwind CSS + Zustand
- **Desktop**: Tauri v2
- **Mobile/Web**: PWA

### 개발 명령어

```bash
pnpm dev          # API + Web 동시 실행
pnpm dev:api      # API만 (wrangler dev, :8787)
pnpm dev:web      # Web만 (vite, :3000)
pnpm build        # 빌드
pnpm db:migrate:local  # 로컬 DB 마이그레이션
```

### 프로젝트 구조

- `packages/api/` - Cloudflare Workers API (Hono)
- `packages/web/` - React 프론트엔드
- `packages/desktop/` - Tauri v2 래퍼 (예정)

### 보안 주의사항

- JWT Secret, VAULT_KEY 등은 반드시 `wrangler secret`으로 관리
- 비밀번호 금고는 AES-256-GCM으로 암호화, VAULT_KEY는 64자 hex string
- 모든 금고 접근은 감사 로그에 기록됨
