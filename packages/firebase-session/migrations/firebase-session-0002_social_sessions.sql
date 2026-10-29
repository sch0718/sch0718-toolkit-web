-- 카카오·네이버 로그인 세션. identity는 그 세션을 만든 공급자 계정('kakao:<sub>' 등), Google 세션은 NULL.
-- NULL이 아닌 세션만 Firebase ID 토큰 없이(세션만으로) 인증할 수 있다.
ALTER TABLE sessions ADD COLUMN identity TEXT;
