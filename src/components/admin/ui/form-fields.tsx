"use client";

import { ReactNode } from "react";
import { Switch } from "ui/switch";

/**
 * Shared form field primitives used by every admin settings page.
 * Keep these in one place so styling stays consistent across the panel.
 */

export function FieldLabel({
  children,
  hint,
  required,
}: {
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="text-sm font-medium block mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
      {hint && (
        <span className="text-xs text-muted-foreground font-normal ml-2">
          {hint}
        </span>
      )}
    </label>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  type = "text",
  className,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "url" | "email" | "number";
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={
        "h-9 w-full px-3 text-sm rounded-md border bg-background " +
        (className ?? "")
      }
    />
  );
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      className="h-9 w-full px-3 text-sm rounded-md border bg-background"
    />
  );
}

export function TextAreaField({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 text-sm rounded-md border bg-background resize-y"
    />
  );
}

export function SelectField<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T | undefined;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value ?? options[0]?.value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-9 w-full px-3 text-sm rounded-md border bg-background"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ToggleField({
  value,
  onChange,
  label,
  description,
}: {
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <Switch checked={!!value} onCheckedChange={onChange} />
    </div>
  );
}

export function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="border rounded-xl bg-card p-5 space-y-5 max-w-2xl">
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
