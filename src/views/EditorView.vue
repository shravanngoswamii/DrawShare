<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import CanvasStage from "@/components/CanvasStage.vue";
import PagesPanel from "@/components/PagesPanel.vue";
import Toolbar from "@/components/Toolbar.vue";
import TopBar from "@/components/TopBar.vue";
import { useEditorStore } from "@/stores/editor";
import { useLiveStore } from "@/stores/live";
import { useProjectsStore } from "@/stores/projects";

const props = defineProps<{ id: string }>();
const editor = useEditorStore();
const live = useLiveStore();
const projects = useProjectsStore();
const router = useRouter();

const panelOpen = ref(false);

onMounted(async () => {
  if (!projects.loaded) await projects.load();
  try {
    await editor.open(props.id);
  } catch {
    router.replace({ name: "projects" });
  }
});

watch(
  () => props.id,
  async (next, prev) => {
    if (next !== prev) {
      live.stop();
      try {
        await editor.open(next);
      } catch {
        router.replace({ name: "projects" });
      }
    }
  },
);

onBeforeUnmount(() => {
  live.stop();
  window.removeEventListener("keydown", onKey);
});

function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === "z" && !e.shiftKey) {
    e.preventDefault();
    editor.undo();
  } else if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
    e.preventDefault();
    editor.redo();
  } else if (e.key === "1") editor.setTool("pen");
  else if (e.key === "2") editor.setTool("highlighter");
  else if (e.key === "3") editor.setTool("eraser");
  else if (e.key === "Escape") panelOpen.value = false;
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
});
</script>

<template>
  <div class="editor">
    <TopBar @toggle-pages="panelOpen = !panelOpen" />
    <div class="body">
      <Toolbar />
      <main class="stage-wrap">
        <CanvasStage v-if="editor.currentPage" :page="editor.currentPage" />
        <div v-else class="loading muted">Loading.</div>
      </main>
      <PagesPanel :open="panelOpen" @close="panelOpen = false" />
    </div>
  </div>
</template>

<style scoped>
.editor {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-top: var(--safe-top);
}

.body {
  flex: 1;
  display: flex;
  min-height: 0;
  position: relative;
}

.stage-wrap {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  background: var(--color-bg);
}

.loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 767px) {
  .body {
    flex-direction: column-reverse;
  }
}
</style>
