<script setup lang="ts">
import { computed, ref } from "vue";
import { buildShareUrl } from "@/core/shareLinks";
import { useEditorStore } from "@/stores/editor";
import { useLiveStore } from "@/stores/live";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const editor = useEditorStore();
const live = useLiveStore();
const copied = ref(false);

const joinUrl = computed(() => (live.code ? buildShareUrl(`v/${live.code}`) : ""));

const qrUrl = computed(() => {
  if (!joinUrl.value) return "";
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinUrl.value)}&bgcolor=ffffff&margin=2`;
});

const canShare = computed(() => typeof navigator.share === "function");

const statusLabel = computed(() => {
  if (live.status === "connecting") return "Setting up session…";
  if (live.status === "error") return live.error || "Connection error";
  if (live.viewerCount === 1) return "1 viewer connected";
  if (live.viewerCount > 1) return `${live.viewerCount} viewers connected`;
  return "Waiting for viewers";
});

async function start() {
  await live.startHosting(() => ({
    project: editor.project!,
    pages: [...editor.pages],
    currentPageId: editor.currentPageId!,
    strokes: [...editor.strokes],
    shapes: [...editor.shapes],
    notebookMode: editor.notebookMode,
    notebookLayout: editor.notebookLayout,
    // In notebook mode editor.strokes/shapes already hold every sheet's page-local data.
    allStrokes: editor.notebookMode !== "off" ? [...editor.strokes] : [],
    allShapes: editor.notebookMode !== "off" ? [...editor.shapes] : [],
  }));
}

function stop() {
  live.stop();
  emit("close");
}

async function copyUrl() {
  if (!joinUrl.value) return;
  try {
    await navigator.clipboard.writeText(joinUrl.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* noop */
  }
}

async function share() {
  if (!canShare.value || !joinUrl.value) return;
  await navigator
    .share({
      title: `Join DrawShare session ${live.code}`,
      text: `Join my live drawing session. Code: ${live.code}`,
      url: joinUrl.value,
    })
    .catch(() => {
      /* user dismissed */
    });
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

      <!-- ── Not hosting ── -->
      <div class="body" v-if="live.mode !== 'host'">
        <p class="intro muted">
          Start a session and share the code. Viewers enter it on the home
          screen — no link copying needed. Works across the internet, on any device.
        </p>
        <button
          class="btn btn-primary big"
          @click="start"
          :disabled="live.status === 'connecting'"
        >
          {{ live.status === "connecting" ? "Starting…" : "Start session" }}
        </button>
        <p v-if="live.error" class="error">{{ live.error }}</p>
      </div>

      <!-- ── Hosting ── -->
      <div class="body" v-else>
        <!-- Status badge -->
        <div class="status">
          <span
            :class="['dot', live.viewerCount > 0 ? 'dot-live' : live.status === 'error' ? 'dot-off' : 'dot-pending']"
            aria-hidden="true"
          ></span>
          <span>{{ statusLabel }}</span>
        </div>

        <!-- Loading: opening the session -->
        <div v-if="live.status === 'connecting'" class="relay-pending muted">
          <div class="spin" aria-hidden="true"></div>
          <span>Setting up session…</span>
        </div>

        <!-- Live: code + QR + share link -->
        <template v-else-if="live.status !== 'error'">
          <div class="code-block">
            <div class="label code-lbl">Session code</div>
            <div class="code" aria-label="Session code">{{ live.code }}</div>
            <div class="code-hint muted">Viewers enter this on the home screen</div>
          </div>

          <img
            v-if="qrUrl"
            :src="qrUrl"
            class="qr"
            width="150"
            height="150"
            alt="Scan to join session"
            loading="lazy"
          />

          <div class="url-row">
            <input
              class="input url"
              :value="joinUrl"
              readonly
              @focus="($event.target as HTMLInputElement).select()"
              aria-label="Session link"
            />
            <button class="btn copy-btn" @click="copyUrl">
              {{ copied ? "Copied" : "Copy" }}
            </button>
            <button v-if="canShare" class="btn" @click="share" aria-label="Share via system">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
          </div>
        </template>

        <!-- Error -->
        <p v-else class="error">{{ live.error || "Connection error" }}</p>

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
  width: 400px;
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

.close { height: 30px; width: 30px; }

.body {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  align-items: stretch;
}

.intro {
  font-size: var(--text-sm);
  line-height: 1.55;
  margin: 0;
}

.big { height: 44px; font-weight: 600; }

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
  animation: blink 1.4s ease-in-out infinite;
}

.dot-off { background: var(--color-text-muted); }

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.relay-pending {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-sm);
  padding: var(--space-3);
}

.spin {
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  flex-shrink: 0;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Code block ── */
.code-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.code-lbl {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.code {
  font-family: var(--font-mono);
  font-size: var(--text-3xl);
  font-weight: 700;
  letter-spacing: 0.22em;
  -webkit-user-select: all;
  user-select: all;
  color: var(--color-text);
}

.code-hint {
  font-size: var(--text-xs);
  text-align: center;
}

.qr {
  display: block;
  margin: 0 auto;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

/* ── URL row ── */
.url-row {
  display: flex;
  gap: var(--space-2);
}

.url {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.copy-btn {
  flex-shrink: 0;
  min-width: 72px;
}

.label {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

/* ── Actions ── */
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-2);
}

.danger { color: var(--color-danger); border-color: var(--color-border-strong); }
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
    animation: slideUpMobile 220ms cubic-bezier(0.4, 0, 0.2, 1);
    padding-bottom: var(--safe-bottom);
  }

  @keyframes slideUpMobile {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .code { font-size: var(--text-2xl); letter-spacing: 0.18em; }

  .url-row { flex-direction: column; }
  .copy-btn { width: 100%; }
}
</style>
