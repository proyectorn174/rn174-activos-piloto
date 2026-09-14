"use client";

import { useEffect } from "react";

const STORAGE_KEY = "rn174_v4_console_position";
const MARGIN = 8;

type StoredPosition = { x: number; y: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function readStored(): StoredPosition | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPosition;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStored(x: number, y: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y }));
  } catch {
    // El visor debe seguir funcionando aunque el navegador bloquee localStorage.
  }
}

export function ViewerConsoleFloating() {
  useEffect(() => {
    let consoleEl: HTMLElement | null = null;
    let headEl: HTMLElement | null = null;
    let dragging = false;
    let pointerId: number | null = null;
    let offsetX = 0;
    let offsetY = 0;
    let observer: MutationObserver | null = null;

    const constrain = () => {
      if (!consoleEl || !document.documentElement.contains(consoleEl)) return;
      const rect = consoleEl.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - MARGIN;
      const maxY = window.innerHeight - rect.height - MARGIN;
      const x = clamp(rect.left, MARGIN, maxX);
      const y = clamp(rect.top, MARGIN, maxY);
      consoleEl.style.left = `${x}px`;
      consoleEl.style.top = `${y}px`;
      saveStored(x, y);
    };

    const applyFloatingMode = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect();
      const stored = readStored();
      const width = rect.width;
      const height = rect.height;
      const maxX = window.innerWidth - width - MARGIN;
      const maxY = window.innerHeight - height - MARGIN;
      const x = clamp(stored?.x ?? rect.left, MARGIN, maxX);
      const y = clamp(stored?.y ?? rect.top, MARGIN, maxY);

      node.style.position = "fixed";
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      node.style.right = "auto";
      node.style.bottom = "auto";
      node.style.width = `${width}px`;
      node.style.height = `${height}px`;
      node.style.maxWidth = "calc(100vw - 16px)";
      node.style.maxHeight = "calc(100vh - 16px)";
      node.style.zIndex = "9800";
      node.style.boxShadow = "0 24px 70px rgba(15,23,42,.38)";
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || !consoleEl || pointerId !== event.pointerId) return;
      event.preventDefault();
      const rect = consoleEl.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - MARGIN;
      const maxY = window.innerHeight - rect.height - MARGIN;
      const x = clamp(event.clientX - offsetX, MARGIN, maxX);
      const y = clamp(event.clientY - offsetY, MARGIN, maxY);
      consoleEl.style.left = `${x}px`;
      consoleEl.style.top = `${y}px`;
    };

    const endDrag = (event?: PointerEvent) => {
      if (!dragging) return;
      if (event && pointerId !== event.pointerId) return;
      dragging = false;
      pointerId = null;
      document.body.style.userSelect = "";
      if (headEl) headEl.style.cursor = "grab";
      if (consoleEl) {
        const rect = consoleEl.getBoundingClientRect();
        saveStored(rect.left, rect.top);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!consoleEl || !headEl) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, input, select, textarea, a")) return;
      const rect = consoleEl.getBoundingClientRect();
      dragging = true;
      pointerId = event.pointerId;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      consoleEl.style.zIndex = "9999";
      headEl.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      try { headEl.setPointerCapture(event.pointerId); } catch { /* no-op */ }
      event.preventDefault();
    };

    const detach = () => {
      endDrag();
      headEl?.removeEventListener("pointerdown", onPointerDown);
      headEl = null;
      consoleEl = null;
    };

    const attach = () => {
      const next = document.querySelector<HTMLElement>(".v4-console");
      if (!next) {
        if (consoleEl) detach();
        return;
      }
      if (next === consoleEl) return;
      detach();
      consoleEl = next;
      headEl = next.querySelector<HTMLElement>(".v4-head");
      applyFloatingMode(next);
      if (headEl) {
        headEl.style.cursor = "grab";
        headEl.style.touchAction = "none";
        headEl.title = "Arrastrar la Consola de Ingeniería";
        headEl.addEventListener("pointerdown", onPointerDown);
      }
    };

    attach();
    observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("resize", constrain);

    return () => {
      observer?.disconnect();
      detach();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("resize", constrain);
      document.body.style.userSelect = "";
    };
  }, []);

  return null;
}
