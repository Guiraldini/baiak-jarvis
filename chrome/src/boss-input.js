(function (root) {
  "use strict";

  const gameUrl = /^https:\/\/(?:www\.)?baiakidle\.com\/jogar(?:\/|$)/i;
  const key = (name) => String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

  // Executada apenas no documento que iniciou a run. Nenhuma coordenada recebida
  // da página é usada: o botão é localizado e conferido novamente antes da entrada.
  function readEntryTarget(name, expectedCharges) {
    const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
    const fail = (error) => ({ error });
    const modal = document.querySelector("#boss-modal");
    if (!modal || !modal.getBoundingClientRect().width || !modal.getBoundingClientRect().height) return fail("A lista de chefes está fechada.");
    if (/boss|chefe/i.test(document.querySelector("#bar-shooters .bar-pvp-tag")?.textContent || "")
      || /(?:durante|during).*(?:boss|chefe)/i.test(document.querySelector("#party-manage")?.title || "")) return fail("Já existe uma luta em andamento.");
    if (document.querySelector("#confirm-modal .bdiff")?.getBoundingClientRect().width) return fail("O jogo está pedindo a dificuldade.");
    const charges = modal.querySelector(".boss-global:not(.boss-pass)")?.textContent.match(/(\d+)\s*\/\s*(\d+)/);
    if (!charges || Number(charges[1]) !== expectedCharges || expectedCharges <= 0) return fail("As cargas mudaram antes da entrada.");
    const cells = [...modal.querySelectorAll(".boss-pane-list .boss-cardgrid .boss-cell")]
      .filter((cell) => normalize(cell.querySelector(".boss-cell-name")?.textContent) === normalize(name));
    if (cells.length !== 1) return fail("Não foi possível identificar um único card desse chefe.");
    const cell = cells[0];
    const button = cell.querySelector(".boss-cell-go");
    if (!cell.classList.contains("expanded") || cell.classList.contains("locked") || cell.classList.contains("active")
      || !cell.querySelector(".boss-cell-fav.on") || !button || button.disabled) return fail("O favorito não está pronto para enfrentar.");
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    if (!rect.width || !rect.height || style.visibility !== "visible" || style.display === "none"
      || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || !button.contains(document.elementFromPoint(x, y))) return fail("O botão Enfrentar está oculto ou coberto.");
    return { x, y };
  }

  function createController(ext, { pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = () => Date.now(), token = () => crypto.randomUUID() } = {}) {
    const sessions = new Map();
    const authorized = (sender) => sender?.id === ext.runtime.id && sender.frameId === 0
      && typeof sender.documentId === "string" && Number.isInteger(sender.tab?.id) && gameUrl.test(sender.url || "") && gameUrl.test(sender.tab.url || "");
    const sessionFor = (message, sender) => {
      if (!authorized(sender)) throw new Error("A run só pode controlar a própria aba do Baiak.");
      const session = sessions.get(sender.tab.id);
      if (!session || session.token !== message.token || session.documentId !== sender.documentId || session.cancelled
        || now() - session.createdAt > 6 * 60 * 60 * 1000) throw new Error("A autorização desta run terminou. Clique em Iniciar run novamente.");
      return session;
    };
    async function target(session, name, charges) {
      if (session.cancelled) throw new Error("Run parada antes da entrada.");
      const tab = await ext.tabs.get(session.tabId);
      if (!gameUrl.test(tab.url || "")) throw new Error("A aba saiu do Baiak.");
      const results = await ext.scripting.executeScript({ target: { tabId: session.tabId, documentIds: [session.documentId] }, func: readEntryTarget, args: [name, charges] });
      const result = results?.[0]?.result;
      if (!result || result.error || !Number.isFinite(result.x) || !Number.isFinite(result.y)) throw new Error(result?.error || "Não consegui conferir o botão Enfrentar.");
      if (session.cancelled) throw new Error("Run parada antes da entrada.");
      return result;
    }
    async function close(session) {
      session.cancelled = true;
      await session.task?.catch(() => {});
      if (sessions.get(session.tabId) !== session) return;
      sessions.delete(session.tabId);
      await ext.debugger.detach({ tabId: session.tabId }).catch(() => {});
    }
    ext.debugger?.onDetach.addListener((source, reason) => {
      const session = sessions.get(source.tabId);
      if (!session) return;
      session.cancelled = true;
      sessions.delete(source.tabId);
      ext.tabs.sendMessage(source.tabId, { type: "bj:boss-input-detached", token: session.token, reason }, { documentId: session.documentId }).catch(() => {});
    });
    ext.tabs.onRemoved.addListener((tabId) => {
      const session = sessions.get(tabId);
      if (session) session.cancelled = true;
      sessions.delete(tabId);
    });

    async function handle(message, sender) {
      if (!authorized(sender)) throw new Error("A run só pode controlar a própria aba do Baiak.");
      if (!ext.debugger) throw new Error("O modo automático de chefes exige a permissão debugger no Chrome.");
      if (message.type === "bj:boss-input-start") {
        if (sessions.has(sender.tab.id)) throw new Error("Já existe uma run controlando esta aba.");
        const session = { tabId: sender.tab.id, documentId: sender.documentId, token: token(), createdAt: now(), lastSeen: now(), used: new Set(), cancelled: false, task: null };
        sessions.set(session.tabId, session);
        try {
          await ext.debugger.attach({ tabId: session.tabId }, "1.3");
          if (session.cancelled) throw new Error("O controle da run foi encerrado pelo navegador.");
          return { ok: true, token: session.token };
        } catch (error) {
          if (sessions.get(session.tabId) === session) sessions.delete(session.tabId);
          throw error;
        }
      }
      const session = sessionFor(message, sender);
      if (message.type === "bj:boss-input-status") return { ok: true };
      if (message.type === "bj:boss-input-end") {
        await close(session);
        return { ok: true };
      }
      if (message.type !== "bj:boss-input-click") throw new Error("Comando de entrada não permitido.");
      if (typeof message.name !== "string" || !message.name.trim() || message.name.length > 120
        || !Number.isInteger(message.charges) || message.charges <= 0) throw new Error("Chefe ou cargas inválidos.");
      if (session.task || session.used.has(key(message.name))) throw new Error("Esta entrada já foi solicitada. O Jarvis não vai repetir o clique.");
      session.used.add(key(message.name));
      const debuggee = { tabId: session.tabId };
      session.task = (async () => {
        let pressed = false;
        try {
          const point = await target(session, message.name, message.charges);
          await ext.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", { type: "mouseMoved", ...point, button: "none", buttons: 0, pointerType: "mouse" });
          await pause(120);
          const checked = await target(session, message.name, message.charges);
          if (Math.abs(point.x - checked.x) > 2 || Math.abs(point.y - checked.y) > 2) throw new Error("O botão mudou de posição antes do clique. A run parou.");
          if (session.cancelled) throw new Error("Run parada antes da entrada.");
          pressed = true;
          await ext.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", { type: "mousePressed", ...checked, button: "left", buttons: 1, clickCount: 1, pointerType: "mouse" });
          await pause(80);
          const released = await target(session, message.name, message.charges);
          if (Math.abs(checked.x - released.x) > 2 || Math.abs(checked.y - released.y) > 2) throw new Error("O botão mudou durante a entrada. A run parou.");
          await ext.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", { type: "mouseReleased", ...released, button: "left", buttons: 0, clickCount: 1, pointerType: "mouse" });
          pressed = false;
          return { ok: true };
        } finally {
          // Libera o mouse fora da página se a entrada foi interrompida.
          if (pressed) await ext.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", { type: "mouseReleased", x: -1, y: -1, button: "left", buttons: 0, clickCount: 1, pointerType: "mouse" }).catch(() => {});
        }
      })();
      try { return await session.task; } finally { session.task = null; }
    }
    return {
      handle,
      touch(sender) {
        const session = authorized(sender) && sessions.get(sender.tab.id);
        if (session && session.documentId === sender.documentId) session.lastSeen = now();
      },
      async sweep() {
        for (const session of sessions.values()) {
          if (now() - session.lastSeen > 3 * 60 * 1000 || now() - session.createdAt > 6 * 60 * 60 * 1000) await close(session);
        }
      }
    };
  }

  root.BaiakJarvisBossInput = { createController, readEntryTarget };
  if (typeof module !== "undefined") module.exports = root.BaiakJarvisBossInput;
})(globalThis);
