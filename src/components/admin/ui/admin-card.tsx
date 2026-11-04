"use client";

import { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "lib/utils";

interface Props {
  title?: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  headerActions?: ReactNode;
}

export function AdminCard({
  title,
  description,
  icon,
  children,
  className,
  headerActions,
}: Props) {
  return (
    <div
      className={cn(
        "border rounded-xl bg-card p-5 space-y-4",
        className,
      )}
    >
      {(title || headerActions) && (
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            {title && (
              <h3 className="text-base font-semibold flex items-center gap-2">
                {icon && <span className="text-muted-foreground">{icon}</span>}
                {title}
              </h3>
            )}
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {headerActions && <div className="shrink-0">{headerActions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}

export function AdminSectionHeader({
  title,
  description,
  icon,
  actions,
}: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          {title}
        </h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

interface LoadingProps {
  rows?: number;
  cols?: number;
}

export function AdminCardSkeleton({ rows = 3, cols = 1 }: LoadingProps) {
  return (
    <div className="border rounded-xl bg-card p-5 space-y-4">
      <div className="space-y-2">
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="h-3 w-72 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-2">
            {Array.from({ length: cols }).map((_, j) => (
              <div
                key={j}
                className="h-10 animate-pulse rounded-md bg-muted"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminPageSkeleton() {
  return (
    <div className="space-y-6">
      <AdminCardSkeleton rows={1} cols={1} />
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <AdminCardSkeleton key={i} rows={2} cols={2} />
        ))}
      </div>
    </div>
  );
}

export function SaveButton({
  saving,
  saved,
  onClick,
  disabled,
}: {
  saving: boolean;
  saved: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  if (saved) {
    return (
      <span className="text-sm text-green-600 flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2">
        <Loader2 className="size-4" />
        Saved
      </span>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={saving || disabled}
      className="h-9 px-4 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {saving ? "Saving..." : "Save Changes"}
    </button>
  );
}