# @sch0718/seen-store

이미 본 항목(처음 안내, 새 기능 알림 등)의 식별자를 이 브라우저의 `localStorage`에 기록합니다. 프레임워크와 무관하고 런타임 의존성이 없습니다.

```ts
import { createSeenStore } from '@sch0718/seen-store';

const HELP_IDS = ['library', 'map', 'share'] as const;
export const helpSeen = createSeenStore({ key: 'tripmap:help-seen:v1', ids: HELP_IDS });

if (!helpSeen.read().has('map')) {
  // 처음 안내를 보여 준다
  helpSeen.mark('map');
}
```

- 저장 형식은 식별자 문자열의 JSON 배열입니다. 랜드마크·가즈아의 기존 `help-seen` 기록과 같아서 키만 그대로 넘기면 이전 기록을 이어서 씁니다.
- 깨진 값은 빈 기록으로 봅니다. `ids`에 없는 식별자(다른 버전이 남긴 것)는 읽을 때 뺍니다.
- 저장소 접근이나 쓰기가 막히면(사생활 보호 모드, 용량 초과, `window`가 없는 환경) 이번 페이지 로드 동안 메모리만 씁니다.
- `storage`를 주입하면 시험이나 `sessionStorage`에 쓸 수 있습니다.

라이선스: [PolyForm Noncommercial 1.0.0](./LICENSE)
