<script lang="ts">
  // 도움말에 넣는 최근 릴리스 내용. 형식은 @sch0718/app-update의 ReleaseNote와 같다(의존하지 않고 모양만 맞춘다).
  type Note = { version: string; date: string; items: readonly string[] };
  let {
    notes,
    limit = 3,
    title = '최근 바뀐 점',
    id = 'release-notes',
  }: {
    /** 새것부터 */
    notes: readonly Note[];
    /** 보여 줄 릴리스 수. 기본 3 */
    limit?: number;
    title?: string;
    /** 제목 id. 한 화면에 둘 이상 두거나 주소로 바로 가게 할 때 바꾼다. 기본 'release-notes' */
    id?: string;
  } = $props();
  const shown = $derived(notes.slice(0, limit));
</script>

{#if shown.length}
  <section class="release-notes" aria-labelledby={id}>
    <h2 {id}>{title}</h2>
    <ol>
      {#each shown as note (note.version)}
        <li>
          <p class="head"><b>{note.version}</b> <time datetime={note.date}>{note.date}</time></p>
          <ul>
            {#each note.items as item, i (i)}
              <li>{item}</li>
            {/each}
          </ul>
        </li>
      {/each}
    </ol>
  </section>
{/if}

<style>
  .release-notes ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--sp-4);
  }
  .head {
    margin: 0 0 var(--sp-1);
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
  }
  .head b {
    color: var(--t1);
  }
  time {
    color: var(--t3);
    font-size: var(--fs-label);
  }
  ul {
    margin: 0;
    padding-left: var(--sp-5);
    color: var(--t2);
    line-height: 1.6;
  }
</style>
