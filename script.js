// ====== Storage helpers ======
const LS_KEY = "pkm_inventory_v1";
const LS_RULES = "pkm_rules_v1";

function loadInventory() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) ?? []; }
  catch { return []; }
}
function saveInventory(items) {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}
function loadRules() {
  try {
    return JSON.parse(localStorage.getItem(LS_RULES)) ?? {
      marginPct: 20,
      feePct: 0,
      useMarket: true,
      capToMarket: false
    };
  } catch {
    return { marginPct: 20, feePct: 0, useMarket: true, capToMarket: false };
  }
}
function saveRules(rules) {
  localStorage.setItem(LS_RULES, JSON.stringify(rules));
}

// ====== Money formatting ======
const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ====== Suggested price / profit ======
// Base formula:
// suggested = buy * (1 + margin) / (1 - fee)
// profit = sell * (1 - fee) - buy
function calcSuggested({ buy, cm, ebay, marginPct, feePct, useMarket, capToMarket }) {
  buy = Math.max(0, toNum(buy));
  cm = Math.max(0, toNum(cm));
  ebay = Math.max(0, toNum(ebay));

  const margin = Math.max(0, toNum(marginPct)) / 100;
  const fee = Math.min(0.95, Math.max(0, toNum(feePct)) / 100);

  const base = buy === 0 ? 0 : (buy * (1 + margin) / (1 - fee));

  const marketVals = [cm, ebay].filter(x => x > 0);
  const marketAvg = marketVals.length ? (marketVals.reduce((a,b)=>a+b,0) / marketVals.length) : 0;

  let suggested = base;

  if (useMarket && marketAvg > 0) {
    // almeno 90% della media mercato
    suggested = Math.max(suggested, marketAvg * 0.90);

    // cap opzionale a +10% sulla media
    if (capToMarket) suggested = Math.min(suggested, marketAvg * 1.10);
  }

  return round2(suggested);
}

function calcProfit({ buy, sell, feePct }) {
  buy = Math.max(0, toNum(buy));
  sell = Math.max(0, toNum(sell));
  const fee = Math.min(0.95, Math.max(0, toNum(feePct)) / 100);
  return round2(sell * (1 - fee) - buy);
}

function profitClass(p) {
  if (p > 0.01) return "good";
  if (p < -0.01) return "bad";
  return "mid";
}

// ====== App state ======
let inventory = loadInventory();
let rules = loadRules();

// ====== DOM ======
const $ = (id) => document.getElementById(id);

const form = $("cardForm");
const suggestedOut = $("suggestedOut");
const profitOut = $("profitOut");

const marginPctEl = $("marginPct");
const feePctEl = $("feePct");
const useMarketEl = $("useMarket");
const capToMarketEl = $("capToMarket");

const searchEl = $("search");
const sortByEl = $("sortBy");

const tbody = $("tbody");
const rowsCountEl = $("rowsCount");
const qtyTotalEl = $("qtyTotal");
const buyTotalEl = $("buyTotal");
const profitTotalEl = $("profitTotal");

const exportBtn = $("exportBtn");
const importFile = $("importFile");
const clearBtn = $("clearBtn");

// ====== Init rules UI ======
marginPctEl.value = rules.marginPct ?? 20;
feePctEl.value = rules.feePct ?? 0;
useMarketEl.checked = !!rules.useMarket;
capToMarketEl.checked = !!rules.capToMarket;

// ====== Google search buttons (Cardmarket / eBay) ======
const searchCardmarketBtn = $("searchCardmarketBtn");
const searchEbayBtn = $("searchEbayBtn");

function buildSearchQueryForGoogle() {
  const name = $("name").value.trim();
  const set = $("set").value.trim();
  const number = $("number").value.trim();
  const lang = $("lang").value.trim();

  // includo "pokemon" per risultati più puliti
  const parts = ["pokemon", name, set, number, lang].filter(Boolean);
  return parts.join(" ");
}

function openGoogleSearch(siteFilter) {
  const q = buildSearchQueryForGoogle();
  if (!q || q === "pokemon") {
    alert("Compila almeno il nome della carta prima di cercare.");
    return;
  }
  const fullQuery = `${q} ${siteFilter}`;
  const url = `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

searchCardmarketBtn.addEventListener("click", () => {
  openGoogleSearch("site:cardmarket.com");
});

searchEbayBtn.addEventListener("click", () => {
  const q = buildSearchQueryForGoogle(); // usa la stessa query "pokemon + nome + set + numero + lingua"
  if (!q || q === "pokemon") {
    alert("Compila almeno il nome della carta prima di cercare.");
    return;
  }

  // Ricerca diretta su eBay Italia
  const url = `https://www.ebay.it/sch/i.html?_nkw=${encodeURIComponent(q)}`;
  window.open(url, "_blank", "noopener,noreferrer");
});


// ====== Live preview for form (suggested + profit) ======
const liveInputs = ["buy","sell","cardmarket","ebay"];
liveInputs.forEach(id => $(id).addEventListener("input", updateLivePreview));
[marginPctEl, feePctEl, useMarketEl, capToMarketEl].forEach(el => el.addEventListener("input", () => {
  rules = readRulesFromUI();
  saveRules(rules);
  updateLivePreview();
  render();
}));

function readRulesFromUI() {
  return {
    marginPct: toNum(marginPctEl.value),
    feePct: toNum(feePctEl.value),
    useMarket: useMarketEl.checked,
    capToMarket: capToMarketEl.checked
  };
}

function updateLivePreview() {
  const buy = toNum($("buy").value);
  const cm = toNum($("cardmarket").value);
  const ebay = toNum($("ebay").value);

  const suggested = calcSuggested({
    buy, cm, ebay,
    marginPct: rules.marginPct,
    feePct: rules.feePct,
    useMarket: rules.useMarket,
    capToMarket: rules.capToMarket
  });

  const manualSell = $("sell").value.trim() === "" ? 0 : toNum($("sell").value);
  const sellToUse = manualSell > 0 ? manualSell : suggested;

  const p = calcProfit({ buy, sell: sellToUse, feePct: rules.feePct });

  suggestedOut.textContent = suggested > 0 ? eur.format(suggested) : "—";

  // ✅ profitto anche con buy=0 (o in generale buy>=0)
  // mostriamo profitto se almeno uno tra buy/sell è stato inserito
  const shouldShow = ($("buy").value.trim() !== "" || $("sell").value.trim() !== "" || $("cardmarket").value.trim() !== "" || $("ebay").value.trim() !== "");
  profitOut.textContent = shouldShow ? eur.format(p) : "—";
  profitOut.className = shouldShow ? profitClass(p) : "";
}

// ====== Add item ======
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const item = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    name: $("name").value.trim(),
    set: $("set").value.trim(),
    number: $("number").value.trim(),
    condition: $("condition").value,
    qty: Math.max(1, Math.floor(toNum($("qty").value) || 1)),
    lang: $("lang").value.trim(),
    cardmarket: round2(toNum($("cardmarket").value)),
    ebay: round2(toNum($("ebay").value)),
    buy: round2(toNum($("buy").value)), // ✅ può essere 0
    // if user left blank, we store 0 (we'll use suggested in calculations)
    sell: $("sell").value.trim() === "" ? 0 : round2(toNum($("sell").value)),
  };

  if (!item.name) return;

  inventory.unshift(item);
  saveInventory(inventory);

  form.reset();
  $("qty").value = 1;

  // reset condizione default
  $("condition").value = "near mint";

  updateLivePreview();
  render();
});

// ====== Render table ======
function getViewItems() {
  const q = searchEl.value.trim().toLowerCase();
  let items = [...inventory];

  if (q) {
    items = items.filter(it => {
      const blob = `${it.name} ${it.set} ${it.number} ${it.condition} ${it.lang}`.toLowerCase();
      return blob.includes(q);
    });
  }

  const sort = sortByEl.value;

  const withComputed = items.map(it => {
    const suggested = calcSuggested({
      buy: it.buy,
      cm: it.cardmarket,
      ebay: it.ebay,
      marginPct: rules.marginPct,
      feePct: rules.feePct,
      useMarket: rules.useMarket,
      capToMarket: rules.capToMarket
    });

    const sellToUse = it.sell > 0 ? it.sell : suggested;
    const profit = calcProfit({ buy: it.buy, sell: sellToUse, feePct: rules.feePct });

    return { ...it, suggested, sellToUse, profit };
  });

  withComputed.sort((a,b) => {
    switch (sort) {
      case "name_asc": return a.name.localeCompare(b.name);
      case "profit_desc": return (b.profit - a.profit);
      case "buy_desc": return (b.buy - a.buy);
      case "sell_desc": return (b.sellToUse - a.sellToUse);
      case "createdAt_desc":
      default: return b.createdAt - a.createdAt;
    }
  });

  return withComputed;
}

function render() {
  const items = getViewItems();

  tbody.innerHTML = items.map(it => {
    const profCls = profitClass(it.profit);
    const cm = it.cardmarket > 0 ? eur.format(it.cardmarket) : "—";
    const eb = it.ebay > 0 ? eur.format(it.ebay) : "—";
    const sellShown = it.sell > 0 ? it.sell : 0;

    return `
      <tr data-id="${it.id}">
        <td>
          <div><strong>${escapeHtml(it.name)}</strong></div>
          <div class="muted small">${escapeHtml(it.lang || "")}</div>
        </td>
        <td>${escapeHtml(it.set || "—")}</td>
        <td>${escapeHtml(it.number || "—")}</td>
        <td><span class="badge">${escapeHtml(it.condition)}</span></td>
        <td>${it.qty}</td>
        <td>${cm}</td>
        <td>${eb}</td>
        <td>${eur.format(it.buy)}</td>
        <td>${it.suggested > 0 ? eur.format(it.suggested) : "—"}</td>
        <td class="cell-edit" title="Clicca per modificare">
          ${sellShown > 0 ? eur.format(sellShown) : `<span class="muted">auto</span> (${eur.format(it.sellToUse)})`}
        </td>
        <td class="profit ${profCls}">${eur.format(it.profit)}</td>
        <td>
          <button class="iconBtn" data-action="delete" title="Elimina">✕</button>
        </td>
      </tr>
    `;
  }).join("");

  // Totals
  const rowCount = items.length;
  const qtyTotal = items.reduce((s,it)=> s + (it.qty||0), 0);
  const buyTotal = items.reduce((s,it)=> s + (it.buy||0) * (it.qty||1), 0);
  const profitTotal = items.reduce((s,it)=> s + (it.profit||0) * (it.qty||1), 0);

  rowsCountEl.textContent = String(rowCount);
  qtyTotalEl.textContent = String(qtyTotal);
  buyTotalEl.textContent = eur.format(round2(buyTotal));
  profitTotalEl.textContent = eur.format(round2(profitTotal));

  // Bind row actions (delete + inline edit)
  bindRowEvents();
}

function bindRowEvents() {
  tbody.querySelectorAll("button[data-action='delete']").forEach(btn => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const id = tr?.dataset?.id;
      if (!id) return;
      inventory = inventory.filter(x => x.id !== id);
      saveInventory(inventory);
      render();
    });
  });

  tbody.querySelectorAll(".cell-edit").forEach(td => {
    td.addEventListener("click", () => startInlineEdit(td));
  });
}

function startInlineEdit(td) {
  const tr = td.closest("tr");
  const id = tr?.dataset?.id;
  if (!id) return;

  const item = inventory.find(x => x.id === id);
  if (!item) return;

  if (td.querySelector("input")) return;

  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "0.01";
  input.value = item.sell > 0 ? item.sell : "";
  input.placeholder = "Lascia vuoto = auto";
  input.style.width = "160px";

  td.innerHTML = "";
  td.appendChild(input);
  input.focus();

  const commit = () => {
    const v = input.value.trim();
    item.sell = v === "" ? 0 : round2(toNum(v));
    saveInventory(inventory);
    render();
  };
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") render();
  });
}

// ====== Search/sort ======
searchEl.addEventListener("input", render);
sortByEl.addEventListener("change", render);

// ====== Export / Import ======
exportBtn.addEventListener("click", () => {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    rules,
    inventory
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `magazzino-pokemon-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

importFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (data && Array.isArray(data.inventory)) {
      inventory = data.inventory;
      saveInventory(inventory);
    }
    if (data && data.rules) {
      rules = { ...rules, ...data.rules };
      saveRules(rules);

      marginPctEl.value = rules.marginPct ?? 20;
      feePctEl.value = rules.feePct ?? 0;
      useMarketEl.checked = !!rules.useMarket;
      capToMarketEl.checked = !!rules.capToMarket;
    }

    render();
    updateLivePreview();
  } catch {
    alert("File non valido o JSON corrotto.");
  } finally {
    importFile.value = "";
  }
});

// ====== Clear ======
clearBtn.addEventListener("click", () => {
  const ok = confirm("Sicuro di voler eliminare tutto? (Non si può annullare)");
  if (!ok) return;
  inventory = [];
  saveInventory(inventory);
  render();
});

// ====== Utilities ======
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ====== Boot ======
rules = readRulesFromUI();
saveRules(rules);
updateLivePreview();
render();
