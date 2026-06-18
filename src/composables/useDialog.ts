import { reactive } from "vue";

// App-wide replacement for the browser's blocking confirm()/alert(). A single
// <ConfirmDialog> mounted once reads this shared state; callers await a promise:
//   if (!(await confirmDialog({ title: "Delete?", danger: true })) return;
//   await alertDialog({ title: "Imported", message: "..." });

interface DialogState {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  // null = an alert (single button, no cancel).
  cancelText: string | null;
  danger: boolean;
}

export const dialogState = reactive<DialogState>({
  open: false,
  title: "",
  message: "",
  confirmText: "Confirm",
  cancelText: "Cancel",
  danger: false,
});

let resolver: ((confirmed: boolean) => void) | null = null;

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  // Resolve any dialog still open (shouldn't normally happen) as cancelled.
  settleDialog(false);
  return new Promise((resolve) => {
    dialogState.title = opts.title;
    dialogState.message = opts.message ?? "";
    dialogState.confirmText = opts.confirmText ?? "Confirm";
    dialogState.cancelText = opts.cancelText ?? "Cancel";
    dialogState.danger = opts.danger ?? false;
    dialogState.open = true;
    resolver = resolve;
  });
}

export function alertDialog(opts: {
  title: string;
  message?: string;
  confirmText?: string;
}): Promise<void> {
  settleDialog(false);
  return new Promise((resolve) => {
    dialogState.title = opts.title;
    dialogState.message = opts.message ?? "";
    dialogState.confirmText = opts.confirmText ?? "OK";
    dialogState.cancelText = null;
    dialogState.danger = false;
    dialogState.open = true;
    resolver = () => resolve();
  });
}

// Called by ConfirmDialog when the user chooses (or dismisses).
export function settleDialog(confirmed: boolean): void {
  if (!resolver) return;
  const resolve = resolver;
  resolver = null;
  dialogState.open = false;
  resolve(confirmed);
}
