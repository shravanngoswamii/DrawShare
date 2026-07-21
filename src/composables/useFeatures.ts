import { reactive } from "vue";

// Device-level feature toggles: which optional tools/panels are exposed in the
// UI. Disabling a feature only hides its entry points — it never touches
// existing project data, so content made with a now-disabled tool still
// renders and can still be selected/moved/deleted.

export interface FeatureFlags {
  highlighter: boolean;
  eraser: boolean;
  fill: boolean;
  shapes: boolean;
  text: boolean;
  imageImport: boolean;
  layers: boolean;
  background: boolean;
  presenterTools: boolean;
  liveShare: boolean;
  snapshotLink: boolean;
  replayRecording: boolean;
  onboarding: boolean;
  devMode: boolean;
  backupRestore: boolean;
  backButton: boolean;
  zoomControls: boolean;
  themeChoices: boolean;
}

const KEY = "drawshare:features";

const DEFAULTS: FeatureFlags = {
  highlighter: true,
  eraser: true,
  fill: true,
  shapes: true,
  text: true,
  imageImport: true,
  layers: true,
  background: true,
  presenterTools: true,
  liveShare: true,
  snapshotLink: true,
  // Experimental — off by default until it's had more real-world testing.
  replayRecording: false,
  onboarding: true,
  devMode: true,
  backupRestore: true,
  backButton: true,
  zoomControls: true,
  themeChoices: true,
};

function stored(): FeatureFlags {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    // Merge over defaults so a flag added in a later release defaults on for
    // existing users instead of being `undefined`.
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

const flags = reactive<FeatureFlags>(stored());

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(flags));
  } catch {}
}

export function useFeatures() {
  function setFeature(key: keyof FeatureFlags, value: boolean) {
    flags[key] = value;
    persist();
  }
  function resetFeatures() {
    Object.assign(flags, DEFAULTS);
    persist();
  }
  return { flags, setFeature, resetFeatures };
}
