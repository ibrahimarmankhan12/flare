export function normalizeCode(raw: string): string {
  let code = raw.trim();

  const fenceMatch = code.match(/^```(?:\w+)?\s*\n?([\s\S]*?)```$/);
  if (fenceMatch) {
    code = fenceMatch[1].trim();
  }

  if (/^async\s*\(/.test(code)) {
    return code;
  }

  if (!code.includes("return") && !code.includes(";")) {
    return `async () => ${code}`;
  }

  return `async () => {\n${code}\n}`;
}

export function sanitizeToolName(name: string): string {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
    return name;
  }
  let sanitized = name.replace(/[^a-zA-Z0-9_$]/g, "_");
  if (/^[0-9]/.test(sanitized)) {
    sanitized = "_" + sanitized;
  }
  const reserved = new Set([
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "export",
    "extends",
    "finally",
    "for",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "let",
    "new",
    "return",
    "super",
    "switch",
    "this",
    "throw",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "yield",
  ]);
  if (reserved.has(sanitized)) {
    sanitized += "_";
  }
  return sanitized;
}
