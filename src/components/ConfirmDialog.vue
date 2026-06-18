<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { dialogState, settleDialog } from "@/composables/useDialog";

const confirmBtn = ref<HTMLButtonElement | null>(null);

// Focus the confirm button when the dialog opens (Enter then confirms).
watch(
  () => dialogState.open,
  (open) => {
    if (open) nextTick(() => confirmBtn.value?.focus());
  },
);

// Esc cancels. The dialog is mounted once for the app's life, so guard on open.
function onKeydown(e: KeyboardEvent) {
  if (dialogState.open && e.key === "Escape") settleDialog(false);
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div v-if="dialogState.open" class="dialog-backdrop" @click="settleDialog(false)">
    <div class="dialog" role="alertdialog" aria-modal="true" :aria-label="dialogState.title" @click.stop>
      <h2 class="dialog-title">{{ dialogState.title }}</h2>
      <p v-if="dialogState.message" class="dialog-message">{{ dialogState.message }}</p>
      <div class="dialog-actions">
        <button v-if="dialogState.cancelText" class="btn" @click="settleDialog(false)">
          {{ dialogState.cancelText }}
        </button>
        <button
          ref="confirmBtn"
          class="btn"
          :class="dialogState.danger ? 'btn-danger' : 'btn-primary'"
          @click="settleDialog(true)"
        >
          {{ dialogState.confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.dialog {
  width: min(400px, 100%);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--space-5);
}
.dialog-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--color-text);
}
.dialog-message {
  margin: var(--space-2) 0 0;
  font-size: var(--text-sm);
  line-height: 1.55;
  color: var(--color-text-muted);
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-5);
}
.btn-danger {
  background: var(--color-danger);
  color: #fff;
  border-color: var(--color-danger);
}
.btn-danger:hover:not(:disabled) {
  background: var(--color-danger-strong);
  border-color: var(--color-danger-strong);
}
</style>
