<template>
  <main class="privacy">
    <div class="doc">
      <header class="doc-head">
        <RouterLink class="home" :to="{ name: 'landing' }">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
          </svg>
          DrawShare
        </RouterLink>
        <h1>Privacy Policy</h1>
        <p class="updated">Last updated 18 June 2026</p>
      </header>

      <section class="lead">
        <p>
          DrawShare is a local-first whiteboard. Your drawings live on your own device, and
          nothing is uploaded anywhere unless you choose to — by starting a live session,
          publishing a snapshot link, or turning on cloud backup. There are no accounts, no
          tracking, and no advertising.
        </p>
      </section>

      <h2>What we store, and where</h2>
      <p>
        Everything you create — projects, pages, strokes, shapes, images, text, and your
        settings such as the theme — is stored locally in your browser (IndexedDB and
        localStorage) on the device you use. It never leaves your device on its own. DrawShare
        has no server and no database, so we cannot see your boards.
      </p>

      <h2>No accounts, tracking, or cookies</h2>
      <p>
        DrawShare does not ask you to sign up, does not use cookies, and runs no analytics,
        fingerprinting, or third-party trackers. We do not collect personal information.
      </p>

      <h2>Hosting and fonts</h2>
      <p>
        The app is served as static files from GitHub Pages. Like any website, the host
        receives standard request information (such as your IP address and browser) in its
        logs. The interface fonts are loaded from Google Fonts, so your browser makes a request
        to Google when the page loads; this is governed by Google's privacy policy.
      </p>

      <h2>Live sessions (optional)</h2>
      <p>
        When you host or join a live session, your device connects over a secure WebSocket to a
        relay server we run on Cloudflare. The relay simply passes strokes between the host and
        the viewers for the duration of the session — it is keyed only by your session code, it
        does not store your drawing, and nothing is written to a database. As with any network
        connection, the relay sees your IP address (handled by Cloudflare); we do not log or
        retain it. When the session ends, nothing about it remains on the server.
      </p>

      <h2>QR codes (optional)</h2>
      <p>
        If you open the QR code in the share dialog, the join link (which contains the session
        code) is sent to a third-party image service (api.qrserver.com) to render the QR image.
        If you'd rather not, just share the code or link directly instead.
      </p>

      <h2>Snapshot links (optional)</h2>
      <p>
        Publishing a page as a snapshot encodes the whole page into the link itself (in the part
        after the <code>#</code>), which browsers never send to a server. The data rides inside
        the URL, so anyone you give the link to can open that snapshot — share it only with
        people you trust.
      </p>

      <h2>Your control over your data</h2>
      <p>
        You can export your projects as a JSON file, import them back, and delete projects at
        any time (deleted projects sit in Trash for 30 days, then go for good). Clearing your
        browser's site data for DrawShare removes everything stored locally.
      </p>

      <h2>Children</h2>
      <p>
        DrawShare is a general-purpose drawing tool and is not directed at children, and we do
        not knowingly collect any personal information from anyone.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes, the "last updated" date above will change. Since DrawShare is
        open source, the full history is visible in the repository.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or concerns? Open an issue on
        <a href="https://github.com/shravanngoswamii/DrawShare/issues" target="_blank" rel="noopener noreferrer">GitHub</a>.
      </p>
    </div>
  </main>
</template>

<style scoped>
.privacy {
  /* html/body/#app are overflow:hidden app-wide, so this view scrolls itself. */
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  background: var(--color-bg);
  color: var(--color-text);
  padding: clamp(28px, 6vw, 72px) var(--space-5) 96px;
}
.doc {
  max-width: 720px;
  margin: 0 auto;
}
.doc-head {
  margin-bottom: var(--space-8);
}
.home {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: var(--space-6);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: color 80ms ease;
}
.home:hover {
  color: var(--color-text);
}
h1 {
  margin: 0;
  font-family: "Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(2rem, 5vw, 2.6rem);
  font-weight: 700;
  letter-spacing: -0.02em;
}
.updated {
  margin: var(--space-2) 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-subtle);
}
.lead p {
  font-size: var(--text-lg);
  line-height: 1.65;
  color: var(--color-text);
}
h2 {
  margin: var(--space-8) 0 var(--space-2);
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: -0.01em;
}
p {
  margin: 0 0 var(--space-3);
  font-size: var(--text-md);
  line-height: 1.7;
  color: var(--color-text-muted);
}
code {
  font-family: var(--font-mono);
  font-size: 0.9em;
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
}
a {
  color: var(--color-accent);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
strong {
  color: var(--color-text);
}
</style>
