import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Image from "next/image";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LogIn } from "lucide-react";

type TocItem = {
  id: string;
  title: string;
};

const POLICY_PATH = path.join(
  process.cwd(),
  "legal-consent",
  "flare-cookies-policy.md",
);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const getText = (node: unknown): string => {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getText).join("");
  if (typeof node === "object" && "props" in node && node.props) {
    return getText(
      (node as { props?: { children?: unknown } }).props?.children,
    );
  }
  return "";
};

const extractMeta = (raw: string) => {
  const effective = raw.match(/\*\*Effective Date:\*\*\s*(.+)/)?.[1]?.trim();
  const lastUpdated = raw.match(/\*\*Last Updated:\*\*\s*(.+)/)?.[1]?.trim();
  const version = raw.match(/\*\*Version:\*\*\s*(.+)/)?.[1]?.trim();
  return { effective, lastUpdated, version };
};

const stripEmbeddedToc = (raw: string) =>
  raw
    .replace(/^#\s+Cookies Policy\s*$/m, "")
    .replace(/\*\*Effective Date:\*\*.+\n?/g, "")
    .replace(/\*\*Last Updated:\*\*.+\n?/g, "")
    .replace(/\*\*Version:\*\*.+\n?/g, "")
    .replace(/##\s+Table of Contents[\s\S]*?(?=\n##\s+1\.)/m, "")
    .replace(/^\s*---\s*$/gm, "")
    .trim();

const buildToc = (content: string): TocItem[] => {
  const matches = content.matchAll(/^##\s+(.+)$/gm);
  const items: TocItem[] = [];

  for (const match of matches) {
    const title = match[1]?.trim();
    if (!title) continue;
    items.push({ title, id: slugify(title) });
  }

  return items;
};

export const metadata: Metadata = {
  title: "Cookies Policy | Flare AI",
  description:
    "Understand how Flare AI uses cookies and how you can manage them.",
};

export default async function CookiesPolicyPage() {
  const rawMarkdown = await readFile(POLICY_PATH, "utf8");
  const meta = extractMeta(rawMarkdown);
  const markdown = stripEmbeddedToc(rawMarkdown);
  const toc = buildToc(markdown);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-zinc-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-16 pt-10 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-6 border-b border-zinc-800 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="group flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-zinc-800">
              <Image
                src="/flare-logo-192.webp"
                alt="Flare AI logo"
                fill
                priority
                sizes="40px"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="leading-tight">
              <p className="text-sm uppercase tracking-[0.12em] text-zinc-400">
                Flare AI
              </p>
              <p className="text-lg font-semibold text-white">Cookies Policy</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/40">
              Effective: {meta.effective ?? "N/A"}
            </span>
            <Link
              href="/sign-in"
              className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/10 transition hover:bg-white/10 hover:ring-white/30"
            >
              <LogIn className="h-4 w-4" />
              Login
            </Link>
          </div>
        </header>

        <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
          <aside className="sticky top-8 h-fit rounded-2xl border border-white/5 bg-white/[0.03] p-4 shadow-[0_10px_60px_-40px_rgba(0,0,0,0.6)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">Topics</p>
              <span className="rounded-full bg-white/5 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-zinc-400">
                Navigate
              </span>
            </div>
            <nav className="space-y-1 text-sm">
              {toc.map((item) => (
                <Link
                  key={item.id}
                  href={`#${item.id}`}
                  className="block rounded-lg px-3 py-2 text-zinc-300 transition hover:bg-white/5 hover:text-white"
                >
                  {item.title}
                </Link>
              ))}
            </nav>
          </aside>

          <article className="space-y-8">
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-6 shadow-[0_10px_60px_-40px_rgba(0,0,0,0.6)]">
              <p className="text-sm text-zinc-300">Cookie transparency.</p>
              <p className="mt-2 text-xl font-semibold text-white">
                This Cookies Policy explains what cookies are, how Flare uses
                them, and how you can manage your preferences.
              </p>
              <div className="mt-3 text-xs text-zinc-400">
                Last Updated: {meta.lastUpdated ?? "N/A"}
                {meta.version ? ` | Version: ${meta.version}` : ""}
              </div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-[0_10px_60px_-40px_rgba(0,0,0,0.6)]">
              <div className="prose prose-invert max-w-none prose-zinc prose-headings:text-white prose-p:text-zinc-200 prose-strong:text-white prose-a:text-emerald-300 prose-a:no-underline hover:prose-a:underline prose-li:text-zinc-200 prose-hr:border-zinc-800">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h2: ({ children, ...props }) => {
                      const title = getText(children);
                      const id = slugify(title);
                      return (
                        <h2
                          id={id}
                          className="scroll-mt-24 border-t border-zinc-800 pt-8"
                          {...props}
                        >
                          {children}
                        </h2>
                      );
                    },
                    h3: ({ children, ...props }) => (
                      <h3 className="pt-2 text-white" {...props}>
                        {children}
                      </h3>
                    ),
                    table: ({ children }) => (
                      <div className="my-4 overflow-x-auto rounded-xl border border-zinc-800">
                        <table className="min-w-full">{children}</table>
                      </div>
                    ),
                    th: ({ children }) => (
                      <th className="bg-zinc-900 px-3 py-2 text-left text-xs uppercase tracking-wide text-zinc-300">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="border-t border-zinc-800 px-3 py-2 text-sm text-zinc-200">
                        {children}
                      </td>
                    ),
                  }}
                >
                  {markdown}
                </ReactMarkdown>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
