export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Post media for Publish (private R2 bucket). */
  MEDIA: R2Bucket;
  JWT_SECRET: string;
  META_ACCESS_TOKEN?: string;
  /** Shared secret for the Google Sheet sync (wrangler secret). Unset = sync disabled. */
  SHEET_SYNC_TOKEN?: string;
  APP_NAME: string;
  /** Test-only override of https://graph.facebook.com for the Conversions API. */
  GRAPH_BASE?: string;
};

export type Role = "admin" | "client";

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
  client_id: number | null;
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
