import { UsersTable } from "@/components/admin/users-table";
import {
  ADMIN_USER_LIST_LIMIT,
  ADMIN_USER_LIST_MAX_LIMIT,
  ADMIN_USER_SEARCH_MAX_LENGTH,
  DEFAULT_SORT_BY,
  DEFAULT_SORT_DIRECTION,
} from "lib/admin/server";
import { getAdminUsers } from "lib/admin/server";
import { requireAdminPermission } from "auth/permissions";
import { ADMIN_USER_SORT_FIELDS, AdminUserSortField } from "app-types/admin";
import { getSession } from "lib/auth/server";
import { redirect, unauthorized } from "next/navigation";

// Force dynamic rendering to avoid static generation issues with session
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    query?: string;
    role?: string;
    sortBy?: string;
    sortDirection?: "asc" | "desc";
  }>;
}

export default async function UserListPage({ searchParams }: PageProps) {
  // Redirect before rendering the page if the user is not an admin

  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = parseIntegerParam(params.page, {
    fallback: 1,
    min: 1,
    max: 1000,
  });
  const limit = parseIntegerParam(params.limit, {
    fallback: ADMIN_USER_LIST_LIMIT,
    min: 1,
    max: ADMIN_USER_LIST_MAX_LIMIT,
  });
  const offset = (page - 1) * limit;

  const sortBy =
    params.sortBy &&
    ADMIN_USER_SORT_FIELDS.includes(params.sortBy as AdminUserSortField)
      ? (params.sortBy as AdminUserSortField)
      : DEFAULT_SORT_BY;

  const sortDirection =
    params.sortDirection === "asc" || params.sortDirection === "desc"
      ? params.sortDirection
      : DEFAULT_SORT_DIRECTION;

  const normalizedQuery = normalizeQuery(params.query);

  const roleParam = params.role;
  const validRoles = ["admin", "editor", "user"] as const;
  const normalizedRole =
    roleParam && validRoles.includes(roleParam as (typeof validRoles)[number])
      ? (roleParam as (typeof validRoles)[number])
      : undefined;

  const result = await getAdminUsers({
    searchValue: normalizedQuery,
    searchField: "email",
    searchOperator: "contains",
    limit,
    offset,
    sortBy,
    sortDirection,
    filterField: normalizedRole ? "role" : undefined,
    filterOperator: "eq",
    filterValue: normalizedRole,
  });

  return (
    <UsersTable
      users={result.users}
      currentUserId={session.user.id}
      total={result.total}
      page={page}
      limit={limit}
      query={normalizedQuery}
      role={normalizedRole}
      baseUrl="/admin/users"
      sortBy={sortBy}
      sortDirection={sortDirection}
    />
  );
}

function parseIntegerParam(
  rawValue: string | undefined,
  options: { fallback: number; min: number; max: number },
): number {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isFinite(parsed)) return options.fallback;

  if (parsed < options.min) return options.min;
  if (parsed > options.max) return options.max;

  return parsed;
}

function normalizeQuery(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  return trimmed.slice(0, ADMIN_USER_SEARCH_MAX_LENGTH);
}
