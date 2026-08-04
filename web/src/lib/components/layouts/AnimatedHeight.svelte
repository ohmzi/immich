<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    children?: Snippet;
  };

  let { children }: Props = $props();

  let inner = $state<HTMLDivElement>();
  let height = $state<number>();

  // ResizeObserver is browser-only and this route is server-rendered, so height stays
  // undefined (`height: auto`) until the first client-side measurement. Without that the
  // card would render collapsed and then pop open on hydration.
  $effect(() => {
    const element = inner;
    if (!element) {
      return;
    }

    const update = () => (height = element.scrollHeight);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  });
</script>

<div class="animated-height overflow-hidden" style={height === undefined ? undefined : `height: ${height}px`}>
  <div bind:this={inner}>
    {@render children?.()}
  </div>
</div>

<style>
  .animated-height {
    transition: height 280ms cubic-bezier(0.22, 0.61, 0.36, 1);
  }

  @media (prefers-reduced-motion: reduce) {
    .animated-height {
      transition: none;
    }
  }
</style>
