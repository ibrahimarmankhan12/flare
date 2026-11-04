#!/usr/bin/env node
/**
 * One-time scaffold: write 41 icon components for the new connectors.
 * Each icon is a minimal colored-circle placeholder with a letter inside.
 * Reuses the lucide-style pattern from the existing icon files.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICON_DIR = join(__dirname, "..", "src", "components", "ui");

const ICONS = [
  { name: "linear", letter: "L", color: "#5E6AD2" },
  { name: "asana", letter: "A", color: "#F06A6A" },
  { name: "clickup", letter: "C", color: "#7B68EE" },
  { name: "productboard", letter: "P", color: "#6C3FC5" },
  { name: "testrail", letter: "T", color: "#65C179" },
  { name: "coda", letter: "C", color: "#FFC857" },
  { name: "outline", letter: "O", color: "#2F80ED" },
  { name: "slab", letter: "S", color: "#5C2DD5" },
  { name: "guru", letter: "G", color: "#00B0FF" },
  { name: "highspot", letter: "H", color: "#1E2A78" },
  { name: "document360", letter: "D", color: "#F15A29" },
  { name: "gitlab", letter: "G", color: "#FC6D26" },
  { name: "bitbucket", letter: "B", color: "#2684FF" },
  { name: "dropbox", letter: "D", color: "#0061FF" },
  { name: "zendesk", letter: "Z", color: "#03363D" },
  { name: "freshdesk", letter: "F", color: "#25C16F" },
  { name: "salesforce", letter: "S", color: "#00A1E0" },
  { name: "hubspot", letter: "H", color: "#FF7A59" },
  { name: "airtable", letter: "A", color: "#FFB400" },
  { name: "gong", letter: "G", color: "#6C3FC5" },
  { name: "egnyte", letter: "E", color: "#0098DC" },
  { name: "teams", letter: "T", color: "#4B53BC" },
  { name: "discord", letter: "D", color: "#5865F2" },
  { name: "bookstack", letter: "B", color: "#FB8E37" },
  { name: "gitbook", letter: "G", color: "#3884FF" },
  { name: "canvas-lms", letter: "C", color: "#E72327" },
  { name: "loopio", letter: "L", color: "#FF6B35" },
  { name: "discourse", letter: "D", color: "#000" },
  { name: "xenforo", letter: "X", color: "#106FAE" },
  { name: "drupal-wiki", letter: "D", color: "#0678BE" },
  { name: "axero", letter: "A", color: "#5B5FC7" },
  { name: "zulip", letter: "Z", color: "#52C2AF" },
  { name: "mediawiki", letter: "M", color: "#3366CC" },
  { name: "fireflies", letter: "F", color: "#FF5722" },
  { name: "wikipedia", letter: "W", color: "#000" },
];

function component(name, letter, color) {
  return `export function ${capitalize(name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()))}Icon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="${color}"/>
      <text x="12" y="16" textAnchor="middle" fontFamily="sans-serif" fontSize="13" fontWeight="700" fill="#fff">${letter}</text>
    </svg>
  );
}
`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function main() {
  await mkdir(ICON_DIR, { recursive: true });
  for (const i of ICONS) {
    const file = join(ICON_DIR, `${i.name}-icon.tsx`);
    await writeFile(file, component(i.name, i.letter, i.color));
    console.log(`Wrote ${i.name}-icon.tsx`);
  }
}

await main();
