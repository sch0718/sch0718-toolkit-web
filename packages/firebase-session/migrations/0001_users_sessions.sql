-- @sch0718/firebase-session의 사용자·기기 세션 테이블. 서비스의 migrations/에 복사해 적용한다.
-- 시각은 모두 서버 epoch ms다.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  firebase_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

-- 세션 원문은 기기에만 있다. 여기에는 SHA-256 hex만 둔다.
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX sessions_user ON sessions(user_id);
