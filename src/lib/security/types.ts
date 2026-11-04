/**
 * Request metadata captured from Cloudflare / Vercel headers.
 */
export type RequestMetadata = {
  ip: string;
  country: string | null;
  city: string | null;
  device: string;
  os: string;
  browser: string;
  userAgent: string;
  referer: string | null;
  timestamp: string;
};

/**
 * Security flags computed by comparing current metadata against
 * the user's historical events.
 */
export type SecurityFlags = {
  isNewDevice: boolean;
  isNewLocation: boolean;
};

/**
 * The event types we track in the security_event table.
 */
export type SecurityEventType =
  | "login"
  | "signup"
  | "password_change"
  | "api_key_create"
  | "account_update";

/**
 * Row shape for the security_event table.
 */
export type SecurityEvent = {
  id: string;
  userId: string;
  eventType: SecurityEventType;
  ip: string;
  country: string | null;
  city: string | null;
  device: string;
  os: string;
  browser: string;
  userAgent: string;
  referer: string | null;
  isNewDevice: boolean;
  isNewLocation: boolean;
  createdAt: Date;
};
