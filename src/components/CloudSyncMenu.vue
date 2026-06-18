<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useCloudSync } from "@/composables/useCloudSync";

const {
  providerLabel,
  available,
  syncing,
  errorMsg,
  lastSyncedAt,
  status,
  connect,
  disconnect,
  syncNow,
} = useCloudSync();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const pop = ref<HTMLElement | null>(null);
const pos = reactive({ top: 0, right: 0 });

const label = computed(() => {
  switch (status.value) {
    case "syncing":
      return "Syncing…";
    case "offline":
      return "Offline";
    case "error":
      return "Sync error";
    case "reauth":
      return "Reconnect";
    case "synced":
      return "Backed up";
    default:
      return "Cloud backup";
  }
});

// Disconnected (first time) and reauth (token expired) both need an interactive
// sign-in, so they share the Connect/Reconnect affordance.
const needsConnect = computed(() => status.value === "disconnected" || status.value === "reauth");

function relTime(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function place() {
  const el = root.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  pos.top = Math.round(r.bottom + 6);
  pos.right = Math.round(Math.max(8, window.innerWidth - r.right));
}

function onDocPointer(e: MouseEvent) {
  const t = e.target as Node;
  if (root.value?.contains(t) || pop.value?.contains(t)) return;
  open.value = false;
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") open.value = false;
}
function close() {
  open.value = false;
}
watch(open, (v) => {
  if (v) {
    nextTick(place);
    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onKeydown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
  } else {
    document.removeEventListener("pointerdown", onDocPointer, true);
    document.removeEventListener("keydown", onKeydown);
    window.removeEventListener("resize", close);
    window.removeEventListener("scroll", close, true);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointer, true);
  document.removeEventListener("keydown", onKeydown);
  window.removeEventListener("resize", close);
  window.removeEventListener("scroll", close, true);
});
</script>

<template>
  <div v-if="available" ref="root" class="cloud">
    <button
      class="btn btn-ghost btn-icon cloud-btn"
      :class="`is-${status}`"
      @click="open = !open"
      :title="label"
      :aria-label="label"
      :aria-expanded="open"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78A6 6 0 1 0 6 17.5" />
        <path v-if="status === 'synced'" d="m9 13 2 2 4-4" />
        <path v-else-if="needsConnect" d="M12 11v6M9 14h6" />
      </svg>
      <span class="cloud-dot" :class="`is-${status}`" aria-hidden="true"></span>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="pop"
        class="cloud-pop"
        role="dialog"
        aria-label="Cloud backup"
        :style="{ top: `${pos.top}px`, right: `${pos.right}px` }"
      >
        <div class="cloud-head">
          <span class="cloud-title">{{ providerLabel }}</span>
          <span class="cloud-status" :class="`is-${status}`">{{ label }}</span>
        </div>
        <p v-if="status === 'disconnected'" class="cloud-desc">
          Back up your boards to your own {{ providerLabel }} and sync them across your devices. Nothing is shared publicly.
        </p>
        <p v-else-if="status === 'reauth'" class="cloud-desc">
          Your {{ providerLabel }} session expired. Reconnect to keep syncing.
        </p>
        <p v-else-if="errorMsg" class="cloud-desc cloud-err">{{ errorMsg }}</p>
        <p v-else-if="lastSyncedAt" class="cloud-desc">Last synced {{ relTime(lastSyncedAt) }}.</p>
        <p v-else class="cloud-desc">Connected.</p>

        <div class="cloud-actions">
          <template v-if="needsConnect">
            <button class="btn btn-primary btn-sm" @click="connect(); open = false">
              {{ status === "reauth" ? "Reconnect" : "Connect" }}
            </button>
          </template>
          <template v-else>
            <button class="btn btn-sm" :disabled="syncing" @click="syncNow(true)">
              {{ syncing ? "Syncing…" : "Sync now" }}
            </button>
            <button class="btn btn-ghost btn-sm" @click="disconnect(); open = false">Disconnect</button>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.cloud {
  position: relative;
  display: inline-flex;
}
.cloud-btn {
  position: relative;
}
.cloud-btn.is-synced {
  color: var(--color-success);
}
.cloud-btn.is-error {
  color: var(--color-danger);
}
.cloud-dot {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--color-text-subtle);
}
.cloud-dot.is-synced {
  background: var(--color-success);
}
.cloud-dot.is-syncing {
  background: var(--color-warning);
  animation: cloud-pulse 1s ease-in-out infinite;
}
.cloud-dot.is-error {
  background: var(--color-danger);
}
.cloud-dot.is-reauth {
  background: var(--color-warning);
}
.cloud-dot.is-disconnected {
  display: none;
}
@keyframes cloud-pulse {
  50% {
    opacity: 0.35;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cloud-dot.is-syncing {
    animation: none;
  }
}
</style>

<!-- Teleported to <body>; scoped styles still apply, but keep it self-contained. -->
<style scoped>
.cloud-pop {
  position: fixed;
  z-index: 200;
  width: 250px;
  max-width: calc(100vw - 16px);
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}
.cloud-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}
.cloud-title {
  font-size: var(--text-sm);
  font-weight: 650;
  color: var(--color-text);
}
.cloud-status {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-subtle);
}
.cloud-status.is-synced {
  color: var(--color-success);
}
.cloud-status.is-error {
  color: var(--color-danger);
}
.cloud-status.is-reauth {
  color: var(--color-warning);
}
.cloud-desc {
  margin: 0 0 var(--space-3);
  font-size: var(--text-xs);
  line-height: 1.5;
  color: var(--color-text-muted);
}
.cloud-err {
  color: var(--color-danger);
}
.cloud-actions {
  display: flex;
  gap: var(--space-2);
}
</style>
