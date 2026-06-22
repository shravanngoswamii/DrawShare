<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useLiveStore } from "@/stores/live";

// `fab` shows a built-in floating button (used by the viewer). When false, the
// parent controls visibility via v-model:open and provides its own trigger
// (used by the host, whose corner is already crowded).
const props = withDefaults(defineProps<{ fab?: boolean; open?: boolean }>(), { fab: true });
const emit = defineEmits<{ "update:open": [boolean] }>();

const live = useLiveStore();

const internalOpen = ref(false);
const open = computed({
  get: () => (props.open !== undefined ? props.open : internalOpen.value),
  set: (v: boolean) => {
    internalOpen.value = v;
    emit("update:open", v);
  },
});
const full = ref(false);
const draft = ref("");
const listEl = ref<HTMLDivElement | null>(null);

function scrollToBottom() {
  nextTick(() => {
    const el = listEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function toggle() {
  open.value = !open.value;
  if (open.value) {
    live.markChatRead();
    scrollToBottom();
  }
}

function send() {
  const text = draft.value;
  if (!text.trim()) return;
  live.sendChat(text);
  draft.value = "";
  scrollToBottom();
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// New messages: keep the badge accurate and auto-scroll while open.
watch(
  () => live.chat.length,
  () => {
    if (open.value) {
      live.markChatRead();
      scrollToBottom();
    }
  },
);

// Opened (including by the parent in controlled mode): clear the badge, scroll.
watch(open, (isOpen) => {
  if (isOpen) {
    live.markChatRead();
    scrollToBottom();
  }
});
</script>

<template>
  <div class="chat-root">
    <button
      v-if="props.fab && !open"
      class="chat-fab"
      @click="toggle"
      :aria-label="live.unreadChat ? `Open chat, ${live.unreadChat} unread` : 'Open chat'"
      title="Chat"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <span v-if="live.unreadChat > 0" class="badge">{{ live.unreadChat > 99 ? "99+" : live.unreadChat }}</span>
    </button>

    <div v-if="open" class="chat-panel" :class="{ full }" role="dialog" aria-label="Chat">
      <header class="chat-head">
        <span class="chat-title">Chat</span>
        <div class="chat-head-actions">
          <button
            class="chat-icon-btn"
            @click="full = !full"
            :aria-label="full ? 'Exit fullscreen chat' : 'Fullscreen chat'"
            :title="full ? 'Exit fullscreen' : 'Fullscreen'"
          >
            <svg v-if="!full" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          </button>
          <button class="chat-icon-btn" @click="toggle" aria-label="Close chat" title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      <div class="chat-msgs" ref="listEl">
        <div v-if="!live.chat.length" class="chat-empty">No messages yet. Say hello!</div>
        <div v-for="m in live.chat" :key="m.id" class="chat-msg" :class="{ mine: m.mine }">
          <div v-if="!m.mine" class="chat-who">{{ m.fromName }}</div>
          <div class="chat-row">
            <div class="chat-bubble">{{ m.text }}</div>
            <span class="chat-time">{{ formatTime(m.ts) }}</span>
          </div>
        </div>
      </div>

      <form class="chat-composer" @submit.prevent="send">
        <input
          v-model="draft"
          class="input chat-input"
          type="text"
          :maxlength="2000"
          placeholder="Type a message"
          aria-label="Message"
          autocomplete="off"
        />
        <button class="btn btn-primary chat-send" type="submit" :disabled="!draft.trim()">
          Send
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.chat-fab {
  position: fixed;
  right: calc(var(--space-4) + var(--safe-right));
  bottom: calc(var(--space-4) + var(--safe-bottom));
  z-index: 40;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-pill);
  background: var(--color-accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-lg);
  border: none;
}

.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--color-danger);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  border: 2px solid var(--color-surface);
}

.chat-panel {
  position: fixed;
  right: calc(var(--space-4) + var(--safe-right));
  bottom: calc(var(--space-4) + var(--safe-bottom));
  z-index: 60;
  width: 340px;
  max-width: calc(100vw - var(--space-4) * 2);
  height: min(70vh, 520px);
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: chat-in 160ms ease;
}

.chat-panel.full {
  inset: var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left);
  right: var(--safe-right);
  bottom: var(--safe-bottom);
  width: auto;
  height: auto;
  max-width: none;
  border-radius: 0;
}

@keyframes chat-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.chat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.chat-title {
  font-size: var(--text-md);
  font-weight: 600;
}

.chat-head-actions {
  display: flex;
  gap: var(--space-1);
}

.chat-icon-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  border: none;
}
.chat-icon-btn:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.chat-msgs {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.chat-empty {
  margin: auto;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.chat-msg {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 85%;
  align-self: flex-start;
}
.chat-msg.mine {
  align-self: flex-end;
  align-items: flex-end;
}

.chat-who {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  padding: 0 var(--space-2);
}

.chat-row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
}
.chat-msg.mine .chat-row {
  flex-direction: row-reverse;
}

.chat-bubble {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-lg);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  font-size: var(--text-sm);
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.chat-msg.mine .chat-bubble {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}

.chat-time {
  font-size: 10px;
  color: var(--color-text-subtle);
  flex-shrink: 0;
}

.chat-composer {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.chat-input {
  flex: 1;
  min-width: 0;
}

.chat-send {
  flex-shrink: 0;
}

@media (max-width: 767px) {
  .chat-panel:not(.full) {
    right: var(--space-2);
    left: var(--space-2);
    bottom: calc(var(--space-2) + var(--safe-bottom));
    width: auto;
    max-width: none;
    height: min(70vh, 460px);
  }
}
</style>
