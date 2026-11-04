import { jsonSchema, type Tool } from "ai";
import z4 from "zod/v4";

type ValidatorResult =
  | { success: true; value: unknown }
  | { success: false; error: Error };

type SchemaLike = {
  jsonSchema: unknown;
  validate?: (value: unknown) => Promise<ValidatorResult>;
};

const isSchemaLike = (value: unknown): value is SchemaLike =>
  !!value && typeof value === "object" && "jsonSchema" in value;

const isZodSchema = (value: unknown): boolean =>
  !!value &&
  typeof value === "object" &&
  ("_def" in (value as any) || "_zod" in (value as any));

const resolveSchemaJson = (schema: SchemaLike): unknown => {
  const raw = schema.jsonSchema;
  return typeof raw === "function" ? raw() : raw;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const getSchemaJson = (inputSchema: unknown): unknown | undefined => {
  if (!inputSchema) return undefined;
  if (isSchemaLike(inputSchema)) return resolveSchemaJson(inputSchema);
  if (isZodSchema(inputSchema)) {
    return z4.toJSONSchema(inputSchema as any, {
      target: "draft-7",
      io: "output",
      reused: "inline",
    });
  }
  return undefined;
};

const getSchemaValidator = (
  inputSchema: unknown,
): ((value: unknown) => Promise<ValidatorResult>) | undefined => {
  if (!inputSchema || typeof inputSchema !== "object") return undefined;
  const maybeSchema = inputSchema as SchemaLike;
  if (typeof maybeSchema.validate === "function") return maybeSchema.validate;
  if (isZodSchema(inputSchema)) {
    return async (value: unknown) => {
      const result = await (inputSchema as any).safeParseAsync(value);
      if (result.success) {
        return { success: true, value: result.data };
      }
      const error =
        result.error instanceof Error
          ? result.error
          : new Error(String(result.error));
      return { success: false, error };
    };
  }
  return undefined;
};

const hasPropertyNames = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasPropertyNames(item));
  }
  const record = value as Record<string, unknown>;
  if ("propertyNames" in record) return true;
  return Object.values(record).some((item) => hasPropertyNames(item));
};

const stripPropertyNames = (value: unknown): unknown => {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripPropertyNames(item));
  }
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    if (key === "propertyNames") continue;
    result[key] = stripPropertyNames(item);
  }
  return result;
};

export const sanitizeJsonSchema = (schema: unknown): unknown => {
  if (!hasPropertyNames(schema)) return schema;
  return stripPropertyNames(schema);
};

export const normalizeToolInputSchema = (
  schema: unknown,
): Record<string, unknown> => {
  const sanitized = sanitizeJsonSchema(schema);
  if (!isPlainObject(sanitized)) {
    if (sanitized == null) {
      return {
        type: "object",
        properties: {},
        additionalProperties: true,
      };
    }
    return {
      type: "object",
      properties: {
        value: sanitized,
      },
      required: ["value"],
      additionalProperties: false,
    };
  }

  const base = sanitized as Record<string, unknown>;
  const properties = isPlainObject(base.properties) ? base.properties : {};
  const required = Array.isArray(base.required)
    ? base.required.filter((value) => typeof value === "string" && value)
    : [];

  const additionalProperties =
    typeof base.additionalProperties === "boolean" ||
    isPlainObject(base.additionalProperties)
      ? base.additionalProperties
      : false;

  if (base.type && base.type !== "object") {
    return {
      type: "object",
      properties: {
        value: sanitized,
      },
      required: ["value"],
      additionalProperties: false,
    };
  }

  return {
    ...base,
    type: "object",
    properties,
    required,
    additionalProperties,
  };
};

export const sanitizeToolSchema = <T extends Tool>(tool: T): T => {
  const rawSchema = getSchemaJson(tool.inputSchema);
  if (!rawSchema) return tool;
  const normalized = normalizeToolInputSchema(rawSchema);
  const validate = getSchemaValidator(tool.inputSchema);
  const wrappedSchema = jsonSchema(
    normalized,
    validate ? { validate } : undefined,
  );
  return { ...tool, inputSchema: wrappedSchema } as T;
};

export const sanitizeToolSchemas = <T extends Record<string, Tool>>(
  tools: T,
): T => {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      sanitizeToolSchema(tool),
    ]),
  ) as T;
};
