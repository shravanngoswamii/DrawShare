<script setup lang="ts">
import { RouterView } from "vue-router";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import IosBrowserHint from "@/components/IosBrowserHint.vue";
</script>

<template>
  <RouterView />
  <ConfirmDialog />
  <IosBrowserHint />
</template>
