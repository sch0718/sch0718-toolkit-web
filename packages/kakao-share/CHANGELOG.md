# @sch0718/kakao-share

## 0.1.1

### Patch Changes

- [#14](https://github.com/sch0718/sch0718-toolkit-web/pull/14) [`25a4c53`](https://github.com/sch0718/sch0718-toolkit-web/commit/25a4c538b138f8f3b2fc35e8fb38dbace81a2b1a) Thanks [@sch0718](https://github.com/sch0718)! - 카카오 SDK를 `init` 뒤에 `Share`가 붙는 실제 동작에 맞춰 확인하고, 링크 기본 한도를 모바일 실측값 400자로 낮춘다(랜드마크 [#62](https://github.com/sch0718/landmark/pull/62)와 같은 수정).

## 0.1.0

### Minor Changes

- [#8](https://github.com/sch0718/sch0718-toolkit-web/pull/8) [`ebc5ff6`](https://github.com/sch0718/sch0718-toolkit-web/commit/ebc5ff637bd838dea46d8d29f57d02b18acd605a) Thanks [@sch0718](https://github.com/sch0718)! - 첫 버전. 랜드마크의 카카오톡 공유 모듈(`src/lib/kakao-share`)을 동작을 바꾸지 않고 옮겼다. 키와 이미지 주소는 앱이 주입하고, SDK는 SRI로 확인해 지연 로드한다.
