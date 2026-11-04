"use client";

import { cn } from "lib/utils";
import { useState } from "react";

/**
 * Domain mapping for each connector provider to logo.dev.
 * Falls back to a generic Google/colored placeholder when no domain is set.
 */
const PROVIDER_DOMAINS: Record<string, string> = {
  gmail: "mail.google.com",
  "google-drive": "drive.google.com",
  "google-calendar": "calendar.google.com",
  "google-docs": "docs.google.com",
  "google-forms": "forms.google.com",
  "google-keep": "keep.google.com",
  "google-meet": "meet.google.com",
  "google-sheets": "sheets.google.com",
  "google-slides": "slides.google.com",
  "google-tasks": "tasks.google.com",
  youtube: "youtube.com",
  outlook: "outlook.com",
  slack: "slack.com",
  notion: "notion.so",
  github: "github.com",
  confluence: "atlassian.com",
  jira: "atlassian.com",
  linear: "linear.app",
  asana: "asana.com",
  clickup: "clickup.com",
  productboard: "productboard.com",
  testrail: "testrail.com",
  coda: "coda.io",
  outline: "outline.com",
  slab: "slab.com",
  guru: "getguru.com",
  highspot: "highspot.com",
  document360: "document360.com",
  gitlab: "gitlab.com",
  bitbucket: "bitbucket.org",
  dropbox: "dropbox.com",
  zendesk: "zendesk.com",
  freshdesk: "freshdesk.com",
  salesforce: "salesforce.com",
  hubspot: "hubspot.com",
  airtable: "airtable.com",
  gong: "gong.io",
  egnyte: "egnyte.com",
  teams: "teams.microsoft.com",
  discord: "discord.com",
  bookstack: "bookstackapp.com",
  gitbook: "gitbook.com",
  canvas: "instructure.com",
  loopio: "loopio.com",
  discourse: "discourse.org",
  xenforo: "xenforo.com",
  "drupal-wiki": "drupal.org",
  axero: "axero.com",
  zulip: "zulip.com",
  mediawiki: "mediawiki.org",
  fireflies: "fireflies.ai",
  wikipedia: "wikipedia.org",
};

const LOGO_DEV_TOKEN = "pk_cpfmCj4-SSKpbSZfZM9aRw";

interface ConnectorLogoIconProps {
  provider: string;
  className?: string;
}

export function ConnectorLogoIcon({
  provider,
  className,
}: ConnectorLogoIconProps) {
  const [error, setError] = useState(false);
  const domain = PROVIDER_DOMAINS[provider];

  if (!domain || error) {
    // Fallback: show the first letter of the provider name
    const label = provider
      .replace(/^google-/, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-bold size-5",
          className,
        )}
        title={label}
      >
        {label.charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={`https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}`}
      alt={provider}
      className={cn("size-5 rounded-sm object-contain", className)}
      onError={() => setError(true)}
      loading="lazy"
    />
  );
}
