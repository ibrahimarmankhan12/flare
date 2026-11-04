import "server-only";

import { getSession } from "lib/auth/server";
import {
  ADMIN_USER_FILTER_FIELDS,
  ADMIN_USER_FILTER_OPERATORS,
  ADMIN_USER_SEARCH_FIELDS,
  ADMIN_USER_SEARCH_OPERATORS,
  ADMIN_USER_SORT_FIELDS,
  AdminUsersQuery,
  AdminUsersPaginated,
} from "app-types/admin";
import {
  requireAdminPermission,
  requireUserListPermission,
} from "lib/auth/permissions";
import pgAdminRepository from "lib/db/pg/repositories/admin-respository.pg";

export const ADMIN_USER_LIST_LIMIT = 10;
export const ADMIN_USER_LIST_MAX_LIMIT = 50;
export const ADMIN_USER_LIST_MAX_OFFSET = 10_000;
export const ADMIN_USER_SEARCH_MAX_LENGTH = 120;
export const DEFAULT_SORT_BY = "createdAt";
export const DEFAULT_SORT_DIRECTION = "desc";

const SORT_FIELD_SET = new Set(ADMIN_USER_SORT_FIELDS);
const SEARCH_FIELD_SET = new Set(ADMIN_USER_SEARCH_FIELDS);
const SEARCH_OPERATOR_SET = new Set(ADMIN_USER_SEARCH_OPERATORS);
const FILTER_FIELD_SET = new Set(ADMIN_USER_FILTER_FIELDS);
const FILTER_OPERATOR_SET = new Set(ADMIN_USER_FILTER_OPERATORS);

/**
 * Require an admin session
 * This is a wrapper around the getSession function
 * that throws an error if the user is not an admin
 *
 * @deprecated Use requireAdminPermission() from lib/auth/permissions instead
 */
export async function requireAdminSession(): Promise<
  NonNullable<Awaited<ReturnType<typeof getSession>>>
> {
  const session = await getSession();

  if (!session) {
    throw new Error("Unauthorized: No session found");
  }

  // Use our new permission system internally
  await requireAdminPermission("access admin functions");

  return session;
}

/**
 * Get paginated users using our custom repository with improved search capabilities
 * Only admins can list and search users
 */
export async function getAdminUsers(
  query?: AdminUsersQuery,
): Promise<AdminUsersPaginated> {
  // Use our new permission system
  await requireUserListPermission("list users in admin panel");

  try {
    const normalizedQuery = normalizeAdminUsersQuery(query);

    // Use our custom repository with improved search
    const result = await pgAdminRepository.getUsers(normalizedQuery);

    return result;
  } catch (error) {
    console.error("Error getting admin users", error);
    throw error;
  }
}

function normalizeAdminUsersQuery(query?: AdminUsersQuery): AdminUsersQuery {
  const limit = clampInteger(
    query?.limit,
    1,
    ADMIN_USER_LIST_MAX_LIMIT,
    ADMIN_USER_LIST_LIMIT,
  );
  const offset = clampInteger(query?.offset, 0, ADMIN_USER_LIST_MAX_OFFSET, 0);

  const sortBy =
    query?.sortBy && SORT_FIELD_SET.has(query.sortBy)
      ? query.sortBy
      : DEFAULT_SORT_BY;

  const sortDirection = query?.sortDirection === "asc" ? "asc" : "desc";

  const searchValue = normalizeOptionalString(
    query?.searchValue,
    ADMIN_USER_SEARCH_MAX_LENGTH,
  );

  const searchField =
    query?.searchField && SEARCH_FIELD_SET.has(query.searchField)
      ? query.searchField
      : undefined;

  const searchOperator =
    query?.searchOperator && SEARCH_OPERATOR_SET.has(query.searchOperator)
      ? query.searchOperator
      : undefined;

  const filterField =
    query?.filterField && FILTER_FIELD_SET.has(query.filterField)
      ? query.filterField
      : undefined;

  const filterOperator =
    query?.filterOperator && FILTER_OPERATOR_SET.has(query.filterOperator)
      ? query.filterOperator
      : undefined;

  const filterValue = normalizeFilterValue(query?.filterValue);

  return {
    limit,
    offset,
    sortBy,
    sortDirection,
    searchValue,
    searchField,
    searchOperator,
    filterField:
      filterField && filterValue !== undefined ? filterField : undefined,
    filterOperator:
      filterField && filterValue !== undefined ? filterOperator : undefined,
    filterValue:
      filterField && filterValue !== undefined ? filterValue : undefined,
  };
}

function clampInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;

  const normalized = Math.trunc(value as number);
  if (normalized < min) return min;
  if (normalized > max) return max;

  return normalized;
}

function normalizeOptionalString(
  value: string | undefined,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  return trimmed.slice(0, maxLength);
}

function normalizeFilterValue(
  value: string | number | boolean | undefined,
): string | number | boolean | undefined {
  if (typeof value === "string") {
    return normalizeOptionalString(value, ADMIN_USER_SEARCH_MAX_LENGTH);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return undefined;
}
