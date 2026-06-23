<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { fileToSyncSrc } from "@/core/imageSync";
import { useLiveStore } from "@/stores/live";

// Lazy-load the emoji picker (and its data) only when first opened.
const EmojiPicker = defineAsyncComponent(() => import("@/components/EmojiPicker.vue"));
// Lightbox is only needed once an image is opened.
const ImageLightbox = defineAsyncComponent(() => import("@/components/ImageLightbox.vue"));

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

// `fab` shows a built-in floating button (used by the viewer). When false, the
// parent controls visibility via v-model:open and provides its own trigger
// (used by the host, whose corner is already crowded).
const props = withDefaults(defineProps<{ fab?: boolean; open?: boolean }>(), { fab: true });
const emit = defineEmits<{ "update:open": [boolean] }>();

const live = useLiveStore();

// With a built-in FAB (viewer) the component owns its open state; otherwise the
// parent controls it via v-model:open (host). We can't use `props.open` to tell
// the modes apart — Vue casts an absent boolean prop to `false`, not undefined —
// so the `fab` prop is the discriminator.
const internalOpen = ref(false);
const open = computed({
  get: () => (props.fab ? internalOpen.value : props.open),
  set: (v: boolean) => {
    if (props.fab) internalOpen.value = v;
    else emit("update:open", v);
  },
});
const full = ref(false);
const draft = ref("");
const listEl = ref<HTMLDivElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);

// Reply / edit composer state.
const replyingTo = ref<{ id: string; fromName: string; text: string } | null>(null);
const editingId = ref<string | null>(null);

// Emoji picker (emoji-mart). Stays open so several can be added in a row.
const showEmoji = ref(false);
function insertEmoji(e: string) {
  draft.value += e;
}

// Sound on incoming messages while the panel is closed.
const muted = ref(false);
try {
  muted.value = localStorage.getItem("drawshare:chat-muted") === "1";
} catch {
  /* ignore */
}
function toggleMute() {
  muted.value = !muted.value;
  try {
    localStorage.setItem("drawshare:chat-muted", muted.value ? "1" : "0");
  } catch {
    /* ignore */
  }
}
let audioCtx: AudioContext | undefined;
function ensureCtx(): AudioContext | undefined {
  const Ctx =
    window.AudioContext ||
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return undefined;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}
// Browsers start an AudioContext "suspended" until a user gesture; if we only
// create it later (when a message arrives) it never plays. Resume it on the
// first interaction so the incoming chime works afterwards.
function unlockAudio() {
  const ctx = ensureCtx();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}
function playBeep() {
  try {
    const ctx = ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 680;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.start(t);
    osc.stop(t + 0.26);
  } catch {
    /* sound is best-effort */
  }
}

// Browser (system) notifications via the native Web Notifications API.
function requestNotifyPermission() {
  try {
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch {
    /* not supported */
  }
}
type Incoming = { fromName: string; text: string; image?: string };
const bodyOf = (m: Incoming) => m.text || (m.image ? "📷 Photo" : "");

// New chat while the panel is closed: a system notification reaches you when the
// tab is in the background; an in-app Notiflix toast catches you when the tab is
// open but the chat is collapsed. Both are clickable to open the chat.
function notify(m: Incoming) {
  if (document.hidden || !document.hasFocus()) notifySystem(m);
  else void toast(m);
}
function notifySystem(m: Incoming) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const n = new Notification(`${m.fromName} · DrawShare`, {
      body: bodyOf(m),
      tag: "drawshare-chat",
    });
    n.onclick = () => {
      window.focus();
      open.value = true;
      n.close();
    };
  } catch {
    /* best-effort */
  }
}
let notifyLib: typeof import("notiflix") | undefined;
async function toast(m: Incoming) {
  try {
    if (!notifyLib) {
      notifyLib = await import("notiflix");
      notifyLib.Notify.init({
        position: "right-top",
        distance: "16px",
        borderRadius: "10px",
        fontFamily: "inherit",
        useIcon: false,
        clickToClose: true,
        cssAnimationStyle: "from-right",
      });
    }
    // Read the theme accent per-call so toasts track light/dark theme switches.
    const cs = getComputedStyle(document.documentElement);
    const background = cs.getPropertyValue("--color-accent").trim() || "#2563eb";
    const textColor = cs.getPropertyValue("--color-accent-text").trim() || "#ffffff";
    notifyLib.Notify.info(
      `${m.fromName}: ${bodyOf(m)}`,
      () => {
        open.value = true;
      },
      { info: { background, textColor, notiflixIconColor: textColor } },
    );
  } catch {
    /* best-effort */
  }
}

// "Seen by …" under the most recent message you sent.
const seenInfo = computed(() => {
  let lastMine: (typeof live.chat)[number] | undefined;
  for (let i = live.chat.length - 1; i >= 0; i--) {
    if (live.chat[i].mine) {
      lastMine = live.chat[i];
      break;
    }
  }
  if (!lastMine) return null;
  const names = Object.values(live.chatSeen)
    .filter((s) => s.ts >= (lastMine as { ts: number }).ts)
    .map((s) => s.name);
  return names.length ? { id: lastMine.id, names } : null;
});

function startReply(m: { id: string; fromName: string; text: string; image?: string }) {
  replyingTo.value = {
    id: m.id,
    fromName: m.fromName,
    text: m.text || (m.image ? "📷 image" : ""),
  };
  editingId.value = null;
  closePopovers();
  inputEl.value?.focus();
}
function startEdit(m: { id: string; text: string }) {
  editingId.value = m.id;
  replyingTo.value = null;
  closePopovers();
  draft.value = m.text;
  nextTick(() => inputEl.value?.focus());
}
function cancelCompose() {
  replyingTo.value = null;
  editingId.value = null;
  draft.value = "";
}

// ── Image lightbox ──
const lightboxSrc = ref<string | null>(null);

// ── Reactions ──
type ChatMsg = (typeof live.chat)[number];
// Message id whose quick-reaction bar is open; the full picker targets reactPickerFor.
const quickReactFor = ref<string | null>(null);
const reactPickerFor = ref<string | null>(null);

function openReactions(id: string) {
  quickReactFor.value = quickReactFor.value === id ? null : id;
  reactPickerFor.value = null;
  if (quickReactFor.value) {
    nextTick(() => {
      listEl.value
        ?.querySelector<HTMLElement>(`[data-mid="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }
}
function react(id: string, emoji: string) {
  live.toggleReaction(id, emoji);
  quickReactFor.value = null;
  reactPickerFor.value = null;
}
function onReactPick(emoji: string) {
  if (reactPickerFor.value) react(reactPickerFor.value, emoji);
}
function reactionList(m: ChatMsg): { emoji: string; count: number; mine: boolean }[] {
  if (!m.reactions) return [];
  return Object.entries(m.reactions).map(([emoji, ids]) => ({
    emoji,
    count: ids.length,
    mine: ids.includes(live.myChatId),
  }));
}

// ── Swipe-to-reply + long-press-to-react (touch) ──
const SWIPE_TRIGGER = 56;
const swipeId = ref<string | null>(null);
const swipeDx = ref(0);
let swipeStartX = 0;
let swipeStartY = 0;
let swiping = false;
let longPressTimer: ReturnType<typeof setTimeout> | undefined;

function clearLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = undefined;
  }
}
function onRowPointerDown(e: PointerEvent, m: ChatMsg) {
  if (e.pointerType === "mouse") return; // desktop uses hover actions
  swipeStartX = e.clientX;
  swipeStartY = e.clientY;
  swiping = true;
  swipeId.value = m.id;
  swipeDx.value = 0;
  clearLongPress();
  longPressTimer = setTimeout(() => {
    swiping = false;
    swipeId.value = null;
    swipeDx.value = 0;
    openReactions(m.id);
  }, 450);
}
function onRowPointerMove(e: PointerEvent) {
  if (!swiping || swipeId.value === null) return;
  const dx = e.clientX - swipeStartX;
  const dy = e.clientY - swipeStartY;
  if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearLongPress();
  if (Math.abs(dy) > Math.abs(dx)) {
    // Vertical: let the list scroll, abandon the swipe.
    swiping = false;
    swipeId.value = null;
    swipeDx.value = 0;
    return;
  }
  swipeDx.value = Math.max(0, Math.min(dx, 80));
}
function onRowPointerUp(m: ChatMsg) {
  clearLongPress();
  if (swiping && swipeDx.value >= SWIPE_TRIGGER) startReply(m);
  swiping = false;
  swipeId.value = null;
  swipeDx.value = 0;
}

function closePopovers() {
  quickReactFor.value = null;
  reactPickerFor.value = null;
}
function onDocPointerDown(e: PointerEvent) {
  const t = e.target as HTMLElement;
  if (t.closest(".chat-quickreact, .chat-react-picker, .chat-act")) return;
  closePopovers();
}
watch(
  () => quickReactFor.value ?? reactPickerFor.value,
  (anyOpen) => {
    if (anyOpen) document.addEventListener("pointerdown", onDocPointerDown, true);
    else document.removeEventListener("pointerdown", onDocPointerDown, true);
  },
);

// Clicking a reply preview jumps to the original message and flashes it.
const highlightedId = ref<string | null>(null);
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
function jumpToMessage(id: string) {
  const el = listEl.value?.querySelector<HTMLElement>(`[data-mid="${CSS.escape(id)}"]`);
  if (!el) return; // message scrolled out of the kept history
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  highlightedId.value = id;
  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    highlightedId.value = null;
  }, 1400);
}

const editingName = ref(false);
const nameDraft = ref("");
const nameInput = ref<HTMLInputElement | null>(null);
function startEditName() {
  nameDraft.value = live.myName;
  editingName.value = true;
  nextTick(() => nameInput.value?.focus());
}
function saveName() {
  if (!editingName.value) return;
  if (nameDraft.value.trim()) live.setMyName(nameDraft.value);
  editingName.value = false;
}

function scrollToBottom() {
  nextTick(() => {
    const el = listEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function toggle() {
  unlockAudio();
  open.value = !open.value;
  if (open.value) {
    live.markChatRead();
    scrollToBottom();
  }
}

function send() {
  unlockAudio();
  const text = draft.value;
  if (!text.trim()) return;
  if (editingId.value) {
    live.editChat(editingId.value, text);
    editingId.value = null;
    draft.value = "";
    return;
  }
  live.sendChat(text, undefined, replyingTo.value ?? undefined);
  draft.value = "";
  replyingTo.value = null;
  showEmoji.value = false;
  scrollToBottom();
}

const fileInput = ref<HTMLInputElement | null>(null);
function pickImage() {
  fileInput.value?.click();
}
async function onImageFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const src = await fileToSyncSrc(file).catch(() => null);
  if (!src) return;
  live.sendChat(draft.value, src, replyingTo.value ?? undefined); // typed text = caption
  draft.value = "";
  replyingTo.value = null;
  showEmoji.value = false;
  scrollToBottom();
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// New messages: keep the badge accurate and auto-scroll while open; otherwise
// chime (unless muted) for an incoming message.
watch(
  () => live.chat.length,
  (len, prev) => {
    if (open.value) {
      live.markChatRead();
      scrollToBottom();
      return;
    }
    const last = live.chat[live.chat.length - 1];
    if (len > prev && last && !last.mine && !muted.value) {
      playBeep();
      notify(last);
    }
  },
);

// Opened (including by the parent in controlled mode): clear the badge, scroll,
// and ask for notification permission (this is a user gesture).
watch(open, (isOpen) => {
  if (isOpen) {
    live.markChatRead();
    scrollToBottom();
    requestNotifyPermission();
  } else {
    showEmoji.value = false;
  }
});

// Esc closes any open popover first, then the panel (desktop).
function onKeydown(e: KeyboardEvent) {
  if (e.key !== "Escape" || !open.value) return;
  if (quickReactFor.value || reactPickerFor.value) {
    closePopovers();
    e.stopPropagation();
  } else if (showEmoji.value) {
    showEmoji.value = false;
    e.stopPropagation();
  }
}
watch(
  open,
  (isOpen) => {
    if (isOpen) window.addEventListener("keydown", onKeydown, true);
    else window.removeEventListener("keydown", onKeydown, true);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown, true);
  document.removeEventListener("pointerdown", onDocPointerDown, true);
});

// Resume audio on the first interaction so the incoming-message chime can play.
onMounted(() => {
  window.addEventListener("pointerdown", unlockAudio, { once: true });
  window.addEventListener("keydown", unlockAudio, { once: true });
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
            @click="toggleMute"
            :aria-label="muted ? 'Unmute chat sound' : 'Mute chat sound'"
            :title="muted ? 'Unmute sound' : 'Mute sound'"
          >
            <svg v-if="!muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/>
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H2v6h4l5 4z"/><path d="m23 9-6 6"/><path d="m17 9 6 6"/>
            </svg>
          </button>
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

      <div class="chat-name-row">
        <span class="chat-name-label">You:</span>
        <button v-if="!editingName" class="chat-name" @click="startEditName" title="Change your name">
          <span>{{ live.myName }}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
        </button>
        <input
          v-else
          ref="nameInput"
          class="input chat-name-input"
          v-model="nameDraft"
          :maxlength="40"
          @keydown.enter="saveName"
          @blur="saveName"
          aria-label="Your name"
        />
      </div>

      <div class="chat-msgs" ref="listEl">
        <div v-if="!live.chat.length" class="chat-empty">No messages yet. Say hello!</div>
        <template v-for="m in live.chat" :key="m.id">
          <div
            class="chat-msg"
            :class="{ mine: m.mine, highlight: m.id === highlightedId }"
            :data-mid="m.id"
          >
            <div v-if="!m.mine" class="chat-who">{{ m.fromName }}</div>
            <div v-if="quickReactFor === m.id" class="chat-quickreact" @pointerdown.stop>
              <button
                v-for="e in QUICK_REACTIONS"
                :key="e"
                class="chat-qr"
                @click="react(m.id, e)"
              >{{ e }}</button>
              <button
                class="chat-qr chat-qr-more"
                @click="reactPickerFor = m.id; quickReactFor = null"
                aria-label="More emoji"
                title="More"
              >+</button>
            </div>
            <div
              class="chat-row"
              @pointerdown="onRowPointerDown($event, m)"
              @pointermove="onRowPointerMove"
              @pointerup="onRowPointerUp(m)"
              @pointercancel="onRowPointerUp(m)"
            >
              <span
                class="chat-swipe-hint"
                :class="{ active: swipeId === m.id && swipeDx > 0, ready: swipeId === m.id && swipeDx >= SWIPE_TRIGGER }"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
              </span>
              <div
                class="chat-swipe"
                :style="swipeId === m.id ? { transform: `translateX(${swipeDx}px)` } : undefined"
              >
                <div class="chat-bubble" :class="{ 'has-image': m.image }">
                  <button
                    v-if="m.replyTo"
                    type="button"
                    class="chat-quote"
                    @click="jumpToMessage(m.replyTo.id)"
                    title="Go to replied message"
                  >
                    <span class="chat-quote-name">{{ m.replyTo.fromName }}</span>
                    <span class="chat-quote-text">{{ m.replyTo.text }}</span>
                  </button>
                  <img
                    v-if="m.image"
                    :src="m.image"
                    class="chat-img"
                    alt="shared image"
                    loading="lazy"
                    @click="lightboxSrc = m.image ?? null"
                  />
                  <span v-if="m.text" class="chat-text">{{ m.text }}</span>
                  <span v-if="m.editedTs" class="chat-edited">edited</span>
                </div>
                <div v-if="reactionList(m).length" class="chat-reactions">
                  <button
                    v-for="r in reactionList(m)"
                    :key="r.emoji"
                    class="chat-reaction"
                    :class="{ mine: r.mine }"
                    @click="react(m.id, r.emoji)"
                  >
                    <span>{{ r.emoji }}</span><span class="chat-reaction-n">{{ r.count }}</span>
                  </button>
                </div>
              </div>
              <div class="chat-actions">
                <button class="chat-act" @click="openReactions(m.id)" title="React" aria-label="React">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                </button>
                <button class="chat-act" @click="startReply(m)" title="Reply" aria-label="Reply">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                </button>
                <button v-if="m.mine && !m.image" class="chat-act" @click="startEdit(m)" title="Edit" aria-label="Edit">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                </button>
              </div>
              <span class="chat-time">{{ formatTime(m.ts) }}</span>
            </div>
          </div>
          <div v-if="seenInfo && seenInfo.id === m.id" class="chat-seen">
            Seen by {{ seenInfo.names.join(", ") }}
          </div>
        </template>
      </div>

      <!-- Reply / edit context -->
      <div v-if="replyingTo || editingId" class="chat-compose-ctx">
        <div class="ctx-text">
          <template v-if="editingId">Editing message</template>
          <template v-else-if="replyingTo">
            Replying to <strong>{{ replyingTo.fromName }}</strong>: {{ replyingTo.text }}
          </template>
        </div>
        <button class="chat-icon-btn ctx-cancel" @click="cancelCompose" aria-label="Cancel" title="Cancel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <!-- Emoji picker (composer, or choosing a reaction for a message) -->
      <EmojiPicker v-if="showEmoji" class="chat-emoji" @select="insertEmoji" />
      <div v-else-if="reactPickerFor" class="chat-react-picker">
        <div class="chat-react-picker-head">
          <span>Pick a reaction</span>
          <button class="chat-icon-btn" @click="closePopovers" aria-label="Cancel" title="Cancel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <EmojiPicker class="chat-emoji" @select="onReactPick" />
      </div>

      <form class="chat-composer" @submit.prevent="send">
        <button
          type="button"
          class="chat-icon-btn chat-emoji-btn"
          :class="{ active: showEmoji }"
          @click="showEmoji = !showEmoji"
          aria-label="Emoji"
          title="Emoji"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
        </button>
        <button
          v-if="!editingId"
          type="button"
          class="chat-icon-btn chat-attach"
          @click="pickImage"
          aria-label="Attach image"
          title="Attach image"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/>
            <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>
          </svg>
        </button>
        <input
          ref="inputEl"
          v-model="draft"
          class="input chat-input"
          type="text"
          :maxlength="2000"
          :placeholder="editingId ? 'Edit message' : 'Type a message'"
          aria-label="Message"
          autocomplete="off"
        />
        <button class="btn btn-primary chat-send" type="submit" :disabled="!draft.trim()">
          {{ editingId ? "Save" : "Send" }}
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="chat-file"
          @change="onImageFile"
          aria-hidden="true"
          tabindex="-1"
        />
      </form>
    </div>

    <ImageLightbox v-if="lightboxSrc" :src="lightboxSrc" @close="lightboxSrc = null" />
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
  color: var(--color-accent-text);
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

.chat-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  font-size: var(--text-xs);
  flex-shrink: 0;
}

.chat-name-label {
  color: var(--color-text-muted);
}

.chat-name {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-weight: 600;
}
.chat-name:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.chat-name svg {
  opacity: 0.6;
}

.chat-name-input {
  height: 26px;
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
}

.chat-msgs {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  scrollbar-width: none;
}
.chat-msgs::-webkit-scrollbar {
  display: none;
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
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  /* Let vertical drags scroll the list while we handle horizontal swipe-to-reply. */
  touch-action: pan-y;
}
.chat-msg.mine .chat-row {
  flex-direction: row-reverse;
}

/* Swipe-to-reply: the bubble slides, an arrow is revealed behind its left edge. */
.chat-swipe {
  min-width: 0;
  transition: transform 120ms ease;
}
.chat-swipe-hint {
  position: absolute;
  left: -2px;
  bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-3, var(--color-surface-2));
  color: var(--color-text-muted);
  opacity: 0;
  transition: opacity 120ms ease;
  pointer-events: none;
}
.chat-swipe-hint.active {
  opacity: 0.55;
}
.chat-swipe-hint.ready {
  opacity: 1;
  color: var(--color-accent);
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
.chat-bubble.has-image {
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.chat-img {
  display: block;
  max-width: 220px;
  max-height: 220px;
  width: auto;
  height: auto;
  border-radius: var(--radius-md);
  cursor: zoom-in;
}
.chat-bubble.has-image .chat-text {
  padding: 0 var(--space-2) 2px;
}
.chat-msg.mine .chat-bubble {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-accent-text);
}

.chat-time {
  font-size: 10px;
  color: var(--color-text-subtle);
  flex-shrink: 0;
}

.chat-quote {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  text-align: left;
  padding: 2px var(--space-2);
  margin-bottom: 4px;
  border: none;
  border-left: 3px solid var(--color-accent);
  background: var(--color-surface-3, rgba(127, 127, 127, 0.1));
  border-radius: 4px;
  font-size: var(--text-xs);
  opacity: 0.9;
  cursor: pointer;
}
.chat-quote:hover {
  opacity: 1;
}

/* Flash the target message when reached from a reply preview. */
.chat-msg.highlight .chat-bubble {
  animation: chat-flash 1.4s ease;
}
@keyframes chat-flash {
  0%,
  60% {
    box-shadow: 0 0 0 2px var(--color-accent);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}
.chat-msg.mine .chat-quote {
  border-left-color: var(--color-accent-text);
}
.chat-quote-name {
  font-weight: 600;
}
.chat-quote-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.chat-edited {
  font-size: 10px;
  opacity: 0.6;
  margin-left: var(--space-2);
}

.chat-actions {
  display: none;
  gap: 2px;
  align-self: center;
}
.chat-row:hover .chat-actions {
  display: flex;
}
.chat-act {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm, 4px);
  color: var(--color-text-muted);
  background: transparent;
  border: none;
}
.chat-act:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

/* Reaction chips under a bubble. */
.chat-reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.chat-msg.mine .chat-reactions {
  justify-content: flex-end;
}
.chat-reaction {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 22px;
  padding: 0 7px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  font-size: var(--text-xs);
  line-height: 1;
  color: var(--color-text);
}
.chat-reaction.mine {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
}
.chat-reaction-n {
  font-weight: 600;
  color: var(--color-text-muted);
}
.chat-reaction.mine .chat-reaction-n {
  color: var(--color-accent);
}

/* Quick-reaction bar (long-press on touch, react button on desktop). */
.chat-quickreact {
  align-self: flex-start;
  display: flex;
  gap: 2px;
  margin-top: 4px;
  padding: 4px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-lg);
}
.chat-msg.mine .chat-quickreact {
  align-self: flex-end;
}
.chat-qr {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-pill);
  font-size: 18px;
  background: transparent;
  border: none;
}
.chat-qr:hover {
  background: var(--color-surface-2);
}
.chat-qr-more {
  font-size: 18px;
  color: var(--color-text-muted);
}

/* Reaction emoji picker, anchored above the composer so it is never clipped by
   the message list or hidden behind the input. */
.chat-react-picker {
  border-top: 1px solid var(--color-border);
}
.chat-react-picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.chat-react-picker .chat-emoji {
  border-top: 1px solid var(--color-border);
}

.chat-seen {
  align-self: flex-end;
  font-size: 10px;
  color: var(--color-text-subtle);
  padding: 0 var(--space-1) 2px;
}

.chat-compose-ctx {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-top: 1px solid var(--color-border);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.ctx-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-emoji {
  border-top: 1px solid var(--color-border);
}
.chat-emoji-btn.active {
  background: var(--color-surface-2);
  color: var(--color-accent);
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

.chat-attach {
  flex-shrink: 0;
}

.chat-send {
  flex-shrink: 0;
}

.chat-file {
  display: none;
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
