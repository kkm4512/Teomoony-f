const path = require('path');
const fs = require('fs');
const sql = require('mssql');

/* 설정은 두 곳에서 읽는다.
   1) Teomoony-f/.env            (있으면 우선)
   2) ..\Teomoony\.env           (ETL 과 같은 설정을 공유)
   키를 두 군데 적어두지 않기 위해서다. */
function loadEnv() {
  const here = path.join(__dirname, '..', '.env');
  const shared = path.join(__dirname, '..', '..', 'Teomoony', '.env');
  for (const p of [shared, here]) {
    if (fs.existsSync(p)) require('dotenv').config({ path: p, override: true });
  }
}
loadEnv();

const config = {
  server: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 11433),
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'Teomoony',
  options: {
    encrypt: false,              // 로컬 Docker. 운영이면 true
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  /* ★ 상세가 쿼리 27개를 한꺼번에 던진다(직렬 16초 -> 한 파). 풀이 10이면
     세 파로 나뉘어 **줄 서는 시간**이 각 쿼리 측정값에 섞인다. 큰 단지
     (헬리오시티 9,510세대)에서 off 가 직렬 27ms 인데 배치 안에서 1,917ms 로
     보이는 게 그것이다. 20으로 올려 재 본다 — 효과 없으면 되돌린다.
     ★ 늘리면 적재와 부딪힐 일도 늘어난다. 그래서 되풀이()(교착 재시도)가 있다. */
  /* ★ 20 으로 올려 재 봤다(2026-10-20): 큰 단지만 2,003 -> 1,780ms(11%),
     작은 단지는 노이즈 안에서 오히려 조금 나빴다. 적재와 부딪힐 일만 늘어서
     **10 으로 되돌렸다.** 큰 단지의 남은 1.8초는 hos(9,510세대 호 목록)이고,
     그건 데이터가 많아서 드는 정직한 비용이다. */
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  requestTimeout: 60000,
};

let poolPromise = null;
function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect().catch(err => {
      poolPromise = null;              // 실패하면 다음 요청에서 다시 시도
      throw err;
    });
  }
  return poolPromise;
}

module.exports = { sql, getPool, config };
