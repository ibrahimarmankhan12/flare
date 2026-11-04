import {
  AdminRepository,
  AdminUserFilterField,
  AdminUserFilterOperator,
  AdminUserSortField,
  AdminUsersQuery,
  AdminUsersPaginated,
} from "app-types/admin";
import { pgDb as db } from "../db.pg";
import { UserTable, SessionTable } from "../schema.pg";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  getTableColumns,
  ilike,
  inArray,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";

// Helper function to get user columns without password
const getUserColumnsWithoutPassword = () => {
  const { password, ...userColumns } = getTableColumns(UserTable);
  return userColumns;
};

const pgAdminRepository: AdminRepository = {
  getUsers: async (query?: AdminUsersQuery): Promise<AdminUsersPaginated> => {
    const {
      searchValue,
      limit = 10,
      offset = 0,
      sortBy = "createdAt",
      sortDirection = "desc",
      filterField,
      filterValue,
      filterOperator = "eq",
    } = query || {};

    // Base query with user columns (excluding password) and last login
    const baseQuery = db
      .select({
        ...getUserColumnsWithoutPassword(),
        lastLogin: sql<Date | null>`(
          SELECT MAX(${SessionTable.updatedAt}) 
          FROM ${SessionTable} 
          WHERE ${SessionTable.userId} = ${UserTable.id}
        )`.as("lastLogin"),
      })
      .from(UserTable);

    // Build WHERE conditions
    const whereConditions: any[] = [];

    // Search across multiple fields (case insensitive)
    if (searchValue && searchValue.trim()) {
      const searchTerm = `%${searchValue.trim()}%`;
      whereConditions.push(
        or(
          ilike(UserTable.name, searchTerm),
          ilike(UserTable.email, searchTerm),
        ),
      );
    }

    // Apply filters
    if (filterField && filterValue !== undefined) {
      const filterCondition = buildFilterCondition(
        filterField,
        filterValue,
        filterOperator,
      );
      if (filterCondition) {
        whereConditions.push(filterCondition);
      }
    }

    // Build the final WHERE clause
    const whereClause =
      whereConditions.length > 0
        ? whereConditions.length === 1
          ? whereConditions[0]
          : and(...whereConditions)
        : undefined;

    // Build ORDER BY
    const orderByClause = buildOrderBy(sortBy, sortDirection);

    // Execute main query
    const usersQueryBuilder = baseQuery
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);
    const users = whereClause
      ? await usersQueryBuilder.where(whereClause)
      : await usersQueryBuilder;

    // Get total count with same WHERE conditions
    const countQueryBuilder = db.select({ count: count() }).from(UserTable);
    const [totalResult] = whereClause
      ? await countQueryBuilder.where(whereClause)
      : await countQueryBuilder;

    return {
      users: users.map((user) => ({
        ...user,
        preferences: undefined, // Exclude preferences from admin list
      })),
      total: totalResult?.count || 0,
      limit,
      offset,
    };
  },

  suspendUsers: async (userIds: string[]): Promise<void> => {
    if (userIds.length === 0) return;
    await db
      .update(UserTable)
      .set({ banned: true, updatedAt: new Date() })
      .where(inArray(UserTable.id, userIds));
  },

  deleteUsers: async (userIds: string[]): Promise<void> => {
    if (userIds.length === 0) return;
    await db.delete(UserTable).where(inArray(UserTable.id, userIds));
  },
};

// Helper function to build filter conditions
function buildFilterCondition(
  field: AdminUserFilterField,
  value: string | number | boolean,
  operator: AdminUserFilterOperator,
) {
  if (field === "name" || field === "email" || field === "role") {
    const normalizedTextValue =
      typeof value === "string" ? value.trim() : String(value);
    if (!normalizedTextValue) return null;

    const column =
      field === "name"
        ? UserTable.name
        : field === "email"
          ? UserTable.email
          : UserTable.role;

    if (operator === "contains") {
      return ilike(column, `%${normalizedTextValue}%`);
    }

    return buildComparableCondition(column, normalizedTextValue, operator);
  }

  if (field === "banned") {
    const normalizedBooleanValue = normalizeBooleanValue(value);
    if (normalizedBooleanValue === null) return null;
    return buildComparableCondition(
      UserTable.banned,
      normalizedBooleanValue,
      operator,
    );
  }

  if (field === "createdAt" || field === "updatedAt") {
    const normalizedDateValue = normalizeDateValue(value);
    if (!normalizedDateValue) return null;
    const column =
      field === "createdAt" ? UserTable.createdAt : UserTable.updatedAt;
    return buildComparableCondition(column, normalizedDateValue, operator);
  }

  return null;
}

// Helper function to build ORDER BY clause
function buildOrderBy(sortBy: AdminUserSortField, direction: "asc" | "desc") {
  // Map common sort fields to actual columns
  let column;
  switch (sortBy) {
    case "name":
      column = UserTable.name;
      break;
    case "email":
      column = UserTable.email;
      break;
    case "role":
      column = UserTable.role;
      break;
    case "createdAt":
      column = UserTable.createdAt;
      break;
    case "updatedAt":
      column = UserTable.updatedAt;
      break;
    default:
      // Default to createdAt if invalid sortBy
      column = UserTable.createdAt;
      break;
  }
  return direction === "asc" ? asc(column) : desc(column);
}

function buildComparableCondition(
  column: any,
  value: string | number | boolean | Date,
  operator: AdminUserFilterOperator,
) {
  switch (operator) {
    case "eq":
      return eq(column, value);
    case "ne":
      return ne(column, value);
    case "lt":
      return lt(column, value);
    case "lte":
      return lte(column, value);
    case "gt":
      return gt(column, value);
    case "gte":
      return gte(column, value);
    case "contains":
      return null;
    default:
      return eq(column, value);
  }
}

function normalizeBooleanValue(
  value: string | number | boolean,
): boolean | null {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return null;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return null;
}

function normalizeDateValue(value: string | number | boolean): Date | null {
  if (typeof value === "boolean") return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export default pgAdminRepository;
