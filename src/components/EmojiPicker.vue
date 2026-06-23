<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useTheme } from "@/composables/useTheme";

// Thin wrapper around emoji-mart's framework-agnostic picker. Data is bundled
// (no CDN fetch), loaded lazily so it doesn't weigh on first paint.
const emit = defineEmits<{ select: [string] }>();
const { isDark } = useTheme();

const host = ref<HTMLDivElement | null>(null);
let pickerEl: HTMLElement | undefined;

onMounted(async () => {
  const [{ Picker }, dataMod] = await Promise.all([
    import("emoji-mart"),
    import("@emoji-mart/data"),
  ]);
  const picker = new Picker({
    data: dataMod.default,
    theme: isDark.value ? "dark" : "light",
    previewPosition: "none",
    skinTonePosition: "search",
    navPosition: "top",
    maxFrequentRows: 2,
    onEmojiSelect: (e: { native?: string }) => {
      if (e.native) emit("select", e.native);
    },
  });
  pickerEl = picker as unknown as HTMLElement;
  if (host.value) host.value.appendChild(pickerEl);
  else pickerEl.remove();
  // Hide the scrollbar inside emoji-mart's shadow DOM (outer CSS can't reach it).
  const root = (pickerEl as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
  if (root) {
    const style = document.createElement("style");
    style.textContent = ".scroll{scrollbar-width:none}.scroll::-webkit-scrollbar{display:none}";
    root.appendChild(style);
  }
});

onBeforeUnmount(() => {
  pickerEl?.remove();
  pickerEl = undefined;
});
</script>

<template>
  <div ref="host" class="emoji-host"></div>
</template>

<style scoped>
.emoji-host {
  display: flex;
}
.emoji-host :deep(em-emoji-picker) {
  width: 100%;
  height: 300px;
  --shadow: none;
  --border-radius: 0;
}
</style>
