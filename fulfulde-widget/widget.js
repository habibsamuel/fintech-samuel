import { translateLocally } from "./translations.js";

const HOST_ID = "fulfulde-translation-widget";
const STORAGE_KEY = "fulfulde-widget-position-v1";
const MAX_NODES = 400;
const MAX_BATCH_SIZE = 30;
const MAX_BATCH_CHARS = 12000;
const EXCLUDED_SELECTOR = [
  "script", "style", "noscript", "template", "svg", "canvas", "iframe",
  "input", "textarea", "select", "option", "button", "[contenteditable]",
  "[data-ffw-private]", "[data-sensitive]", "[aria-hidden='true']"
].join(",");

class FulfuldeTranslationWidget {
  constructor(config = {}) {
    this.config = config;
    this.host = document.createElement("div");
    this.host.id = HOST_ID;
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.originalText = new Map();
    this.dragState = null;
    this.suppressClick = false;
    this.isOpen = false;
    this.busy = false;
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.start();
  }

  async start() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", () => this.start(), { once: true });
      return;
    }
    const cssUrl = new URL("./widget.css", import.meta.url);
    let css = "";
    try {
      const response = await fetch(cssUrl, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`CSS HTTP ${response.status}`);
      css = await response.text();
    } catch (error) {
      console.error("Fulfulde widget: stylesheet could not be loaded.", error);
      return;
    }

    this.shadow.innerHTML = `${css}
      <div class="ffw-shell" part="shell">
        <section class="ffw-panel" id="ffw-panel" role="dialog" aria-labelledby="ffw-title" aria-describedby="ffw-description" hidden>
          <header class="ffw-header">
            <div class="ffw-brand">
              <span class="ffw-brand-icon" aria-hidden="true">A</span>
              <div><p class="ffw-brand-title" id="ffw-title">Traduction Fulfulde</p><p class="ffw-brand-subtitle">Outil d’accessibilité de la page</p></div>
            </div>
            <button class="ffw-close" type="button" aria-label="Fermer le panneau">×</button>
          </header>
          <div class="ffw-content">
            <p class="ffw-intro" id="ffw-description">Traduisez les textes visibles de cette page. Les champs de saisie et éléments sensibles sont ignorés.</p>
            <label class="ffw-consent"><input type="checkbox" id="ffw-consent"><span>J’autorise l’envoi des textes visibles à l’adaptateur de traduction de la banque. Sans cette autorisation, seul le glossaire local de démonstration est utilisé.</span></label>
            <span class="ffw-output-label" id="ffw-output-label">Aperçu</span>
            <div class="ffw-output" id="ffw-output" role="region" aria-labelledby="ffw-output-label" tabindex="0"></div>
            <p class="ffw-status" id="ffw-status" role="status" aria-live="polite">Prêt. Aucune donnée n’a été envoyée.</p>
            <div class="ffw-controls">
              <button class="ffw-button ffw-button-primary" id="ffw-translate" type="button">Traduire la page</button>
              <button class="ffw-button" id="ffw-restore" type="button" disabled>Restaurer</button>
            </div>
            <p class="ffw-footnote">La qualité des termes bancaires doit être validée par des locuteurs Fulfulde du Cameroun. Ne remplace pas les libellés officiels ou les informations contractuelles.</p>
          </div>
        </section>
        <button class="ffw-fab" id="ffw-fab" type="button" aria-label="Ouvrir le traducteur Fulfulde" aria-expanded="false" aria-controls="ffw-panel" title="Déplacer ou ouvrir le traducteur">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h10M9 3v2m1 0c-.5 4-2.7 7-6 9m2-5c1 2 2.8 3.8 5 5M14 19l3.2-8 3.3 8m-5.3-2h4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>`;
    document.body.append(this.host);
    this.panel = this.shadow.getElementById("ffw-panel");
    this.fab = this.shadow.getElementById("ffw-fab");
    this.status = this.shadow.getElementById("ffw-status");
    this.output = this.shadow.getElementById("ffw-output");
    this.translateButton = this.shadow.getElementById("ffw-translate");
    this.restoreButton = this.shadow.getElementById("ffw-restore");
    this.consent = this.shadow.getElementById("ffw-consent");
    this.bindEvents();
    this.restorePosition();
  }

  bindEvents() {
    this.fab.addEventListener("click", () => {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      this.setOpen(!this.isOpen);
    });
    this.shadow.querySelector(".ffw-close").addEventListener("click", () => this.setOpen(false));
    this.translateButton.addEventListener("click", () => this.translatePage());
    this.restoreButton.addEventListener("click", () => this.restorePage());
    this.fab.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.fab.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.fab.addEventListener("pointerup", (event) => this.onPointerUp(event));
    this.fab.addEventListener("pointercancel", () => { this.dragState = null; });
    this.fab.addEventListener("lostpointercapture", () => { this.dragState = null; });
    window.addEventListener("resize", () => this.clampPosition());
    document.addEventListener("keydown", this.handleKeyDown);
  }

  setOpen(open) {
    this.isOpen = open;
    this.panel.hidden = !open;
    this.fab.setAttribute("aria-expanded", String(open));
    this.updatePanelPlacement();
    if (open) this.shadow.querySelector(".ffw-close").focus();
    else this.fab.focus();
  }

  handleKeyDown(event) {
    if (event.key === "Escape" && this.isOpen) this.setOpen(false);
  }

  onPointerDown(event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const rect = this.host.getBoundingClientRect();
    this.dragState = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
    this.fab.setPointerCapture(event.pointerId);
  }

  onPointerMove(event) {
    const drag = this.dragState;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    this.suppressClick = true;
    const fabSize = this.fab.getBoundingClientRect().width || 58;
    const left = this.clamp(drag.left + dx, 6, Math.max(6, window.innerWidth - fabSize - 6));
    const top = this.clamp(drag.top + dy, 6, Math.max(6, window.innerHeight - fabSize - 6));
    this.setPosition(left, top);
  }

  onPointerUp(event) {
    if (!this.dragState || this.dragState.pointerId !== event.pointerId) return;
    const moved = this.dragState.moved;
    this.dragState = null;
    if (moved) {
      this.storePosition();
      this.updatePanelPlacement();
      setTimeout(() => { this.suppressClick = false; }, 0);
    }
  }

  setPosition(left, top) {
    this.host.style.left = `${left}px`;
    this.host.style.top = `${top}px`;
    this.host.style.right = "auto";
    this.host.style.bottom = "auto";
  }

  restorePosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) this.setPosition(saved.left, saved.top);
    } catch { /* local storage may be unavailable; use the default corner */ }
    this.clampPosition();
  }

  storePosition() {
    const rect = this.host.getBoundingClientRect();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: rect.left, top: rect.top })); } catch { /* optional preference */ }
  }

  clampPosition() {
    const rect = this.fab?.getBoundingClientRect();
    if (!rect) return;
    if (this.host.style.left) {
      this.setPosition(this.clamp(rect.left, 6, Math.max(6, innerWidth - rect.width - 6)), this.clamp(rect.top, 6, Math.max(6, innerHeight - rect.height - 6)));
    }
    this.updatePanelPlacement();
  }

  updatePanelPlacement() {
    if (!this.panel || !this.fab) return;
    const rect = this.fab.getBoundingClientRect();
    this.panel.classList.toggle("ffw-left", rect.left + rect.width / 2 < innerWidth / 2);
    this.panel.classList.toggle("ffw-below", rect.top < Math.min(390, innerHeight * 0.45));
  }

  clamp(value, min, max) { return Math.min(Math.max(value, min), max); }

  collectTextNodes() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const entries = [];
    let node;
    while ((node = walker.nextNode()) && entries.length < MAX_NODES) {
      const parent = node.parentElement;
      const original = node.nodeValue ?? "";
      if (!parent || !original.trim() || parent.closest(EXCLUDED_SELECTOR) || this.host.contains(parent)) continue;
      // Do not submit standalone numeric/currency strings or likely account identifiers.
      if (/^[\s\d.,+()\-/₣FCFA]+$/iu.test(original)) continue;
      entries.push({ node, original });
    }
    return entries;
  }

  makeBatches(entries) {
    const batches = [];
    let batch = [];
    let chars = 0;
    for (const entry of entries) {
      if (batch.length && (batch.length >= MAX_BATCH_SIZE || chars + entry.original.length > MAX_BATCH_CHARS)) {
        batches.push(batch);
        batch = [];
        chars = 0;
      }
      batch.push(entry);
      chars += entry.original.length;
    }
    if (batch.length) batches.push(batch);
    return batches;
  }

  async translateBatch(texts) {
    const hostTranslator = window.FulfuldeWidgetTranslate;
    const endpoint = this.config.translationEndpoint;
    if (this.consent.checked && typeof hostTranslator === "function") {
      const result = await hostTranslator(texts, { sourceLanguage: "fr", targetLanguage: "ff" });
      return this.validateTranslations(result, texts.length);
    }
    if (this.consent.checked && typeof endpoint === "string" && endpoint.trim()) {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ sourceLanguage: "fr", targetLanguage: "ff", texts })
      });
      if (!response.ok) throw new Error(`Service de traduction indisponible (HTTP ${response.status}).`);
      const payload = await response.json();
      return this.validateTranslations(payload?.translations, texts.length);
    }
    return translateLocally(texts);
  }

  validateTranslations(result, expectedLength) {
    if (!Array.isArray(result) || result.length !== expectedLength || result.some((text) => typeof text !== "string")) {
      throw new Error("Réponse de traduction invalide : le service doit retourner une chaîne par texte.");
    }
    return result;
  }

  async translatePage() {
    if (this.busy) return;
    const entries = this.collectTextNodes();
    if (!entries.length) {
      this.setStatus("Aucun texte de page admissible n’a été trouvé.");
      return;
    }
    this.busy = true;
    this.translateButton.disabled = true;
    this.setStatus(this.consent.checked ? "Traduction en cours… Le texte visible est envoyé au service configuré." : "Traduction locale en cours… Aucun texte n’est envoyé.");
    try {
      const batches = this.makeBatches(entries);
      const translated = [];
      for (const batch of batches) translated.push(...await this.translateBatch(batch.map(({ original }) => original)));
      entries.forEach(({ node, original }, index) => {
        if (!node.isConnected) return;
        if (!this.originalText.has(node)) this.originalText.set(node, original);
        node.nodeValue = translated[index];
      });
      this.output.textContent = translated.filter(Boolean).join(" ").slice(0, 6000);
      this.restoreButton.disabled = this.originalText.size === 0;
      const unchanged = translated.filter((text, index) => text === entries[index].original).length;
      this.setStatus(`Aperçu appliqué à ${entries.length} élément(s). ${unchanged} texte(s) sont restés inchangés (glossaire limité ou réponse identique).`);
    } catch (error) {
      console.error("Fulfulde widget translation failed.", error);
      this.setStatus(error instanceof Error ? error.message : "La traduction a échoué.", "error");
    } finally {
      this.busy = false;
      this.translateButton.disabled = false;
    }
  }

  restorePage() {
    let restored = 0;
    for (const [node, original] of this.originalText) {
      if (node.isConnected) { node.nodeValue = original; restored += 1; }
    }
    this.originalText.clear();
    this.output.textContent = "";
    this.restoreButton.disabled = true;
    this.setStatus(`${restored} texte(s) restauré(s).`);
  }

  setStatus(message, kind = "info") {
    this.status.textContent = message;
    this.status.dataset.kind = kind;
  }
}

function initialize() {
  if (document.getElementById(HOST_ID)) return;
  const config = window.FulfuldeWidgetConfig && typeof window.FulfuldeWidgetConfig === "object"
    ? window.FulfuldeWidgetConfig
    : {};
  new FulfuldeTranslationWidget(config);
}

initialize();
