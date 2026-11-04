"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertCircle, Bug, Loader2 } from "lucide-react";

import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Textarea } from "ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "ui/alert";
import {
  BUG_REPORT_CATEGORY_OPTIONS,
  BUG_REPORT_SEVERITY_OPTIONS,
  type BugReportSeverity,
} from "@/hooks/use-bug-bounty";

interface FormState {
  title: string;
  description: string;
  severity: BugReportSeverity;
  category: string;
  affectedArea: string;
  reproductionSteps: string;
  impact: string;
  proofOfConcept: string;
}

const INITIAL_STATE: FormState = {
  title: "",
  description: "",
  severity: "medium",
  category: "security",
  affectedArea: "",
  reproductionSteps: "",
  impact: "",
  proofOfConcept: "",
};

export function BugBountySubmitForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (form.title.trim().length < 8) {
      setError("Title must be at least 8 characters.");
      return;
    }
    if (form.description.trim().length < 20) {
      setError("Description must be at least 20 characters.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/bug-bounty/reports", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            description: form.description,
            severity: form.severity,
            category: form.category,
            affectedArea: form.affectedArea || null,
            reproductionSteps: form.reproductionSteps,
            impact: form.impact,
            proofOfConcept: form.proofOfConcept || null,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(json?.error ?? "Failed to submit report.");
          return;
        }
        const id = json?.report?.id as string | undefined;
        toast.success("Report submitted. Thank you!");
        router.push(id ? `/bug-bounty/reports/${id}` : "/bug-bounty/reports");
        router.refresh();
      } catch (err) {
        console.error(err);
        setError("Network error. Please try again.");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not submit</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              required
              minLength={8}
              maxLength={160}
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="Short, descriptive summary of the bug"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
              >
                {BUG_REPORT_CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="affectedArea">Affected area</Label>
              <Input
                id="affectedArea"
                maxLength={200}
                value={form.affectedArea}
                onChange={(e) => update("affectedArea", e.target.value)}
                placeholder="e.g. Chat streaming, MCP connect flow"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Severity (self-assessed)</Label>
            <div className="grid sm:grid-cols-2 gap-2">
              {BUG_REPORT_SEVERITY_OPTIONS.map((opt) => {
                const active = form.severity === opt.value;
                return (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => update("severity", opt.value)}
                    aria-pressed={active}
                    className={
                      "text-left rounded-lg border p-3 transition-colors " +
                      (active
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border hover:border-foreground/30")
                    }
                  >
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {opt.description}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              The triage team makes the final call. Don&apos;t inflate the
              severity — clearer reports earn more.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What happened?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              required
              minLength={20}
              maxLength={20_000}
              rows={6}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Describe the bug, what you observed, and the conditions required to reproduce it."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reproductionSteps">Steps to reproduce</Label>
            <Textarea
              id="reproductionSteps"
              maxLength={10_000}
              rows={5}
              value={form.reproductionSteps}
              onChange={(e) => update("reproductionSteps", e.target.value)}
              placeholder={
                "1. Sign in as ...\n2. Navigate to ...\n3. Observe that ..."
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="impact">Impact</Label>
            <Textarea
              id="impact"
              maxLength={10_000}
              rows={4}
              value={form.impact}
              onChange={(e) => update("impact", e.target.value)}
              placeholder="What can an attacker do? Which users are affected? Is data at risk?"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proofOfConcept">
              Proof of concept (optional)
            </Label>
            <Textarea
              id="proofOfConcept"
              maxLength={10_000}
              rows={4}
              value={form.proofOfConcept}
              onChange={(e) => update("proofOfConcept", e.target.value)}
              placeholder="Screenshots, request/response samples, scripts, or a link to a private repro."
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-md">
          By submitting you confirm the report follows our rules of engagement
          and you allow us to reproduce the issue internally.
        </p>
        <Button type="submit" disabled={pending} size="lg">
          {pending ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <Bug className="size-4 mr-2" />
          )}
          Submit report
        </Button>
      </div>
    </form>
  );
}
