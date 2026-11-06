/** Page-wide toast: any client component can call showToast, and <Toast /> displays it. */
export const TOAST_EVENT = 'muso:toast';

export function showToast(message: string) {
  window.dispatchEvent(new CustomEvent<string>(TOAST_EVENT, { detail: message }));
}
