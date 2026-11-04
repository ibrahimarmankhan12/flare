const serializeValue = (value: unknown): string => {
  if (value === null) return "null";

  const valueType = typeof value;
  if (valueType === "string") return JSON.stringify(value);
  if (valueType === "number") {
    return Number.isFinite(value as number) ? String(value) : "null";
  }
  if (valueType === "boolean") return value ? "true" : "false";
  if (valueType === "bigint") return JSON.stringify(String(value));

  if (Array.isArray(value)) {
    return `[${value
      .map((item) => {
        if (
          typeof item === "undefined" ||
          typeof item === "function" ||
          typeof item === "symbol"
        ) {
          return "null";
        }
        return serializeValue(item);
      })
      .join(",")}]`;
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toJSON());
  }

  if (valueType === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(
        ([, item]) =>
          typeof item !== "undefined" &&
          typeof item !== "function" &&
          typeof item !== "symbol",
      )
      .sort(([a], [b]) => a.localeCompare(b));

    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${serializeValue(item)}`)
      .join(",")}}`;
  }

  return "null";
};

export const stableJsonStringify = (value: unknown): string => {
  return serializeValue(value);
};
