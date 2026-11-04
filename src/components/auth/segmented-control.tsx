"use client";

/**
 * Cupertino-style segmented control.
 *
 * Visual contract: iOS UISegmentedControl — a single rounded "track"
 * with a pill that slides between the active option. The pill is one
 * framer-motion `motion.span` with a `layoutId`, so the transition is
 * a real spring-animated translateX driven by framer-motion's layout
 * engine, not a hand-rolled width measurement.
 *
 * The label color is *also* animated via `motion.span` with a
 * matching `layoutId` for the active text. This produces a smoother
 * crossfade than a CSS `transition-colors` because both the pill and
 * the label move through the same spring, so they stay synchronized
 * across the swipe.
 *
 * Accessibility: container is `role="tablist"`, each option is a
 * `role="tab"` with `aria-selected` and keyboard arrow navigation
 * (Left/Right wrap around, matching the iOS keyboard model). Home/End
 * jump to the first/last enabled option for parity with the WAI-ARIA
 * tab pattern.
 *
 * Reduced motion: framer-motion's `useReducedMotion` collapses the
 * spring to a near-instant transition. The component still functions
 * correctly — only the animation duration changes.
 */

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "lib/utils";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Optional disabled state (rendered but not clickable, not keyboard-focusable). */
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedControlOption<T>[];
  /** ARIA label for the tablist. Falls back to a generic one if omitted. */
  ariaLabel?: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel = "Segmented control",
  className,
}: SegmentedControlProps<T>) {
  const reducedMotion = useReducedMotion();
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const enabledIndices = options
    .map((o, i) => (o.disabled ? -1 : i))
    .filter((i) => i >= 0);

  const focusByIndex = (i: number) => {
    const el = tabRefs.current[i];
    el?.focus();
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) => {
    const list = enabledIndices;
    if (list.length === 0) return;

    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const posInEnabled = list.indexOf(idx);
      const next =
        e.key === "ArrowRight"
          ? list[(posInEnabled + 1) % list.length]
          : list[(posInEnabled - 1 + list.length) % list.length];
      onChange(options[next].value);
      requestAnimationFrame(() => focusByIndex(next));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      onChange(options[list[0]].value);
      requestAnimationFrame(() => focusByIndex(list[0]));
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      onChange(options[list[list.length - 1]].value);
      requestAnimationFrame(() => focusByIndex(list[list.length - 1]));
      return;
    }
  };

  const spring = reducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 480, damping: 36, mass: 0.7 };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "bg-muted text-muted-foreground relative inline-flex h-11 w-full items-center rounded-full p-1 select-none",
        className,
      )}
    >
      {options.map((opt, i) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`segmented-panel-${opt.value}`}
            tabIndex={isActive ? 0 : -1}
            disabled={opt.disabled}
            onClick={() => {
              if (!opt.disabled) onChange(opt.value);
            }}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={cn(
              "relative z-10 flex-1 inline-flex items-center justify-center rounded-full px-3 text-sm font-medium",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-muted",
              opt.disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {/* Sliding pill — sits behind the labels, animates between
                the active tab's position via framer-motion's layout
                engine. The parent uses `flex-1` per option so the pill
                width matches one option's box exactly. */}
            {isActive && (
              <motion.span
                aria-hidden
                layoutId="segmented-control-pill"
                className="absolute inset-0 rounded-full bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_4px_12px_rgba(0,0,0,0.5)]"
                transition={spring}
              />
            )}
            {/* Active label crossfades to a higher-contrast color via a
                shared layoutId, so the text and pill move through the
                same spring. */}
            {isActive ? (
              <motion.span
                key={`active-${opt.value}`}
                layoutId="segmented-control-label"
                className="relative z-10 whitespace-nowrap text-foreground"
                transition={spring}
              >
                {opt.label}
              </motion.span>
            ) : (
              <span
                className={cn(
                  "relative z-10 whitespace-nowrap transition-colors duration-200",
                  "text-muted-foreground hover:text-foreground/80",
                )}
              >
                {opt.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
