import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "landing",
    component: () => import("./views/LandingView.vue"),
  },
  {
    // Full boards grid — create, open, rename, back up. The landing page shows
    // only a few recent boards, so all-board management lives on its own route.
    path: "/projects",
    name: "projects",
    component: () => import("./views/ProjectsView.vue"),
  },
  {
    path: "/p/:id",
    name: "editor",
    component: () => import("./views/EditorView.vue"),
    props: true,
  },
  {
    // The live viewer reuses the editor view in guest mode (joins by code).
    path: "/v/:code",
    name: "viewer",
    component: () => import("./views/EditorView.vue"),
    props: true,
  },
  {
    path: "/s",
    name: "snapshot",
    component: () => import("./views/SnapshotView.vue"),
  },
  {
    path: "/privacy",
    name: "privacy",
    component: () => import("./views/PrivacyView.vue"),
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: () => import("./views/NotFoundView.vue"),
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  // Start each new route at the top; restore prior scroll on back/forward.
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 };
  },
});
