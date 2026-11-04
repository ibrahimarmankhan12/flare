"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WEBHOOK_RECEIVER_DOCS_SNIPPET } from "@/lib/webhooks/receiver-docs";
import { useEffect, useMemo, useState, useTransition } from "react";

const EVENT_TYPES = [
  "thread.created",
  "message.created",
  "scheduled_run.completed",
  "agent.published",
  "inbound.received",
] as const;

type EventType = (typeof EVENT_TYPES)[number];

type Subscription = {
  id: string;
  url: string;
  eventTypes: EventType[];
  description: string | null;
  enabled: boolean;
  failureCount: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  createdAt: string;
};

type Delivery = {
  id: string;
  status: string;
  attempts: number;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
  event: {
    id: string;
    eventType: string;
    status: string;
    lastError: string | null;
    createdAt: string;
  };
};

export function WebhooksDashboard() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<EventType[]>([
    "thread.created",
    "message.created",
  ]);
  const [editUrl, setEditUrl] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editEvents, setEditEvents] = useState<EventType[]>([]);
  const [editSecret, setEditSecret] = useState("");
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedSubscription = useMemo(
    () => subscriptions.find((subscription) => subscription.id === selectedId),
    [selectedId, subscriptions],
  );

  const loadSubscriptions = async () => {
    const response = await fetch("/api/webhook-subscription");
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const body = await response.json();
    const nextSubscriptions = (body.subscriptions ?? []) as Subscription[];
    setSubscriptions(nextSubscriptions);
    setSelectedId((current) =>
      current &&
      nextSubscriptions.some((subscription) => subscription.id === current)
        ? current
        : (nextSubscriptions[0]?.id ?? null),
    );
  };

  const loadDeliveries = async (subscriptionId: string) => {
    const response = await fetch(
      `/api/webhook-subscription/${subscriptionId}/deliveries`,
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const body = await response.json();
    setDeliveries(body.deliveries ?? []);
  };

  useEffect(() => {
    startTransition(async () => {
      try {
        setError(null);
        await loadSubscriptions();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedSubscription) {
      setEditUrl("");
      setEditDescription("");
      setEditEvents([]);
      setEditSecret("");
      return;
    }

    setEditUrl(selectedSubscription.url);
    setEditDescription(selectedSubscription.description ?? "");
    setEditEvents(selectedSubscription.eventTypes);
    setEditSecret("");
  }, [selectedSubscription]);

  useEffect(() => {
    if (!selectedId) {
      setDeliveries([]);
      return;
    }

    startTransition(async () => {
      try {
        setError(null);
        await loadDeliveries(selectedId);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }, [selectedId]);

  const toggleEvent = (
    eventType: EventType,
    currentEvents: EventType[],
    setEvents: (events: EventType[]) => void,
  ) => {
    setEvents(
      currentEvents.includes(eventType)
        ? currentEvents.filter((event) => event !== eventType)
        : [...currentEvents, eventType],
    );
  };

  const createSubscription = () => {
    startTransition(async () => {
      try {
        setError(null);
        setNewSecret(null);
        const response = await fetch("/api/webhook-subscription", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url,
            description: description || undefined,
            eventTypes: selectedEvents,
          }),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const body = await response.json();
        setNewSecret(body.signingSecret);
        setUrl("");
        setDescription("");
        await loadSubscriptions();
        setSelectedId(body.subscription.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const updateSubscription = () => {
    if (!selectedSubscription) return;

    startTransition(async () => {
      try {
        setError(null);
        const response = await fetch(
          `/api/webhook-subscription/${selectedSubscription.id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              url: editUrl,
              description: editDescription || null,
              eventTypes: editEvents,
              ...(editSecret ? { signingSecret: editSecret } : {}),
            }),
          },
        );
        if (!response.ok) {
          throw new Error(await response.text());
        }
        setEditSecret("");
        await loadSubscriptions();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const toggleSubscriptionEnabled = (subscription: Subscription) => {
    startTransition(async () => {
      try {
        setError(null);
        const response = await fetch(
          `/api/webhook-subscription/${subscription.id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ enabled: !subscription.enabled }),
          },
        );
        if (!response.ok) {
          throw new Error(await response.text());
        }
        await loadSubscriptions();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const deleteSubscription = (id: string) => {
    startTransition(async () => {
      try {
        setError(null);
        const response = await fetch(`/api/webhook-subscription/${id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        setSelectedId(null);
        await loadSubscriptions();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">Webhooks</h1>
        <p className="text-muted-foreground text-sm">
          Send signed Flare events to your own HTTPS endpoint.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm">
          {error}
        </div>
      ) : null}

      {newSecret ? (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>Signing secret — shown once</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <code className="block overflow-x-auto rounded bg-muted p-3 text-sm">
              {newSecret}
            </code>
            <p className="text-muted-foreground text-xs">
              Store this secret now. Flare will not show it again.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create subscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="https://example.com/flare/webhook"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <Textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <EventSelector
              events={selectedEvents}
              onToggle={(eventType) =>
                toggleEvent(eventType, selectedEvents, setSelectedEvents)
              }
            />
            <Button
              disabled={isPending || selectedEvents.length === 0 || !url}
              onClick={createSubscription}
            >
              Create webhook
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Subscriptions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {subscriptions.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No webhook subscriptions yet.
                </p>
              ) : null}
              {subscriptions.map((subscription) => (
                <button
                  className={`w-full rounded-md border p-4 text-left transition hover:bg-muted/60 ${
                    selectedId === subscription.id ? "border-primary" : ""
                  }`}
                  key={subscription.id}
                  onClick={() => setSelectedId(subscription.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{subscription.url}</p>
                      <p className="text-muted-foreground text-xs">
                        {subscription.description || "No description"}
                      </p>
                    </div>
                    <Badge
                      variant={subscription.enabled ? "default" : "secondary"}
                    >
                      {subscription.enabled ? "enabled" : "disabled"}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {subscription.eventTypes.map((eventType) => (
                      <Badge key={eventType} variant="outline">
                        {eventType}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-1 text-muted-foreground text-xs sm:grid-cols-3">
                    <span>Failures: {subscription.failureCount}</span>
                    <span>
                      Last success: {formatDate(subscription.lastSuccessAt)}
                    </span>
                    <span>
                      Last failure: {formatDate(subscription.lastFailureAt)}
                    </span>
                  </div>
                  {subscription.lastFailureReason ? (
                    <p className="mt-2 text-destructive text-xs">
                      {subscription.lastFailureReason}
                    </p>
                  ) : null}
                </button>
              ))}
            </CardContent>
          </Card>

          {selectedSubscription ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Edit subscription</CardTitle>
                <div className="flex gap-2">
                  <Button
                    onClick={() =>
                      toggleSubscriptionEnabled(selectedSubscription)
                    }
                    size="sm"
                    variant="secondary"
                  >
                    {selectedSubscription.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    onClick={() => deleteSubscription(selectedSubscription.id)}
                    size="sm"
                    variant="destructive"
                  >
                    Delete
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="https://example.com/flare/webhook"
                  value={editUrl}
                  onChange={(event) => setEditUrl(event.target.value)}
                />
                <Textarea
                  placeholder="Description (optional)"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                />
                <EventSelector
                  events={editEvents}
                  onToggle={(eventType) =>
                    toggleEvent(eventType, editEvents, setEditEvents)
                  }
                />
                <Input
                  placeholder="New signing secret (optional, 16+ chars)"
                  type="password"
                  value={editSecret}
                  onChange={(event) => setEditSecret(event.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Updating the secret rotates delivery signing, but the stored
                  secret is never returned by the API.
                </p>
                <Button
                  disabled={isPending || editEvents.length === 0 || !editUrl}
                  onClick={updateSubscription}
                >
                  Save changes
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Latest deliveries</CardTitle>
              {selectedSubscription ? (
                <Button
                  onClick={() => loadDeliveries(selectedSubscription.id)}
                  size="sm"
                  variant="secondary"
                >
                  Refresh
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedSubscription ? (
                <p className="text-muted-foreground text-sm">
                  Select a subscription to inspect delivery attempts.
                </p>
              ) : null}
              {selectedSubscription && deliveries.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No deliveries recorded yet.
                </p>
              ) : null}
              {deliveries.map((delivery) => (
                <div className="rounded-md border p-3" key={delivery.id}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">
                        {delivery.event.eventType}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatDate(delivery.createdAt)} · attempts{" "}
                        {delivery.attempts}
                      </p>
                    </div>
                    <Badge
                      variant={
                        delivery.status === "delivered"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {delivery.status}
                    </Badge>
                  </div>
                  <div className="mt-2 grid gap-1 text-muted-foreground text-xs sm:grid-cols-2">
                    <span>Event status: {delivery.event.status}</span>
                    <span>Delivered: {formatDate(delivery.deliveredAt)}</span>
                  </div>
                  {delivery.lastError ? (
                    <p className="mt-2 text-destructive text-xs">
                      {delivery.lastError}
                    </p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Receiver verification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground text-sm">
            Verify the raw request body before parsing JSON.
          </p>
          <pre className="overflow-x-auto rounded bg-muted p-4 text-sm">
            {WEBHOOK_RECEIVER_DOCS_SNIPPET}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function EventSelector({
  events,
  onToggle,
}: {
  events: EventType[];
  onToggle: (eventType: EventType) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="font-medium text-sm">Events</p>
      {EVENT_TYPES.map((eventType) => (
        <label className="flex items-center gap-2 text-sm" key={eventType}>
          <Checkbox
            checked={events.includes(eventType)}
            onCheckedChange={() => onToggle(eventType)}
          />
          <span>{eventType}</span>
        </label>
      ))}
    </div>
  );
}

const formatDate = (value: string | null) => {
  if (!value) return "never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};
