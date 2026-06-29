"use client";

import { useEffect } from "react";

interface Shortcut {
  key: string;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  allowInInput?: boolean;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[], deps: unknown[] = []) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isInput = tag === "input" || tag === "textarea" || tag === "select" || (e.target as HTMLElement)?.isContentEditable;

      for (const s of shortcuts) {
        const keyMatch = e.key.toLowerCase() === s.key.toLowerCase();
        const metaMatch = s.meta === undefined || e.metaKey === s.meta || e.ctrlKey === s.meta;
        const shiftMatch = s.shift === undefined || e.shiftKey === s.shift;
        const altMatch = s.alt === undefined || e.altKey === s.alt;
        if (keyMatch && metaMatch && shiftMatch && altMatch) {
          if (isInput && !s.allowInInput) continue;
          e.preventDefault();
          s.handler();
          return;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, deps);
}
