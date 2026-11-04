"use client";

import { useState, useEffect, useCallback, ReactNode } from "react";
import { Loader2, CheckCircle2Icon, RotateCcw, Save } from "lucide-react";
import { Button } from "ui/button";
import { showSaveSuccess, showSaveError } from "./toast-helpers";
import { ShortcutHelpModal, useAdminShortcuts } from "./shortcut-help-modal";

interface PageHeaderProps {
  icon: ReactNode;
  title: string;
  description: string;
}

/**
 * Reusable shell for every /admin/settings/* page. Handles:
 *   - fetching the named config section from /api/admin/config
 *   - tracking dirty state, save status, and Cmd/Ctrl+S to save
 *   - rendering a consistent header (title, description, save/reset)
 *
 * Pages only need to declare their `defaults` object and a `renderForm`
 * function that renders the actual form fields.
 */
export function AdminSettingsPage<K extends string>(props: {
  icon: ReactNode;
  title: string;
  description: string;
  configKey: K;
  defaults: Record<string, unknown>;
  renderForm: (args: {
    config: Record<string, unknown>;
    setConfig: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
  }) => ReactNode;
}) {
  const { icon, title, description, configKey, defaults, renderForm } = props;
  const [config, setConfigState] = useState<Record<string, unknown>>(defaults);
  const [initialConfig, setInitialConfig] = useState<Record<string, unknown>>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { showHelp, setShowHelp } = useAdminShortcuts();

  const isDirty = JSON.stringify(initialConfig) !== JSON.stringify(config);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.config?.[configKey]) {
          setConfigState(d.config[configKey]);
          setInitialConfig(d.config[configKey]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [configKey]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: configKey, settings: config }),
      });
      if (res.ok) {
        setInitialConfig(config);
        setSaved(true);
        showSaveSuccess(`${title} settings saved`);
        setTimeout(() => setSaved(false), 3000);
      } else {
        showSaveError();
      }
    } catch {
      showSaveError();
    } finally {
      setSaving(false);
    }
  }, [config, configKey, title]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "?") {
        e.preventDefault();
        setShowHelp(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, setShowHelp]);

  const setConfig = useCallback(
    (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => {
      setConfigState((prev) => updater(prev));
    },
    [],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="border rounded-xl bg-card p-5 space-y-4 max-w-2xl">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-10 animate-pulse rounded-md bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <ShortcutHelpModal open={showHelp} onClose={() => setShowHelp(false)} />
      <div className="space-y-6">
        <PageHeader
          icon={icon}
          title={title}
          description={description}
          isDirty={isDirty}
          saved={saved}
          saving={saving}
          onSave={handleSave}
          onReset={() => setConfigState(initialConfig)}
          onHelp={() => setShowHelp(true)}
        />
        {renderForm({ config, setConfig })}
      </div>
    </>
  );
}

function PageHeader({
  icon,
  title,
  description,
  isDirty,
  saved,
  saving,
  onSave,
  onReset,
  onHelp,
}: PageHeaderProps & {
  isDirty: boolean;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  onHelp: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          {icon}
          {title}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        {isDirty && (
          <span className="text-xs text-amber-600 flex items-center gap-1.5">
            Unsaved changes
          </span>
        )}
        {saved && (
          <span className="text-sm text-green-600 flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2">
            <CheckCircle2Icon className="size-4" />
            Saved
          </span>
        )}
        <button
          onClick={() => {
            if (window.confirm("Reset to saved values? Any unsaved changes will be lost.")) {
              onReset();
            }
          }}
          className="h-9 px-3 text-sm font-medium rounded-md border bg-background hover:bg-muted transition-colors flex items-center gap-1.5 text-muted-foreground"
          title="Reset to saved values"
        >
          <RotateCcw className="size-3.5" />
          Reset
        </button>
        <Button onClick={onSave} disabled={saving || !isDirty} size="sm">
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Saving...
            </>
          ) : (
            <>
              <Save className="size-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
        <button
          onClick={onHelp}
          className="text-xs text-muted-foreground hover:text-foreground"
          title="Keyboard shortcuts"
        >
          ?
        </button>
      </div>
    </div>
  );
}
