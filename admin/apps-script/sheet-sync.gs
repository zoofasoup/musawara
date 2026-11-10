/**
 * Musawara Ads: send the closing tabs of this sheet to the dashboard every hour.
 *
 * Setup (once): Extensions > Apps Script, paste this file, then
 *   1. Project Settings > Script properties > add  SYNC_TOKEN = <the secret you set on the Worker>
 *   2. Run `setup` once (approve the permissions). It creates the hourly trigger.
 *   3. Run `syncSales` once by hand to check: the Logs show how many sales were new.
 *
 * Dashboard only: this never sends anything to Meta. Sales you edited or deleted in the
 * dashboard are not overwritten. The token lives in Script properties, not in this code.
 */

const CONFIG = {
  url: "https://musawara-web.grabsite.workers.dev/api/sheet-sync",
  clientId: 1, // Musafar Tour & Travel
  // Tabs to read. "Juni" is left out on purpose (Juni_MSWR is the one in use); add a tab here when a new month starts.
  tabs: ["Mei", "Juni_MSWR", "Juli", "Agustus", "September", "Oktober", "November"],
};

function syncSales() {
  const token = PropertiesService.getScriptProperties().getProperty("SYNC_TOKEN");
  if (!token) throw new Error("Add SYNC_TOKEN under Project Settings > Script properties.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const sheets = [];
  CONFIG.tabs.forEach((name) => {
    const sh = ss.getSheetByName(name);
    if (!sh) { console.warn("Tab not found, skipped: " + name); return; }
    const rows = sh.getDataRange().getValues()
      .map((r) => {
        const cells = r.map((v) => {
          if (v instanceof Date) return Utilities.formatDate(v, tz, "yyyy-MM-dd HH:mm:ss");
          return v == null ? "" : String(v).trim();
        });
        while (cells.length && cells[cells.length - 1] === "") cells.pop();
        return cells;
      })
      .filter((r) => r.length > 0);
    sheets.push({ name, rows });
  });
  if (sheets.length === 0) throw new Error("None of the configured tabs exist.");

  const res = UrlFetchApp.fetch(CONFIG.url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({ client_id: CONFIG.clientId, sheets }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code !== 200) throw new Error("Dashboard answered " + code + ": " + res.getContentText().slice(0, 200));
  const out = JSON.parse(res.getContentText());
  if (out.error) throw new Error(out.error);
  console.log("Synced: " + out.inserted + " new, " + out.updated + " checked, " + out.skipped + " skipped, " + out.future + " future-dated.");
}

/** Run once: replaces any old trigger with one that runs syncSales every hour. */
function setup() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === "syncSales").forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("syncSales").timeBased().everyHours(1).create();
}
