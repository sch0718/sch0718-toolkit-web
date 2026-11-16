<script lang="ts">
  import SnackbarRegion from './SnackbarRegion.svelte';
  import { sheetOpen } from './sheetStack.svelte.js';
  import { registerSnackbarHost } from './snackbarStore.svelte.js';

  // 시트가 열린 동안에는 맨 위 시트가 알림 영역을 그린다(aria-modal 안이어야 읽히고 누를 수 있다).
  const unregister = registerSnackbarHost();
  $effect(() => unregister);
</script>

<SnackbarRegion hidden={sheetOpen()} />
