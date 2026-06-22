<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import ThemeMenu from "@/components/ThemeMenu.vue";
import ViewerStage from "@/components/ViewerStage.vue";
import { useTheme } from "@/composables/useTheme";
import { useLiveStore } from "@/stores/live";

const props = defineProps<{ code: string }>();
const live = useLiveStore();
const router = useRouter();
const { mirrorTheme, pickCount } = useTheme();

const showThumbs = ref(false);
const fullscreen = ref(false);
// Follow the host's theme until the viewer picks their own from the menu.
const followHostTheme = ref(true);

// Drawing tools, shown only while the host has granted this viewer permission.
const PEN_COLORS = ["#0f172a", "#dc2626", "#2563eb", "#16a34a", "#f59e0b"];
const drawColor = ref(PEN_COLORS[0]);
const drawSize = ref(4);
const canDraw = computed(() => live.viewerCanEdit && !live.viewerIsNotebook);

const statusLabel = computed(() => {
  switch (live.status) {
    case "connecting":
      return "Connecting.";
    case "waiting":
      return "Waiting for host.";
    case "connected":
      return "Live";
    case "reconnecting":
      return live.disconnectReason || "Reconnecting…";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Error";
    default:
      return "";
  }
});

// Mirror the host's theme (applied transiently, so the viewer's saved theme is
// untouched) until they override it.
watch(
  () => live.viewerHostTheme,
  (id) => {
    if (id && followHostTheme.value) mirrorTheme(id);
  },
  { immediate: true },
);
// Any explicit pick from the theme menu means the viewer wants their own theme;
// stop following the host from then on.
watch(pickCount, () => {
  followHostTheme.value = false;
});

const dotClass = computed(() => {
  if (live.status === "connected") return "dot dot-live";
  if (live.status === "connecting" || live.status === "reconnecting") return "dot dot-pending";
  return "dot dot-off";
});

onMounted(async () => {
  await live.join(props.code);
});

onBeforeUnmount(() => {
  mirrorTheme(null); // restore the viewer's own saved theme on the way out
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
        <button class="btn btn-ghost btn-icon leave-btn" @click="leave" aria-label="Leave">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
        </button>
        <span class="project-name">
          {{ live.viewerProject?.name ?? "Connecting." }}
        </span>
        <span v-if="live.viewerName" class="viewer-name" :title="`You are ${live.viewerName}`">
          {{ live.viewerName }}
        </span>
      </div>
      <div class="right">
        <button
          class="btn btn-ghost"
          @click="showThumbs = !showThumbs"
          v-if="live.viewerPages.length > 1"
          :class="{ active: showThumbs }"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M15 3v18" />
          </svg>
          <span class="btn-label">Pages</span>
        </button>
        <button class="btn btn-ghost" @click="toggleFullscreen" aria-label="Fullscreen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
          <span class="btn-label">Fullscreen</span>
        </button>
        <ThemeMenu />
        <div class="status">
          <span :class="dotClass" aria-hidden="true"></span>
          <span class="status-label">{{ statusLabel }}</span>
        </div>
      </div>
    </header>

    <main class="stage-wrap">
      <ViewerStage
        v-if="live.viewerCurrentPage || (live.viewerIsNotebook && live.viewerPages.length)"
        :page="live.viewerCurrentPage ?? live.viewerPages[0]"
        :color="drawColor"
        :size="drawSize"
      />
      <div v-else class="state">
        <div v-if="live.status === 'error'" class="error-state">
          <div class="state-title">Couldn't connect</div>
          <div class="muted state-msg">{{ live.error || "Unknown error" }}</div>
          <div class="state-actions">
            <button class="btn btn-primary" @click="reconnect">Try again</button>
            <button class="btn" @click="leave">Back</button>
          </div>
        </div>
        <div v-else-if="live.status === 'disconnected'" class="error-state">
          <div class="state-title">Disconnected</div>
          <div class="muted state-msg">{{ live.disconnectReason || "The connection was lost." }}</div>
          <div class="state-actions">
            <button class="btn btn-primary" @click="reconnect">Reconnect</button>
            <button class="btn" @click="leave">Back</button>
          </div>
        </div>
        <div v-else class="connecting">
          <div class="connecting-spinner" aria-hidden="true"></div>
          <div class="muted">
            <template v-if="live.status === 'reconnecting'">
              {{ live.disconnectReason || "Reconnecting…" }}
            </template>
            <template v-else>
              {{ live.status === "connecting" ? "Connecting to " + props.code + "…" : "Waiting for the host to start…" }}
            </template>
          </div>
        </div>
      </div>

      <div v-if="showThumbs && !live.viewerIsNotebook && live.viewerPages.length > 1" class="page-strip" role="tablist">
        <button
          v-for="p in live.viewerPages"
          :key="p.id"
          class="strip-item"
          :class="{ active: live.viewerCurrentPageId === p.id }"
          @click="live.viewerCurrentPageId = p.id"
          role="tab"
          :aria-selected="live.viewerCurrentPageId === p.id"
        >
          <div class="strip-thumb"></div>
          <span class="strip-label">{{ p.name }}</span>
        </button>
      </div>

      <!-- Drawing toolbar: only when the host has granted this viewer -->
      <div v-if="canDraw" class="draw-bar" role="toolbar" aria-label="Drawing tools">
        <span class="draw-hint">You can draw</span>
        <div class="swatches">
          <button
            v-for="c in PEN_COLORS"
            :key="c"
            class="swatch"
            :class="{ active: drawColor === c }"
            :style="{ background: c }"
            @click="drawColor = c"
            :aria-label="`Use colour ${c}`"
            :aria-pressed="drawColor === c"
          ></button>
        </div>
        <input
          class="size"
          type="range"
          min="2"
          max="14"
          step="1"
          v-model.number="drawSize"
          aria-label="Pen size"
        />
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
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
  padding-top: var(--safe-top);
}

.bar {
  height: var(--header-h);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-3);
  gap: var(--space-2);
  flex-shrink: 0;
}

.left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  flex: 1;
}

.right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.project-name {
  font-size: var(--text-md);
  font-weight: 600;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-pill);
}

.dot-live {
  background: var(--color-success);
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.2);
}

.dot-pending {
  background: var(--color-warning);
  animation: pulse 1.4s ease-in-out infinite;
}

.dot-off {
  background: var(--color-text-subtle);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
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
  padding: var(--space-4);
}

.connecting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.viewer-name {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  padding: 2px var(--space-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 40vw;
}

.draw-bar {
  position: absolute;
  bottom: calc(var(--space-4) + var(--safe-bottom));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-md);
  max-width: calc(100vw - var(--space-4) * 2);
}

.draw-hint {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-success);
  white-space: nowrap;
}

.swatches {
  display: flex;
  gap: var(--space-1);
}

.swatch {
  width: 22px;
  height: 22px;
  border-radius: var(--radius-pill);
  border: 2px solid transparent;
  box-shadow: 0 0 0 1px var(--color-border);
}

.swatch.active {
  border-color: var(--color-surface);
  box-shadow: 0 0 0 2px var(--color-accent);
}

.size {
  width: 90px;
  accent-color: var(--color-accent);
}

.connecting-spinner {
  width: 32px;
  height: 32px;
  border: 2px solid var(--color-border-strong);
  border-top-color: var(--color-accent);
  border-radius: var(--radius-pill);
  animation: spin 800ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-state {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  text-align: center;
  max-width: 380px;
  width: 100%;
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
  flex-wrap: wrap;
}

.page-strip {
  position: absolute;
  bottom: calc(var(--space-4) + var(--safe-bottom));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  max-width: calc(100vw - var(--space-4) * 2);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.strip-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  flex-shrink: 0;
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
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exit-fs {
  position: absolute;
  top: calc(var(--space-3) + var(--safe-top));
  right: calc(var(--space-3) + var(--safe-right));
}

@media (max-width: 767px) {
  .bar {
    padding: 0 var(--space-2);
  }

  .btn-label {
    display: none;
  }

  .status {
    padding: 4px var(--space-2);
  }

  .status-label {
    display: none;
  }
}
</style>
