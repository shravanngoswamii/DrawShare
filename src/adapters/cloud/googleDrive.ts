// Google Drive backup provider — entirely client-side, no DrawShare backend.
// Uses Google Identity Services (GIS) for an OAuth token with the narrow
// `drive.appdata` scope, so DrawShare can only read/write its own hidden folder
// in the user's Drive — never their other files. One JSON file per project lives
// in that folder, tagged with appProperties (projectId / updatedAt / hash) so
// the sync engine can reconcile without downloading everything.
//
// The access token is cached in localStorage with its expiry, so reloads reuse
// it silently. Acquiring a *new* token shows Google's popup, so that only ever
// happens on an explicit Connect/Reconnect — background sync never pops up; it
// just uses the cached token (or asks the UI to reconnect when it has expired).

export interface RemoteEntry {
  fileId: string;
  projectId: string;
  updatedAt: number;
  hash: string;
}

export interface CloudProvider {
  readonly id: string;
  readonly label: string;
  isConfigured(): boolean;
  isConnected(): boolean;
  /** True when a non-expired access token is cached (sync can run silently). */
  hasToken(): boolean;
  /** Interactive — may show Google's popup. Returns false if the user declines. */
  authorize(): Promise<boolean>;
  disconnect(): void;
  list(): Promise<RemoteEntry[]>;
  download(fileId: string): Promise<string>;
  upload(p: {
    projectId: string;
    updatedAt: number;
    hash: string;
    content: string;
    fileId?: string;
  }): Promise<string>;
  remove(fileId: string): Promise<void>;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface TokenClient {
  callback: (r: TokenResponse) => void;
  requestAccessToken(opts?: { prompt?: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
          }): TokenClient;
        };
      };
    };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const CONSENT_KEY = "drawshare-drive-connected"; // user has connected before
const TOKEN_KEY = "drawshare-drive-token"; // { token, expiry } — survives reloads

let gisPromise: Promise<void> | null = null;
let tokenClient: TokenClient | null = null;

function readToken(): string {
  try {
    const v = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "null") as {
      token?: string;
      expiry?: number;
    } | null;
    if (v?.token && typeof v.expiry === "number" && Date.now() < v.expiry - 60_000) return v.token;
  } catch {}
  return "";
}
function writeToken(token: string, expiresInSec: number) {
  try {
    localStorage.setItem(
      TOKEN_KEY,
      JSON.stringify({ token, expiry: Date.now() + expiresInSec * 1000 }),
    );
  } catch {}
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(s);
  });
  return gisPromise;
}

// Interactive: opens Google's popup to grant/refresh a token, then caches it.
async function requestToken(): Promise<string> {
  await loadGis();
  const oauth2 = window.google?.accounts.oauth2;
  if (!oauth2) throw new Error("Google sign-in unavailable");
  if (!tokenClient) {
    tokenClient = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: () => {},
    });
  }
  return new Promise<string>((resolve, reject) => {
    const client = tokenClient as TokenClient;
    client.callback = (r) => {
      if (r.error || !r.access_token) {
        reject(new Error(r.error || "Authorization failed"));
        return;
      }
      writeToken(r.access_token, r.expires_in ?? 3600);
      try {
        localStorage.setItem(CONSENT_KEY, "1");
      } catch {}
      resolve(r.access_token);
    };
    client.requestAccessToken({ prompt: "" });
  });
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const token = readToken();
  if (!token) throw new Error("Drive authorization expired — reconnect");
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text().catch(() => "")}`);
  return res;
}

export const googleDrive: CloudProvider = {
  id: "google-drive",
  label: "Google Drive",

  isConfigured() {
    return CLIENT_ID.length > 0;
  },

  isConnected() {
    try {
      return localStorage.getItem(CONSENT_KEY) === "1";
    } catch {
      return false;
    }
  },

  hasToken() {
    return readToken() !== "";
  },

  async authorize() {
    try {
      await requestToken();
      return true;
    } catch {
      return false;
    }
  },

  disconnect() {
    try {
      localStorage.removeItem(CONSENT_KEY);
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
  },

  async list() {
    const fields = "files(id,appProperties)";
    const res = await api(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=1000&fields=${encodeURIComponent(fields)}`,
    );
    const data = (await res.json()) as {
      files?: Array<{ id: string; appProperties?: Record<string, string> }>;
    };
    const out: RemoteEntry[] = [];
    for (const f of data.files ?? []) {
      const p = f.appProperties;
      if (!p?.projectId) continue;
      out.push({
        fileId: f.id,
        projectId: p.projectId,
        updatedAt: Number(p.updatedAt) || 0,
        hash: p.hash ?? "",
      });
    }
    return out;
  },

  async download(fileId) {
    const res = await api(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    );
    return res.text();
  },

  async upload(p) {
    const metadata: Record<string, unknown> = {
      name: `${p.projectId}.json`,
      mimeType: "application/json",
      appProperties: { projectId: p.projectId, updatedAt: String(p.updatedAt), hash: p.hash },
    };
    if (!p.fileId) metadata.parents = ["appDataFolder"];

    const boundary = "drawshare-boundary";
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${p.content}\r\n--${boundary}--`;

    const url = p.fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(p.fileId)}?uploadType=multipart&fields=id`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id";
    const res = await api(url, {
      method: p.fileId ? "PATCH" : "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    const data = (await res.json()) as { id: string };
    return data.id;
  },

  async remove(fileId) {
    await api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
    });
  },
};
