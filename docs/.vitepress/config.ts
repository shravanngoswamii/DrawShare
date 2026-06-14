import { defineConfig } from "vitepress";

export default defineConfig({
  title: "DrawShare Docs",
  description: "Local-first collaborative whiteboard",
  base: "/DrawShare/docs/",

  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Use Cases", link: "/use-cases/" },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Live Sharing", link: "/guide/live-sharing" },
            { text: "Keyboard Shortcuts", link: "/guide/keyboard-shortcuts" },
            { text: "Data & Privacy", link: "/guide/data-privacy" },
            { text: "Self-Hosting", link: "/guide/self-hosting" },
          ],
        },
      ],
      "/use-cases/": [
        {
          text: "Use Cases",
          items: [
            { text: "Overview", link: "/use-cases/" },
            { text: "Teaching", link: "/use-cases/teaching" },
            { text: "Tutoring", link: "/use-cases/tutoring" },
            { text: "Brainstorming", link: "/use-cases/brainstorming" },
            { text: "Annotating Screenshots", link: "/use-cases/annotation" },
            { text: "Personal Note-Taking", link: "/use-cases/note-taking" },
          ],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: "https://github.com/shravanngoswamii/DrawShare" }],

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2024 Shravan Goswami",
    },

    editLink: {
      pattern: "https://github.com/shravanngoswamii/DrawShare/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});
