<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import ViewerStage from "@/components/ViewerStage.vue";
import { useLiveStore } from "@/stores/live";

const props = defineProps<{ code: string }>();
const live = useLiveStore();
const router = useRouter();

const showThumbs = ref(false);
const fullscreen = ref(false);

const statusLabel = computed(() => {
  switch (live.status) {
    case "connecting":
      return "Connecting.";
    case "connected":
      return "Live";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Error";
    default:
      return "";
  }
});

const dotClass = computed(() => {
  if (live.status === "connected") return "dot dot-live";
  if (live.status === "connecting") return "dot dot-pending";
  return "dot dot-off";
});

onMounted(async () => {
  await live.join(props.code);
});

onBeforeUnmount(() => {
  live.stop();
});

async function reconnect() {
  await live.join(props.code);
}

function leave() {
  live.stop();
  router.replace({ name: "projects" });
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen().catch(() => {});
    fullscreen.value = true;
  } else {
    await document.exitFullscreen().catch(() => {});
    fullscreen.value = false;
  }
}
</script>

<template>
  <div class="viewer">
    <header class="bar" v-if="!fullscreen">
      <div class="left">
        <button class="btn btn-ghost" @click="leave">Leave</button>
        <div class="divider"></div>
        <span class="project-name">{{ live.viewerProject?.name ?? "Connecting." }}</span>
      </div>
      <div class="right">
        <button
          class="btn btn-ghost"
          @click="showThumbs = !showThumbs"
          v-if="live.viewerPages.length > 1"
        >
          Pages
        </button>
        <button class="btn btn-ghost" @click="toggleFullscreen">Fullscreen</button>
        <div class="status">
          <span :class="dotClass"></span>
          <span class="status-label">{{ statusLabel }}</span>
        </div>
      </div>
    </header>

    <main class="stage-wrap">
      <ViewerStage v-if="live.viewerCurrentPage" :page="live.viewerCurrentPage" />
      <div v-else class="state">
        <div v-if="live.status === 'error'" class="error-state">
          <div class="state-title">Couldn't connect</div>
          <div class="muted state-msg">{{ live.error || "Unknown error" }}</div>
          <div class="state-actions">
            <button class="btn btn-primary" @click="reconnect">Try again</button>
            <button class="btn" @click="leave">Back</button>
          </div>
        </div>
        <div v-else class="muted">
          {{ live.status === "connecting" ? "Connecting to session " + props.code : "" }}
        </div>
      </div>

      <div v-if="showThumbs" class="page-strip">
        <button
          v-for="p in live.viewerPages"
          :key="p.id"
          class="strip-item"
          :class="{ active: live.viewerCurrentPageId === p.id }"
          @click="live.viewerCurrentPageId = p.id"
        >
          <div class="strip-thumb"></div>
          <span class="strip-label">{{ p.name }}</span>
        </button>
      </div>

      <button v-if="fullscreen" class="exit-fs btn" @click="toggleFullscreen">
        Exit fullscreen
      </button>
    </main>
  </div>
</template>

<style scoped>
.viewer {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
}

.bar {
  height: var(--header-h);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-4);
  flex-shrink: 0;
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.divider {
  width: 1px;
  height: 20px;
  background: var(--color-border);
}

.project-name {
  font-size: var(--text-md);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.dot-live {
  background: #16a34a;
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.18);
}

.dot-pending {
  background: #ca8a04;
  animation: pulse 1.2s ease-in-out infinite;
}

.dot-off {
  background: var(--color-text-subtle);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.stage-wrap {
  flex: 1;
  position: relative;
  min-height: 0;
}

.state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-state {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  text-align: center;
  max-width: 360px;
}

.state-title {
  font-size: var(--text-lg);
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.state-msg {
  margin-bottom: var(--space-4);
  font-size: var(--text-sm);
}

.state-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: center;
}

.page-strip {
  position: absolute;
  bottom: var(--space-4);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.strip-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-md);
}

.strip-item.active {
  background: var(--color-accent-soft);
}

.strip-thumb {
  width: 32px;
  height: 42px;
  background: #fff;
  border: 1px solid var(--color-border-strong);
  border-radius: 2px;
}

.strip-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-weight: 500;
}

.exit-fs {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
}
</style>
