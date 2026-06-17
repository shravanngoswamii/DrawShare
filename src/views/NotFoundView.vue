<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

function goHome() {
  router.push({ name: "landing" });
}
function openApp() {
  router.push({ name: "projects" });
}
</script>

<template>
  <main class="nf">
    <div class="nf-inner">
      <div class="nf-art" aria-hidden="true">
        <span class="nf-code">404</span>
        <!-- Hand-drawn eraser swipe — the page got rubbed out. -->
        <svg class="nf-scribble" width="340" height="40" viewBox="0 0 340 40" fill="none" aria-hidden="true">
          <path
            d="M8 27C58 9 104 35 150 21c46-14 92 12 138-3 14-4.6 30-6 38-2"
            stroke="#FF3B30"
            stroke-width="5"
            stroke-linecap="round"
          />
        </svg>
      </div>
      <h1 class="nf-title">This page got erased</h1>
      <p class="nf-sub">
        The link you followed doesn't lead anywhere on the board. Nothing's lost —
        let's get you back to a blank canvas.
      </p>
      <div class="nf-actions">
        <button class="btn btn-primary nf-btn" @click="goHome">Back to home</button>
        <button class="btn btn-ghost nf-btn" @click="openApp">Open the app</button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.nf {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background-color: var(--color-bg);
  /* Dotted-paper texture, same as the app's canvas backgrounds. */
  background-image: radial-gradient(var(--color-border) 1px, transparent 1px);
  background-size: 22px 22px;
}
.nf-inner {
  max-width: 30rem;
  text-align: center;
}
.nf-art {
  position: relative;
  display: inline-block;
  margin-bottom: var(--space-6);
}
.nf-code {
  font-family: "Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif;
  font-weight: 800;
  letter-spacing: -0.04em;
  font-size: clamp(5.5rem, 22vw, 9rem);
  line-height: 0.9;
  color: var(--color-text);
}
.nf-scribble {
  position: absolute;
  left: 50%;
  bottom: -6px;
  transform: translateX(-50%);
  width: clamp(180px, 60%, 300px);
  height: auto;
  overflow: visible;
}
.nf-scribble path {
  stroke-dasharray: 700;
  stroke-dashoffset: 700;
  animation: nf-draw 900ms 220ms cubic-bezier(0.65, 0, 0.35, 1) forwards;
}
@keyframes nf-draw {
  to {
    stroke-dashoffset: 0;
  }
}
.nf-title {
  margin: 0 0 var(--space-3);
  font-family: "Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-size: clamp(1.5rem, 4vw, 2rem);
  color: var(--color-text);
}
.nf-sub {
  margin: 0 auto var(--space-6);
  max-width: 26rem;
  font-size: var(--text-md);
  line-height: 1.6;
  color: var(--color-text-muted);
}
.nf-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-3);
}
.nf-btn {
  padding: 10px 22px;
  font-size: var(--text-md);
}

@media (prefers-reduced-motion: reduce) {
  .nf-scribble path {
    animation: none;
    stroke-dashoffset: 0;
  }
}
</style>
