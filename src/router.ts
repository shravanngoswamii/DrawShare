import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
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
