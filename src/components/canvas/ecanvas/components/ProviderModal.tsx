import { useEffect, useRef } from "react";
import type { CanvasState, CanvasModelOption } from "../lib/store";
import "./ProviderModal.css";

interface Props {
  state: CanvasState;
  onUpdate: (state: CanvasState) => void;
  onClose: () => void;
}

function groupByProvider(models: CanvasModelOption[]) {
  const byProvider = new Map<
    string,
    { providerLabel: string; models: CanvasModelOption[] }
  >();

  for (const model of models) {
    const existing = byProvider.get(model.provider);
    if (existing) {
      existing.models.push(model);
      continue;
    }
    byProvider.set(model.provider, {
      providerLabel: model.providerLabel,
      models: [model],
    });
  }

  return Array.from(byProvider.entries());
}

export function ProviderModal({ state, onUpdate, onClose }: Props) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
          return;
        }

        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      lastFocusedRef.current?.focus();
    };
  }, [onClose]);

  const handleSelectModel = (id: string) => {
    onUpdate({
      ...state,
      activeModelId: id,
    });
    onClose();
  };

  const groups = groupByProvider(state.models);

  return (
    <div className="pm-overlay" onClick={onClose}>
      <div
        className="pm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="canvas-models-title"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pm-header">
          <h2 className="pm-title" id="canvas-models-title">
            FLare-SH Models
          </h2>
          <button
            className="pm-close"
            onClick={onClose}
            aria-label="Close model selector"
            ref={closeRef}
          >
            &times;
          </button>
        </div>

        <div className="pm-body">
          <div className="pm-cards">
            {groups.map(([provider, data]) => (
              <div key={provider} className="pm-card active">
                <div className="pm-card-header">
                  <div className="pm-card-name-row">
                    <span className="pm-card-dot active" />
                    <span className="pm-card-name">{data.providerLabel}</span>
                  </div>
                </div>

                <div className="pm-card-models">
                  {data.models.map((model) => (
                    <button
                      key={model.id}
                      className={`pm-model-btn ${state.activeModelId === model.id ? "selected" : ""}`}
                      onClick={() => handleSelectModel(model.id)}
                      title={model.id}
                    >
                      {model.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {groups.length === 0 && (
              <div className="pm-card">
                <div className="pm-card-name">No models available.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
