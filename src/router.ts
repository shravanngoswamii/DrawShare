import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

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
    path: "/v/:code",
    name: "viewer",
    component: () => import("./views/ViewerView.vue"),
    props: true,
  },
  {
    path: "/s",
    name: "snapshot",
    component: () => import("./views/SnapshotView.vue"),
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
