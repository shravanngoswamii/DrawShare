---
title: Self-Hosting
description: Build and deploy your own DrawShare instance to any static web host.
---

# Self-Hosting

DrawShare is a static Vite application. There is no backend, no database server, and no runtime process to manage. Any host that can serve static files will work.

## Building

```bash
npm run build
```

This runs `vue-tsc` (type checking) followed by `vite build`. The production output is written to `dist/`.

## Serving Locally

To preview the production build locally:

```bash
npm run preview
```

## Deployment Options

### GitHub Pages (Automated)

The repository includes a GitHub Actions workflow that builds and deploys to GitHub Pages automatically on every push to `main`.

If you fork the repository:

1. Go to **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Push any change to `main` — the workflow handles the rest.

### Netlify

1. Connect your repository to Netlify.
2. Set **Build command** to `npm run build`.
3. Set **Publish directory** to `dist`.
4. Deploy.

### Vercel

1. Import your repository in the Vercel dashboard.
2. Vercel auto-detects Vite. Confirm the **Output directory** is `dist`.
3. Deploy.

### nginx

Copy the `dist/` folder to your server and configure nginx to serve it:

```nginx
server {
    listen 80;
    server_name drawshare.example.com;

    root /var/www/drawshare/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

The `try_files` fallback ensures client-side routing works correctly.

## Sub-Path Deployments

If DrawShare will not be served from the root of a domain (e.g. `https://example.com/whiteboard/`), set the `BASE_PATH` environment variable before building:

```bash
BASE_PATH=/whiteboard/ npm run build
```

> The default `vite.config.ts` reads `process.env.BASE_PATH` and passes it to Vite's `base` option. Adjust this if you customise the config.

## Contributing

See [CONTRIBUTING.md](https://github.com/shravanngoswamii/DrawShare/blob/main/CONTRIBUTING.md) in the repository for guidelines on opening issues and submitting pull requests.
