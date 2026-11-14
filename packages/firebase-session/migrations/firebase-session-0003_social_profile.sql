-- 소셜 세션을 만들 때 받은 표시용 정보. 식별·허용 판정에는 쓰지 않는다.
ALTER TABLE sessions ADD COLUMN display_name TEXT;
ALTER TABLE sessions ADD COLUMN unverified_email TEXT;
