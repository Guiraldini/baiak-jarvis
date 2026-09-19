"use strict";

const ext = globalThis.browser || globalThis.chrome;

const heartbeats = new Map();
const errorSince = new Map();
const lastReload = new Map();
const GAME_URL = /^https:\/\/(?:www\.)?baiakidle\.com\/jogar\/?/i;
const RELOAD_COOLDOWN = 5 * 60 * 1000;

ext.alarms.get("bj-watchdog").then((alarm) => {
  if (!alarm) ext.alarms.create("bj-watchdog", { periodInMinutes: 1 });
});

async function reloadGameTab(tabId, reason) {
  const now = Date.now();
  if (now - (lastReload.get(tabId) || 0) < RELOAD_COOLDOWN) return false;
  const { bjSettings = {} } = await ext.storage.local.get({ bjSettings: {} });
  if (bjSettings.autoReload === false) return false;
  lastReload.set(tabId, now);
  heartbeats.set(tabId, now);
  errorSince.delete(tabId);
  await ext.storage.local.set({ bjRecovery: { at: now, reason } });
  await ext.tabs.reload(tabId);
  return true;
}

ext.runtime.onInstalled.addListener(() => {
  ext.alarms.create("bj-watchdog", { periodInMinutes: 1 });
});

ext.runtime.onStartup.addListener(() => {
  ext.alarms.create("bj-watchdog", { periodInMinutes: 1 });
});

ext.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "bj-watchdog") return;
  const tabs = await ext.tabs.query({ url: ["https://baiakidle.com/jogar/*", "https://www.baiakidle.com/jogar/*"] });
  const now = Date.now();
  for (const tab of tabs) {
    const seen = heartbeats.get(tab.id);
    if (seen && now - seen > 3 * 60 * 1000) await reloadGameTab(tab.id, "A página parou de responder.");
  }
});

ext.tabs.onRemoved.addListener((tabId) => {
  heartbeats.delete(tabId);
  errorSince.delete(tabId);
  lastReload.delete(tabId);
});

ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "bj:heartbeat" && _sender.tab?.id && GAME_URL.test(_sender.tab.url || "")) {
    const tabId = _sender.tab.id;
    const now = Date.now();
    heartbeats.set(tabId, now);
    if (message.online === false) {
      errorSince.delete(tabId);
      sendResponse({ ok: true });
      return false;
    }
    if (message.errorDetected || message.stalled) {
      const began = errorSince.get(tabId) || now;
      errorSince.set(tabId, began);
      if (now - began >= 30000) reloadGameTab(tabId, message.errorDetected ? "O jogo informou desconexão." : "O jogo ficou travado.");
    } else {
      errorSince.delete(tabId);
    }
    sendResponse({ ok: true });
    return false;
  }
  if (!message || message.type !== "bj:fetch-guide" || typeof message.url !== "string") return false;
  const allowed = /^https:\/\/guiabaiakidle\.com\/(?:fases\/)?[^?#]*\/?$/i.test(message.url);
  if (!allowed) {
    sendResponse({ ok: false, error: "URL de catálogo não permitida." });
    return false;
  }

  fetch(message.url, { credentials: "omit", cache: "force-cache" })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Catálogo respondeu ${response.status}`);
      sendResponse({ ok: true, html: await response.text(), url: response.url });
    })
    .catch((error) => sendResponse({ ok: false, error: error.message || "Falha ao consultar o catálogo." }));
  return true;
});
