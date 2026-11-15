// Client report: one combined view of ads, organic and sales for a period.
// Tenant isolation comes from clientAccess (session, client user or share token).

import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { clientAccess } from "../middleware";

const report = new Hono<{ Bindings: Env; Variables: Vars }>();
report.use("/:clientId/*", clientAccess);
report.use("/:clientId", clientAccess);

export default report;
