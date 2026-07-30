// Global stack of open modal/sheet close-handlers.
// Top of stack closes first when user gestures "back".
const stack: Array<() => void> = [];

export function pushSheet(close: () => void): () => void {
  stack.push(close);
  return () => {
    const i = stack.lastIndexOf(close);
    if (i >= 0) stack.splice(i, 1);
  };
}

export function hasOpenSheet(): boolean {
  return stack.length > 0;
}

export function closeTopSheet(): boolean {
  const fn = stack.pop();
  if (fn) { try { fn(); } catch {} return true; }
  return false;
}
