// What differs on screen in the CRM copy (VITE_APP_MODE=crm), and what must stay as it was on the platform. Run by vitest,
// which supplies import.meta.env; screens are rendered to a string, so effects (polling, redirects) do not run.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({ role: "owner", polled: [] as Array<string | null>, accounts: [] as unknown[] }));
vi.mock("./context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1, role: "admin", staff_role: state.role, client_id: null } }) }));
vi.mock("./pages/crm/inbox/util", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useLive: (path: string | null) => {
    state.polled.push(path);
    return { data: path === "/accounts" ? state.accounts : undefined, error: undefined, loaded: true, reload: async () => {} };
  },
}));

async function load(mode: "crm" | "", host = "toko.example.com") {
  vi.resetModules();
  vi.stubEnv("VITE_APP_MODE", mode);
  vi.stubGlobal("window", { location: { hostname: host, origin: `https://${host}` } });
  state.polled = [];
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const account = (over: Record<string, unknown> = {}) => ({ id: 2, name: "Sales", client_id: 1, status: "ready", phone: null, wa_name: null, since: null, error: null, is_default: false, ...over });

async function numbersPage(role: string, accounts: unknown[]) {
  state.role = role;
  const { AccountsContext } = await import("./pages/crm/accounts");
  const { CrmConnection } = await import("./pages/crm/CrmConnection");
  const value = { accounts: accounts as any, clients: [], reload: () => {}, selectedId: null, select: () => {} };
  return renderToStaticMarkup(createElement(AccountsContext.Provider, { value }, createElement(CrmConnection)));
}
const OWNER_BUTTONS = [">Add number<", ">Rename<", ">Restart<", ">Log out<", ">Delete<"];
const has = (html: string, label: string) => new RegExp(label.slice(1, -1) + "(<|$)").test(html);

describe("links an Owner hands out", () => {
  it("stay on the copy's own address, even on a *.musawara.id host", async () => {
    await load("crm", "toko.musawara.id");
    const { homeOrigin } = await import("./lib/api");
    expect(homeOrigin("admin").startsWith("https://toko.musawara.id")).toBe(true);
    expect(homeOrigin("client").startsWith("https://toko.musawara.id")).toBe(true);
  });
  it("still point to app. and portal. on the platform", async () => {
    await load("", "app.musawara.id");
    const { homeOrigin } = await import("./lib/api");
    expect(homeOrigin("admin")).toBe("https://app.musawara.id");
    expect(homeOrigin("client")).toBe("https://portal.musawara.id");
  });
});

describe("Numbers page", () => {
  it("CRM copy: staff see no Owner controls and do not ask for the status they are refused", async () => {
    await load("crm");
    const html = await numbersPage("crm", [account()]);
    for (const label of OWNER_BUTTONS) expect(has(html, label), label).toBe(false);
    expect(html).toContain("Use in CRM");
    expect(state.polled).toEqual([null]);
  });
  it("CRM copy: staff with no number are not told to add one", async () => {
    await load("crm");
    const html = await numbersPage("crm", []);
    expect(html).not.toContain("Add your first number");
    expect(html).toContain("No WhatsApp number is available to you yet. Please tell an Owner.");
  });
  it("CRM copy: the Owner keeps the controls, and a non-default card has no empty paragraph", async () => {
    await load("crm");
    const html = await numbersPage("owner", [account()]);
    for (const label of OWNER_BUTTONS) expect(has(html, label), label).toBe(true);
    expect(html).not.toMatch(/<p[^>]*><\/p>/);
    expect(state.polled).toEqual(["/accounts/2/status"]);
  });
  it("platform: the page is the same for every role", async () => {
    await load("");
    const html = await numbersPage("crm", [account()]);
    for (const label of OWNER_BUTTONS) expect(has(html, label), label).toBe(true);
    expect(state.polled).toEqual(["/accounts/2/status"]);
  });
});

describe("CRM frame with no number for a staff member", () => {
  async function frame() {
    state.role = "crm";
    state.accounts = [];
    const { CrmLayout } = await import("./pages/crm/CrmLayout");
    return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/crm/inbox"] }, createElement(CrmLayout, null, "page")));
  }
  it("CRM copy: does not promise a linking control", async () => {
    await load("crm");
    const html = await frame();
    expect(html).toContain("Please tell an Owner.");
    expect(html).not.toContain("link one");
  });
  it("platform: wording unchanged", async () => {
    await load("");
    expect(await frame()).toContain("Ask an Owner to link one.");
  });
});
