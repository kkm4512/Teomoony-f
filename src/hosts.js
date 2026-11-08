/* 2026-11-08 사장님 "ㄱㄱ" — 웹 서버를 도커(deploy_default 망)로 옮김.
   윈도우에서 직접 돌 때는 지금처럼 127.0.0.1 의 열린 문(11433 · 15432 · 16379)으로,
   컨테이너 안(TM_DOCKER=1)에서는 같은 망의 서비스 이름(mssql · postgis · redis)과 안쪽 문으로 붙는다.
   ★ .env 는 override 로 읽혀 DB_HOST/DB_PORT 를 덮으므로, 도커 판은 .env 가 아니라 여기서 정한다(.env 는 그대로 — 윈도우 작업들이 같이 쓴다). */
const 도커 = process.env.TM_DOCKER === '1';
module.exports = {
  도커,
  MS: 도커 ? { host: 'mssql', port: 1433 } : null,          // null = db.js 가 .env(DB_HOST/DB_PORT) 그대로
  PG: 도커 ? { host: 'postgis', port: 5432 } : { host: '127.0.0.1', port: 15432 },
  RD: 도커 ? { host: 'redis', port: 6379 } : { host: '127.0.0.1', port: 16379 },
};
