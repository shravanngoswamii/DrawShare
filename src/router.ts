import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "landing",
    component: () => import("./views/LandingView.vue"),
  },
  {
    path: "/app",
    name: "app",
    component: () => import("./views/ProjectsView.vue"),
  },
  {
    // Keep the old root path as a redirect for any bookmarks / deep links
    path: "/projects",
    redirect: { name: "app" },
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
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
