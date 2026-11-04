"use client";

import { useEffect, useRef, useCallback, useState } from "react";

/**
 * Tracks whether a form/config has unsaved changes and warns before navigation.
 * Returns: { isDirty, markClean, markDirty }
 */
export function useUnsavedChanges<T>(
  initialValue: T,
  currentValue: T,
): { isDirty: boolean; markClean: () => void; markDirty: () => void } {
  const initialRef = useRef(initialValue);
  const dirtyRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const isSame = JSON.stringify(initialRef.current) === JSON.stringify(currentValue);
    dirtyRef.current = !isSame;
    setIsDirty(!isSame);
  }, [currentValue]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Warn on Next.js navigation
  useEffect(() => {
    // Intercept Next.js router navigation
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor || anchor.getAttribute("href") === window.location.pathname) return;
      if (dirtyRef.current) {
        if (!window.confirm("You have unsaved changes. Leave anyway?")) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  const markClean = useCallback(() => {
    initialRef.current = currentValue;
    dirtyRef.current = false;
    setIsDirty(false);
  }, [currentValue]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setIsDirty(true);
  }, []);

  return { isDirty, markClean, markDirty };
}
