<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

interface Entry {
  time: string;
  type: "log" | "warn" | "error";
  text: string;
}

const logs = ref<Entry[]>([]);
const collapsed = ref(false);
const copied = ref(false);
const MAX = 300;

const orig = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

function fmt(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

function add(type: Entry["type"], args: unknown[]) {
  const d = new Date();
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
  logs.value.push({ time, type, text: fmt(args) });
  if (logs.value.length > MAX) logs.value.shift();
}

function clear() {
  logs.value = [];
}

async function copy() {
  const text = logs.value.map((l) => `[${l.time}] ${l.text}`).join("\n");
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      /* ignore */
    }
    ta.remove();
  }
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}

onMounted(() => {
  console.log = (...a: unknown[]) => {
    orig.log(...a);
    add("log", a);
  };
  console.warn = (...a: unknown[]) => {
    orig.warn(...a);
    add("warn", a);
  };
  console.error = (...a: unknown[]) => {
    orig.error(...a);
    add("error", a);
  };
  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onRejection);
});

function onWindowError(e: ErrorEvent) {
  add("error", [`${e.message} @ ${e.filename}:${e.lineno}`]);
}
function onRejection(e: PromiseRejectionEvent) {
  add("error", [`Unhandled rejection: ${String(e.reason)}`]);
}

onBeforeUnmount(() => {
  console.log = orig.log;
  console.warn = orig.warn;
  console.error = orig.error;
  window.removeEventListener("error", onWindowError);
  window.removeEventListener("unhandledrejection", onRejection);
});
</script>

<template>
  <div class="dbg" :class="{ collapsed }">
    <div class="bar">
      <span class="title">terminal · {{ logs.length }}</span>
      <div class="actions">
        <button @click="copy">{{ copied ? "copied" : "copy" }}</button>
        <button @click="clear">clear</button>
        <button @click="collapsed = !collapsed">{{ collapsed ? "show" : "hide" }}</button>
      </div>
    </div>
    <div v-show="!collapsed" class="body">
      <div v-for="(l, i) in logs" :key="i" class="row" :class="l.type">
        <span class="t">{{ l.time }}</span><span class="m">{{ l.text }}</span>
      </div>
      <div v-if="logs.length === 0" class="empty">waiting for logs…</div>
    </div>
  </div>
</template>

<style scoped>
.dbg {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  max-height: 38vh;
  background: rgba(10, 14, 22, 0.96);
  color: #c8f7c8;
  font: 11px/1.4 ui-monospace, Menlo, monospace;
  border-top: 1px solid #1f6f3f;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4);
}
.dbg.collapsed {
  max-height: none;
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: rgba(20, 50, 30, 0.6);
  flex-shrink: 0;
}
.title {
  color: #7ee787;
  font-weight: 600;
}
.actions {
  display: flex;
  gap: 6px;
}
.actions button {
  background: rgba(126, 231, 135, 0.15);
  border: 1px solid #2f7f4f;
  color: #aef0ae;
  padding: 4px 10px;
  border-radius: 4px;
  font: inherit;
  cursor: pointer;
}
.actions button:active {
  background: rgba(126, 231, 135, 0.3);
}
.body {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 6px 8px;
}
.row {
  display: flex;
  gap: 8px;
  padding: 1px 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.row.warn .m {
  color: #ffd27a;
}
.row.error .m {
  color: #ff8a8a;
}
.t {
  color: #5a7a5a;
  flex-shrink: 0;
}
.m {
  flex: 1;
}
.empty {
  color: #5a7a5a;
  padding: 8px;
}
</style>
