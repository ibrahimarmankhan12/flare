"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

const BANNER_DISMISS_KEY = "warning-banner-dismissed";

export function WarningBanner() {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    const stored = localStorage.getItem(BANNER_DISMISS_KEY);
    if (stored !== "true") {
      setDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(BANNER_DISMISS_KEY, "true");
  };

  if (dismissed) return null;

  return (
    <div className="warning-banner">
      <div className="warning-banner-content">
        <span className="warning-banner-icon">⚠️</span>
        <p className="warning-banner-text">
          Elevated load on AI models may cause intermittent errors. We&apos;re
          actively resolving this.
        </p>
      </div>
      <button
        onClick={handleDismiss}
        className="warning-banner-close"
        aria-label="Dismiss warning"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
