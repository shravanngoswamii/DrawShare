<script setup lang="ts">
import { computed, ref } from "vue";
import { useEditorStore } from "@/stores/editor";
import { useLiveStore } from "@/stores/live";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const editor = useEditorStore();
const live = useLiveStore();
const copied = ref(false);
const answerToken = ref("");
const showFallback = ref(false);

const relayJoinUrl = computed(() => {
  if (!live.code) return "";
  const base = window.location.origin + window.location.pathname;
  return `${base}#/v/${live.code}`;
});

// Full URL with embedded offer token (legacy/offline fallback)
const joinUrl = computed(() => {
  if (!live.code || !live.offerToken) return "";
  const base = window.location.origin + window.location.pathname;
  return `${base}#/v/${live.code}?offer=${encodeURIComponent(live.offerToken)}`;
});

const qrUrl = computed(() => {
  if (!relayJoinUrl.value) return "";
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(relayJoinUrl.value)}&bgcolor=ffffff&margin=2`;
});

const canShare = computed(() => typeof navigator.share === "function");

const statusLabel = computed(() => {
  if (live.status === "connecting") return "Setting up session…";
  if (live.status === "waiting" && !live.relayChecked) return "Connecting to relay…";
  if (live.status === "waiting" && live.viewerCount === 0) return "Waiting for viewers";
  if (live.viewerCount === 1) return "1 viewer connected";
  if (live.viewerCount > 1) return `${live.viewerCount} viewers connected`;
  if (live.status === "error") return live.error || "Connection error";
  return "";
});

async function start() {
  await live.startHosting(() => ({
    project: editor.project!,
    pages: [...editor.pages],
    currentPageId: editor.currentPageId!,
    strokes: [...editor.strokes],
    notebookMode: editor.notebookMode,
    notebookLayout: editor.notebookLayout,
    // In notebook mode editor.strokes already holds every sheet's page-local strokes.
    allStrokes: editor.notebookMode !== "off" ? [...editor.strokes] : [],
  }));
  answerToken.value = "";
  showFallback.value = false;
}

function stop() {
  live.stop();
  answerToken.value = "";
  showFallback.value = false;
  emit("close");
}

async function copyUrl() {
  const url = live.relayAvailable ? relayJoinUrl.value : joinUrl.value;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* noop */
  }
}

async function share() {
  if (!canShare.value || !relayJoinUrl.value) return;
  await navigator
    .share({
      title: `Join DrawShare session ${live.code}`,
      text: `Join my live drawing session. Code: ${live.code}`,
      url: relayJoinUrl.value,
    })
    .catch(() => {
      /* user dismissed */
    });
}

async function connect() {
  await live.applyViewerResponse(answerToken.value);
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
          screen — no link copying needed. Works on any Wi-Fi or hotspot.
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

        <!-- Loading: generating offer or connecting to relay -->
        <div v-if="live.status === 'connecting' || (live.status === 'waiting' && !live.relayChecked && !live.relayAvailable)" class="relay-pending muted">
          <div class="spin" aria-hidden="true"></div>
          <span>{{ live.status === 'connecting' ? 'Generating session…' : 'Connecting to relay…' }}</span>
        </div>

        <!-- Relay available: simple code + QR flow -->
        <template v-else-if="live.relayAvailable || live.status === 'connected'">
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
              :value="relayJoinUrl"
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

        <!-- Relay unavailable: offline / LAN manual fallback -->
        <template v-else-if="live.relayChecked && !live.relayAvailable">
          <div class="warn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Relay unavailable — same Wi-Fi required. Share the link manually.
          </div>

          <div class="field">
            <label class="label" for="join-url">Session link (contains connection data)</label>
            <div class="url-row">
              <input
                id="join-url"
                class="input url"
                :value="joinUrl"
                readonly
                @focus="($event.target as HTMLInputElement).select()"
              />
              <button class="btn copy-btn" @click="copyUrl">
                {{ copied ? "Copied" : "Copy" }}
              </button>
            </div>
            <div class="muted url-hint">
              Open this link on the viewer device (must be on the same network).
            </div>
          </div>

          <div class="field">
            <label class="label" for="answer-token">Viewer response</label>
            <textarea
              id="answer-token"
              v-model="answerToken"
              class="input response"
              rows="3"
              placeholder="Paste the token from the viewer device here"
            />
            <button class="btn btn-primary" @click="connect" :disabled="!answerToken.trim()">
              Connect
            </button>
          </div>
        </template>

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

/* ── Fields (manual fallback) ── */
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

.response {
  min-height: 80px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.url-hint { font-size: var(--text-xs); }

/* ── Warning banner ── */
.warn {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-warning-strong, #92400e);
  background: var(--color-warning-soft, #fef3c7);
  border: 1px solid var(--color-warning-border, #fde68a);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  line-height: 1.45;
}

.warn svg { flex-shrink: 0; margin-top: 1px; }

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
