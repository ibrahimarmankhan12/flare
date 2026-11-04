import type { User } from "./user";

export const ADMIN_USER_SEARCH_FIELDS = ["name", "email"] as const;
export type AdminUserSearchField = (typeof ADMIN_USER_SEARCH_FIELDS)[number];

export const ADMIN_USER_SEARCH_OPERATORS = [
  "contains",
  "starts_with",
  "ends_with",
] as const;
export type AdminUserSearchOperator =
  (typeof ADMIN_USER_SEARCH_OPERATORS)[number];

export const ADMIN_USER_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "name",
  "email",
  "role",
] as const;
export type AdminUserSortField = (typeof ADMIN_USER_SORT_FIELDS)[number];

export const ADMIN_USER_FILTER_FIELDS = [
  "name",
  "email",
  "role",
  "banned",
  "createdAt",
  "updatedAt",
] as const;
export type AdminUserFilterField = (typeof ADMIN_USER_FILTER_FIELDS)[number];

export const ADMIN_USER_FILTER_OPERATORS = [
  "lt",
  "eq",
  "ne",
  "lte",
  "gt",
  "gte",
  "contains",
] as const;
export type AdminUserFilterOperator =
  (typeof ADMIN_USER_FILTER_OPERATORS)[number];

export interface AdminUsersQuery {
  searchValue?: string;
  searchField?: AdminUserSearchField;
  searchOperator?: AdminUserSearchOperator;
  limit?: number;
  offset?: number;
  sortBy?: AdminUserSortField;
  sortDirection?: "asc" | "desc";
  filterField?: AdminUserFilterField;
  filterValue?: string | number | boolean;
  filterOperator?: AdminUserFilterOperator;
}

// Better Auth's UserWithRole type - minimal definition for list view
export type AdminUserListItem = Omit<
  User,
  | "password"
  | "preferences"
  | "image"
  | "role"
  | "tier"
  | "banned"
  | "banReason"
  | "banExpires"
> & {
  image?: string | null;
  role?: string | null;
  tier?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
};

export interface AdminUsersPaginated {
  users: AdminUserListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminUpdateUserDetailsData {
  userId: string;
  name?: string;
  email?: string;
  image?: string;
}

// Admin only repository methods
export type AdminRepository = {
  // User queries
  getUsers: (query?: AdminUsersQuery) => Promise<AdminUsersPaginated>;
  // Bulk user actions
  suspendUsers: (userIds: string[]) => Promise<void>;
  deleteUsers: (userIds: string[]) => Promise<void>;
};
