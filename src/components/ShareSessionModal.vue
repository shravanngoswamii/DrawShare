<script setup lang="ts">
import { computed, ref } from "vue";
import { useEditorStore } from "@/stores/editor";
import { useLiveStore } from "@/stores/live";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const editor = useEditorStore();
const live = useLiveStore();
const copied = ref(false);

const joinUrl = computed(() => {
  if (!live.code) return "";
  const base = window.location.origin + window.location.pathname;
  return `${base}#/v/${live.code}`;
});

const statusLabel = computed(() => {
  if (live.status === "connecting") return "Starting.";
  if (live.status === "waiting" && live.viewerCount === 0) return "Waiting for viewers";
  if (live.viewerCount === 1) return "1 viewer connected";
  if (live.viewerCount > 1) return `${live.viewerCount} viewers connected`;
  if (live.status === "error") return "Error";
  return "";
});

async function start() {
  await live.startHosting(() => ({
    project: editor.project!,
    pages: [...editor.pages],
    currentPageId: editor.currentPageId!,
    strokes: [...editor.strokes],
  }));
}

function stop() {
  live.stop();
  emit("close");
}

async function copy() {
  try {
    await navigator.clipboard.writeText(joinUrl.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* noop */
  }
}
</script>

<template>
  <div v-if="props.open" class="backdrop" @click.self="emit('close')">
    <div class="modal" role="dialog" aria-labelledby="share-title">
      <header class="head">
        <h2 id="share-title" class="title">Share live</h2>
        <button class="btn btn-ghost close" @click="emit('close')" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div class="body" v-if="live.mode !== 'host'">
        <p class="muted intro">
          Start a live session, then open the link on the viewer device. Strokes
          stream peer-to-peer over your local network.
        </p>
        <button class="btn btn-primary big" @click="start">Start live session</button>
        <p v-if="live.error" class="error">{{ live.error }}</p>
      </div>

      <div class="body" v-else>
        <div class="status">
          <span :class="['dot', live.status === 'waiting' || live.status === 'connecting' ? 'dot-pending' : 'dot-live']"></span>
          <span>{{ statusLabel }}</span>
        </div>

        <div class="field">
          <label class="label">Session code</label>
          <div class="code">{{ live.code }}</div>
        </div>

        <div class="field">
          <label class="label">Open this link on the viewer device</label>
          <div class="url-row">
            <input class="input url" :value="joinUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
            <button class="btn" @click="copy">{{ copied ? "Copied" : "Copy" }}</button>
          </div>
        </div>

        <div class="actions">
          <button class="btn danger" @click="stop">Stop sharing</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: var(--space-4);
}

.modal {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  width: 480px;
  max-width: 100%;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.title {
  font-size: var(--text-lg);
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
}

.close {
  height: 30px;
  width: 30px;
  padding: 0;
}

.body {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.intro {
  font-size: var(--text-sm);
  line-height: 1.5;
  margin: 0;
}

.big {
  height: 40px;
  font-weight: 600;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
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

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.label {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.code {
  font-family: var(--font-mono);
  font-size: var(--text-2xl);
  font-weight: 600;
  letter-spacing: 0.15em;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  text-align: center;
}

.url-row {
  display: flex;
  gap: var(--space-2);
}

.url {
  flex: 1;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-2);
}

.danger {
  color: var(--color-danger);
  border-color: var(--color-border-strong);
}

.danger:hover {
  background: #fef2f2;
  border-color: var(--color-danger);
}

.error {
  font-size: var(--text-sm);
  color: var(--color-danger);
  margin: 0;
}
</style>
