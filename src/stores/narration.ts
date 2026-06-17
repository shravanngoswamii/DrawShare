import { defineStore } from "pinia";
import { storage } from "@/adapters/storage/indexedDB";
import type { ID, Narration } from "@/core/types";

// Module-level handles — not reactive, held outside Pinia state so Vue never
// tries to proxy a MediaRecorder or HTMLAudioElement.
let _recorder: MediaRecorder | null = null;
let _chunks: Blob[] = [];
let _stream: MediaStream | null = null;
let _audio: HTMLAudioElement | null = null;
let _blobUrl: string | null = null;
let _recTimerId: ReturnType<typeof setInterval> | null = null;

function revokeBlobUrl() {
  if (_blobUrl) {
    URL.revokeObjectURL(_blobUrl);
    _blobUrl = null;
  }
}

function stopStream() {
  if (_stream) {
    for (const track of _stream.getTracks()) track.stop();
    _stream = null;
  }
}

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "",
  ];
  return candidates.find((m) => !m || MediaRecorder.isTypeSupported(m)) ?? "";
}

function attachDurationRefine(narrationStore: ReturnType<typeof useNarrationStore>) {
  if (!_audio) return;
  _audio.addEventListener(
    "loadedmetadata",
    () => {
      if (narrationStore.narration && _audio && Number.isFinite(_audio.duration)) {
        narrationStore.narration = {
          ...narrationStore.narration,
          durationMs: Math.round(_audio.duration * 1000),
        };
      }
    },
    { once: true },
  );
}

export const useNarrationStore = defineStore("narration", {
  state: () => ({
    narration: null as Narration | null,
    isRecording: false,
    recElapsedSec: 0,
    permissionDenied: false,
    error: null as string | null,
  }),
  actions: {
    async load(projectId: ID) {
      const n = await storage.getNarration(projectId);
      this.narration = n ?? null;
      revokeBlobUrl();
      _audio = null;
      if (n) {
        _blobUrl = URL.createObjectURL(n.blob);
        _audio = new Audio(_blobUrl);
        attachDurationRefine(this);
      }
    },

    async startRecording() {
      if (this.isRecording) return;
      this.permissionDenied = false;
      this.error = null;
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (e) {
        if (e instanceof Error && e.name === "NotAllowedError") {
          this.permissionDenied = true;
        } else {
          this.error = "Microphone unavailable.";
        }
        return;
      }
      _stream = stream;
      _chunks = [];
      const mimeType = pickMimeType();
      _recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      _recorder.ondataavailable = (e) => {
        if (e.data.size > 0) _chunks.push(e.data);
      };
      _recorder.start(100);
      this.isRecording = true;
      this.recElapsedSec = 0;
      _recTimerId = setInterval(() => {
        this.recElapsedSec++;
      }, 1000);
    },

    stopRecording(projectId: ID): Promise<void> {
      if (!_recorder || !this.isRecording) return Promise.resolve();
      return new Promise((resolve) => {
        _recorder!.onstop = async () => {
          const mimeType = _recorder!.mimeType || "audio/webm";
          const blob = new Blob(_chunks, { type: mimeType });
          _chunks = [];
          stopStream();
          _recorder = null;
          if (_recTimerId !== null) {
            clearInterval(_recTimerId);
            _recTimerId = null;
          }
          const narration: Narration = {
            projectId,
            blob,
            mimeType,
            durationMs: this.recElapsedSec * 1000,
            createdAt: Date.now(),
          };
          await storage.putNarration(narration);
          this.narration = narration;
          this.isRecording = false;
          revokeBlobUrl();
          _blobUrl = URL.createObjectURL(blob);
          _audio = new Audio(_blobUrl);
          attachDurationRefine(this);
          resolve();
        };
        _recorder!.stop();
      });
    },

    async deleteNarration(projectId: ID) {
      if (this.isRecording) {
        _recorder?.stop();
        stopStream();
        _recorder = null;
        _chunks = [];
        this.isRecording = false;
        if (_recTimerId !== null) {
          clearInterval(_recTimerId);
          _recTimerId = null;
        }
      }
      this.pause();
      await storage.deleteNarration(projectId);
      this.narration = null;
      revokeBlobUrl();
      _audio = null;
    },

    exportAudio() {
      if (!this.narration || !_blobUrl) return;
      const a = document.createElement("a");
      a.href = _blobUrl;
      const ext = this.narration.mimeType.includes("ogg") ? "ogg" : "webm";
      a.download = `narration.${ext}`;
      a.click();
    },

    play(fromMs: number) {
      if (!_audio) return;
      _audio.currentTime = fromMs / 1000;
      _audio.play().catch(() => {});
    },

    pause() {
      _audio?.pause();
    },

    seek(ms: number) {
      if (!_audio) return;
      _audio.currentTime = ms / 1000;
    },

    setPlaybackRate(rate: number) {
      if (!_audio) return;
      _audio.playbackRate = rate;
    },
  },
});
