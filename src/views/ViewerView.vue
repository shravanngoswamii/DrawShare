<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import ViewerStage from "@/components/ViewerStage.vue";
import { useLiveStore } from "@/stores/live";

const props = defineProps<{ code: string }>();
const live = useLiveStore();
const route = useRoute();
const router = useRouter();

const showThumbs = ref(false);
const fullscreen = ref(false);
const copied = ref(false);

const offerToken = computed(() => {
  const token = route.query.offer;
  return typeof token === "string" ? token : "";
});

const statusLabel = computed(() => {
  switch (live.status) {
    case "connecting":
      return "Connecting.";
    case "waiting":
      return "Waiting for host.";
    case "connected":
      return "Live";
    case "reconnecting":
      return `Reconnecting… (${live.reconnectAttempt + 1}/${3})`;
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
  if (live.status === "connecting" || live.status === "reconnecting") return "dot dot-pending";
  return "dot dot-off";
});

onMounted(async () => {
  await live.join(props.code, offerToken.value);
});

onBeforeUnmount(() => {
  live.stop();
});

async function reconnect() {
  await live.join(props.code, offerToken.value);
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

async function copyResponse() {
  try {
    await navigator.clipboard.writeText(live.viewerResponseToken);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* noop */
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
        <div class="status">
          <span :class="dotClass" aria-hidden="true"></span>
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
              Reconnecting… (attempt {{ live.reconnectAttempt + 1 }} of 3)
              <div v-if="live.disconnectReason" class="reconnect-reason">{{ live.disconnectReason }}</div>
            </template>
            <template v-else>
              {{ live.status === "connecting" ? "Connecting to " + props.code + "…" : "Fetching session…" }}
            </template>
          </div>
          <div class="field response-field" v-if="live.viewerResponseToken">
            <label class="label">Viewer response</label>
            <div class="url-row">
              <input class="input response" :value="live.viewerResponseToken" readonly @focus="($event.target as HTMLInputElement).select()" />
              <button class="btn copy-btn" @click="copyResponse">
                {{ copied ? "Copied" : "Copy" }}
              </button>
            </div>
            <div class="muted url-hint">Share this token back with the host to finish pairing.</div>
          </div>
        </div>
      </div>

      <div v-if="showThumbs && live.viewerPages.length > 1" class="page-strip" role="tablist">
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

.wifi-hint {
  font-size: var(--text-xs);
  text-align: center;
  max-width: 260px;
}

.response-field {
  margin-top: var(--space-2);
  width: min(100%, 420px);
}

.url-row {
  display: flex;
  gap: var(--space-2);
  width: 100%;
}

.response {
  flex: 1;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.copy-btn {
  flex-shrink: 0;
  min-width: 80px;
}

.url-hint {
  font-size: var(--text-xs);
  text-align: center;
  max-width: 320px;
}

.reconnect-reason {
  font-size: var(--text-xs);
  color: var(--color-text-subtle);
  margin-top: 4px;
  text-align: center;
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
