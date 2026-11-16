<script lang="ts">
  import SnackbarRegion from './SnackbarRegion.svelte';
  import { sheetOpen } from './sheetStack.svelte.js';
</script>

<SnackbarRegion hidden={sheetOpen()} />
