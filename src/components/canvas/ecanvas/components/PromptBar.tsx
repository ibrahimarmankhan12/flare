import React, { useState, useRef, useCallback } from "react";
import "./PromptBar.css";

const INSPIRATION = [
  {
    label: "Generative Art",
    prompt:
      "As a master of creative programming, create an interactive generative art piece with given reference image as direction / inspiration. You may use canvas2d, shader, p5.js or similar.",
  },
  {
    label: "Wireframe → App",
    prompt:
      "As a frontend expert, turn this wireframe into a polished, production-ready web application with clean UI and good UX, take reference image as direction & inspiration.",
  },
  {
    label: "Landing Page",
    prompt:
      "As a frontend expert, Build a modern SaaS landing page with hero, features, pricing, and CTA sections, make use of stock CSS and Font library instead of improvising.",
  },
  {
    label: "Dashboard",
    prompt:
      "Create a data dashboard with charts, stats cards, and a clean sidebar navigation",
  },
];

interface Props {
  onGenerate: (prompt: string) => void;
  onRefine: (prompt: string) => void;
  onClear: () => void;
  hasOutput: boolean;
  generating: boolean;
  planMode: boolean;
  onPlanModeToggle: () => void;
}

export function PromptBar({
  onGenerate,
  onRefine,
  onClear,
  hasOutput,
  generating,
  planMode,
  onPlanModeToggle,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const text = prompt.trim();
    if (generating) return;
    if (hasOutput) {
      onRefine(text);
    } else {
      if (!text) return;
      onGenerate(text);
    }
    setPrompt("");
  }, [prompt, generating, hasOutput, onGenerate, onRefine]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleInspiration = useCallback((text: string) => {
    setPrompt(text);
    textareaRef.current?.focus();
  }, []);

  return (
    <div className={`prompt-bar ${planMode ? "plan-active" : ""}`}>
      {!hasOutput && !prompt && (
        <div className="inspiration-strip">
          {INSPIRATION.map((item) => (
            <button
              key={item.label}
              className="inspiration-chip"
              onClick={() => handleInspiration(item.prompt)}
              disabled={generating}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <label className="sr-only" htmlFor="canvas-prompt-input">
        Canvas prompt
      </label>
      <textarea
        id="canvas-prompt-input"
        ref={textareaRef}
        className="prompt-input"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-describedby="canvas-prompt-hint"
        placeholder={
          hasOutput
            ? "Describe changes, or leave empty and hit Refine…"
            : "Describe what you want to build…"
        }
        rows={4}
        disabled={generating}
      />

      <div className="prompt-footer">
        <button
          className={`plan-toggle ${planMode ? "active" : ""}`}
          onClick={onPlanModeToggle}
          disabled={generating}
          aria-pressed={planMode}
          title={
            planMode
              ? "Plan mode ON — Gaze, Dream, then Create"
              : "Enable Plan mode for deeper, multi-step generation"
          }
        >
          <span className="plan-toggle-orb" />
          <span className="plan-toggle-label">Plan</span>
          {planMode && (
            <span className="plan-toggle-hint">Gaze · Dream · Create</span>
          )}
        </button>

        <div className="prompt-footer-right">
          {hasOutput && (
            <button
              className="btn btn-ghost clear-btn"
              onClick={onClear}
              disabled={generating}
            >
              Clear
            </button>
          )}
          <button
            className={`btn btn-primary generate-btn ${planMode ? "plan-active" : ""}`}
            onClick={handleSubmit}
            disabled={generating || (!hasOutput && !prompt.trim())}
          >
            {generating ? (
              <span className="btn-spinner" />
            ) : hasOutput ? (
              <>↻ Refine</>
            ) : (
              <>↑ Generate</>
            )}
          </button>
          <span className="prompt-hint mono" id="canvas-prompt-hint">
            Ctrl/Cmd + Enter
          </span>
        </div>
      </div>
    </div>
  );
}
