export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Post media for Publish (private R2 bucket). */
  MEDIA: R2Bucket;
  JWT_SECRET: string;
  ADMIN_BOOTSTRAP_TOKEN?: string;
  META_ACCESS_TOKEN?: string;
  /** Shared secret for the Google Sheet sync (wrangler secret). Unset = sync disabled. */
  SHEET_SYNC_TOKEN?: string;
  /** Web-app URL of the Apps Script in the closing sheet (wrangler secret). Unset = "Sync now" skips the sheet. */
  SHEET_TRIGGER_URL?: string;
  APP_NAME: string;
  /** Base URL of the WhatsApp gateway (wa-gateway on the VPS). Unset = CRM shows "not configured". */
  WA_GATEWAY_URL?: string;
  /** Bearer token the gateway accepts (wrangler secret). */
  WA_GATEWAY_TOKEN?: string;
  /** Shopee Open Platform app (wrangler secrets). Unset = the Shopee card shows "not configured". */
  SHOPEE_PARTNER_ID?: string;
  SHOPEE_PARTNER_KEY?: string;
  /** Override of https://partner.shopeemobile.com (the sandbox host while testing). */
  SHOPEE_API_HOST?: string;
  /** Notion internal integration token (wrangler secret) and an optional override of the board's database id. */
  NOTION_TOKEN?: string;
  NOTION_DATABASE_ID?: string;
  /** Test-only override of https://graph.facebook.com for the Conversions API. */
  GRAPH_BASE?: string;
};

import type { ClientRole, StaffRole } from "../shared/permissions";
export type Role = "admin" | "client";

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
  client_id: number | null;
  /** Team members: owner | ads | content | crm. null for client logins (and for a team account with no role set, which gets no access). */
  staff_role: StaffRole | null;
  /** Client logins: viewer | approver. */
  client_role: ClientRole | null;
  /** The clients this person may reach: null = all (owners), otherwise exactly these ids. */
  client_ids: number[] | null;
};

// How the current request is allowed to see a client's data.
export type ClientAccess =
  | { type: "user"; user: AuthUser; clientId: number }
  | { type: "share"; clientId: number };

export type Vars = {
  user: AuthUser;
  access: ClientAccess;
};

export type AdAccountRow = {
  id: number;
  client_id: number;
  platform: string;
  meta_account_id: string;
  account_name: string | null;
  currency: string;
  timezone: string;
  status: string;
};

export type AccountSettingsRow = {
  ad_account_id: number;
  primary_result_type: string | null;
  primary_result_label: string | null;
  monthly_budget_idr: number | null;
  cpr_target: number | null;
  alert_config_json: string | null;
};
