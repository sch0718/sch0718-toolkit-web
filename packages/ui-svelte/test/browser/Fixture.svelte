<script lang="ts">
  import Sheet from '../../src/lib/Sheet.svelte';
  import SnackbarHost from '../../src/lib/SnackbarHost.svelte';
  import { showSnackbar } from '../../src/lib/snackbarStore.svelte.js';
  import '../../src/lib/tokens.css';

  let aOpen = $state(false);
  let bOpen = $state(false);
  let clicks = $state(0);

  function addBackground() {
    const button = document.createElement('button');
    button.textContent = '새 배경';
    document.getElementById('app')!.append(button);
  }
</script>

<button onclick={() => (aOpen = true)}>시트 A 열기</button>
<button onclick={() => clicks++}>배경 단추</button>
<p>배경 클릭: {clicks}</p>
<SnackbarHost />
<Sheet open={aOpen} title="시트 A" onclose={() => (aOpen = false)}>
  <input aria-label="A 입력" />
  <button onclick={() => showSnackbar('삭제했어요', { label: '되돌리기', run() {} }, 60_000)}>삭제</button>
  <button onclick={() => (bOpen = true)}>시트 B 열기</button>
  <button onclick={addBackground}>배경 추가</button>
</Sheet>
<Sheet open={bOpen} title="시트 B" onclose={() => (bOpen = false)}>
  <input aria-label="B 입력" />
</Sheet>
