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
  if (live.status === "waiting" && live.viewerCount === 0) return "Waiting for viewers.";
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
        <h2 id="share-title" class="title">Share live session</h2>
        <button class="btn btn-ghost btn-icon close" @click="emit('close')" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div class="body" v-if="live.mode !== 'host'">
        <p class="intro muted">
          Start a live session, then open the link on the viewer device. Strokes
          stream peer-to-peer over your local network.
        </p>
        <button class="btn btn-primary big" @click="start">
          Start live session
        </button>
        <p v-if="live.error" class="error">{{ live.error }}</p>
      </div>

      <div class="body" v-else>
        <div class="status">
          <span
            :class="['dot', live.status === 'waiting' || live.status === 'connecting' ? 'dot-pending' : 'dot-live']"
            aria-hidden="true"
          ></span>
          <span>{{ statusLabel }}</span>
        </div>

        <div class="field">
          <label class="label">Session code</label>
          <div class="code">{{ live.code }}</div>
        </div>

        <div class="field">
          <label class="label" for="join-url">Viewer link</label>
          <div class="url-row">
            <input
              id="join-url"
              class="input url"
              :value="joinUrl"
              readonly
              @focus="($event.target as HTMLInputElement).select()"
            />
            <button class="btn copy-btn" @click="copy">
              {{ copied ? "Copied" : "Copy" }}
            </button>
          </div>
          <div class="muted url-hint">
            Open this link on the laptop. Same Wi-Fi as the host for fastest delivery.
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
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: var(--space-4);
  padding-bottom: calc(var(--space-4) + var(--safe-bottom));
  animation: fadeIn 160ms ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  width: 480px;
  max-width: 100%;
  max-height: calc(100vh - var(--space-8));
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
  animation: slideUp 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideUp {
  from { transform: translateY(8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.title {
  font-size: var(--text-md);
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
}

.close {
  height: 30px;
  width: 30px;
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
  height: 44px;
  font-weight: 600;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  align-self: flex-start;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-pill);
  flex-shrink: 0;
}

.dot-live {
  background: var(--color-success);
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.2);
}

.dot-pending {
  background: var(--color-warning);
  animation: pulse 1.4s ease-in-out infinite;
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
  letter-spacing: 0.18em;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  text-align: center;
  -webkit-user-select: all;
  user-select: all;
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

.copy-btn {
  flex-shrink: 0;
  min-width: 80px;
}

.url-hint {
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

.danger:hover:not(:disabled) {
  background: var(--color-danger-soft);
  border-color: var(--color-danger);
  color: var(--color-danger-strong);
}

.error {
  font-size: var(--text-sm);
  color: var(--color-danger);
  margin: 0;
}

@media (max-width: 767px) {
  .backdrop {
    padding: 0;
    align-items: flex-end;
  }

  .modal {
    width: 100%;
    max-height: 90vh;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border-bottom: none;
    animation: slideUp 220ms cubic-bezier(0.4, 0, 0.2, 1);
    padding-bottom: var(--safe-bottom);
  }

  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .code {
    font-size: var(--text-xl);
    letter-spacing: 0.15em;
  }

  .url-row {
    flex-direction: column;
  }

  .copy-btn {
    width: 100%;
  }
}
</style>
