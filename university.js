(function () {
  const DATA_URL = "./institutions.json";
  const SUGGEST_LIMIT = 6;

  const statusEl = document.getElementById("status");
  const listEl = document.getElementById("list");
  const qEl = document.getElementById("q");
  const suggestEl = document.getElementById("suggest");
  const searchWrapEl = document.getElementById("searchWrap");

  let all = [];

  function esc(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function norm(s) {
    return String(s || "").trim().toLowerCase();
  }

  function labelLevel(v) {
    return v === "bachelor" ? "бакалавр" : v === "master" ? "магистр" : v;
  }

  function labelFormat(v) {
    return v === "online" ? "онлайн" : v === "offline" ? "офлайн" : v;
  }

  function renderInstitution(inst) {
    const cities = (inst.cities || []).join(", ");
    const fields = inst.fields || [];
    const levels = (inst.levels || []).map(labelLevel).join(", ");
    const formats = (inst.formats || []).map(labelFormat).join(", ");
    const langs = (inst.languages || []).join(", ");

    const tagsHtml = fields.map((f) => `<span class="tag">${esc(f)}</span>`).join("");

    const websiteHtml = inst.website
      ? `<a href="${esc(inst.website)}" target="_blank" rel="noopener noreferrer">${esc(inst.website)}</a>`
      : "<span class=\"muted\">—</span>";

    return `
      <div class="inst" id="inst-${esc(inst.id)}">
        <div class="row"><b>${esc(inst.name)}</b> <span class="muted">(${esc(inst.id)})</span></div>
        <div class="row"><span class="muted">Города:</span> ${esc(cities || "—")}</div>
        <div class="row"><span class="muted">Уровни:</span> ${esc(levels || "—")}</div>
        <div class="row"><span class="muted">Форматы:</span> ${esc(formats || "—")}</div>
        <div class="row"><span class="muted">Языки:</span> ${esc(langs || "—")}</div>
        <div class="row"><span class="muted">Сайт:</span> ${websiteHtml}</div>
        <div class="row">${tagsHtml}</div>
      </div>
    `;
  }

  function showSuggest(html) {
    suggestEl.innerHTML = html;
    suggestEl.style.display = "block";
  }

  function hideSuggest() {
    suggestEl.style.display = "none";
    suggestEl.innerHTML = "";
  }

  function highlightMatch(name, q) {
    const n = String(name);
    const idx = n.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0 || !q) return esc(n);
    const before = esc(n.slice(0, idx));
    const mid = esc(n.slice(idx, idx + q.length));
    const after = esc(n.slice(idx + q.length));
    return `${before}<span class="mark">${mid}</span>${after}`;
  }

  function matchInstitutions(query) {
    const q = norm(query);
    if (!q) return [];

    const starts = [];
    const contains = [];

    for (const inst of all) {
      const name = norm(inst.name);
      if (!name) continue;

      if (name.startsWith(q)) starts.push(inst);
      else if (name.includes(q)) contains.push(inst);
    }

    return starts.concat(contains).slice(0, SUGGEST_LIMIT);
  }

  function renderSuggest(query) {
    const q = norm(query);

    if (q.length < 2) {
      hideSuggest();
      return;
    }

    const items = matchInstitutions(q);

    if (!items.length) {
      showSuggest(`<div class="suggestEmpty">Ничего не найдено</div>`);
      return;
    }

    const html = items
      .map((inst) => {
        const cities = (inst.cities || []).join(", ");
        const formats = (inst.formats || []).map(labelFormat).join(", ");
        return `
          <div class="suggestItem" data-id="${esc(inst.id)}">
            <div class="suggestTitle">${highlightMatch(inst.name, query)}</div>
            <div class="suggestMeta">${esc(cities || "—")} · ${esc(formats || "—")}</div>
          </div>
        `;
      })
      .join("");

    showSuggest(html);
  }


  function scrollToInstitution(id) {
    const el = document.getElementById("inst-" + id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.style.boxShadow = "0 0 0 3px rgba(255, 230, 0, 0.35)";
    setTimeout(() => (el.style.boxShadow = ""), 900);
  }

  async function loadData() {
    statusEl.textContent = "Загрузка…";
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("JSON должен быть массивом институтов");
    return data;
  }

  function renderAll() {
    statusEl.textContent = `Загружено: ${all.length}`;
    listEl.innerHTML = all.map(renderInstitution).join("");
  }

  function bindSearch() {
    qEl.addEventListener("input", () => {
      renderSuggest(qEl.value);
    });

    suggestEl.addEventListener("mousedown", (e) => {
      const item = e.target.closest(".suggestItem");
      if (!item) return;
      const id = item.getAttribute("data-id");
      const inst = all.find((x) => x.id === id);
      if (inst) {
        qEl.value = inst.name;
        hideSuggest();
        scrollToInstitution(id);
      }
    });

    qEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const items = matchInstitutions(qEl.value);
      if (items.length) {
        qEl.value = items[0].name;
        hideSuggest();
        scrollToInstitution(items[0].id);
      }
    });

    document.addEventListener("mousedown", (e) => {
      if (!searchWrapEl.contains(e.target)) hideSuggest();
    });

    qEl.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideSuggest();
    });

  }

  async function main() {
    try {
      all = await loadData();
      renderAll();
      bindSearch();
    } catch (err) {
      statusEl.textContent = "Ошибка загрузки данных";
      listEl.innerHTML = `<div class="inst"><b>Ошибка:</b> ${esc(err && err.message ? err.message : err)}</div>`;
    }
  }

  main();
})();