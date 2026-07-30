import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { closeTopSheet, hasOpenSheet } from "@/lib/sheet-stack";

/**
 * Right-edge → left swipe/drag closes the top open sheet first,
 * otherwise navigates back. Supports both touch and mouse (pointer events).
 */
export function useSwipeBack(enabled: boolean = true) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const EDGE = 40;
    const THRESHOLD = 80;
    let startX = 0;
    let startY = 0;
    let active = false;
    let pointerId: number | null = null;

    const trigger = () => {
      if (closeTopSheet()) return;
      router.history.back();
    };

    const onDown = (e: PointerEvent) => {
      // Only primary button for mouse
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const rect = el.getBoundingClientRect();
      if (e.clientX < rect.right - EDGE) return;
      active = true;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (!active || e.pointerId !== pointerId) return;
      active = false;
      pointerId = null;
      const dx = startX - e.clientX;
      const dy = Math.abs(e.clientY - startY);
      if (dx > THRESHOLD && dy < 80) trigger();
    };
    const onCancel = () => { active = false; pointerId = null; };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);

    // ESC also closes top sheet (mouse users)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && hasOpenSheet()) closeTopSheet();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("keydown", onKey);
    };
  }, [enabled, router]);

  return ref;
}
