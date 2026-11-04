import { z } from "zod";

export const USER_NAME_MAX_LENGTH = 100;

// Allow common human name characters while blocking payload-like punctuation.
const USER_NAME_ALLOWED_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\p{M}\s.'-]{0,99}$/u;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

export const userNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(USER_NAME_MAX_LENGTH, "Name is too long")
  .refine(
    (value) => !CONTROL_CHAR_PATTERN.test(value),
    "Name contains invalid control characters",
  )
  .refine(
    (value) => USER_NAME_ALLOWED_PATTERN.test(value),
    "Name contains unsupported characters",
  )
  .refine(
    (value) => !/\s{2,}/.test(value),
    "Name cannot contain repeated spaces",
  );
