const form = document.getElementById("searchForm");
const input = document.getElementById("queryInput");
const submitBtn = document.getElementById("submitBtn");
const conversation = document.getElementById("conversation");
const emptyState = document.getElementById("emptyState");
const newChatBtn = document.getElementById("newChatBtn");
const sidebar = document.getElementById("sidebar");
const openSidebarBtn = document.getElementById("openSidebarBtn");
const closeSidebarBtn = document.getElementById("closeSidebarBtn");
const historyBtn = document.getElementById("historyBtn");
const historyList = document.getElementById("historyList");

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function linkifyCitations(html, sources) {
  return html.replace(/\[(\d+)\]/g, (match, num) => {
    const idx = parseInt(num, 10) - 1;
    const src = sources[idx];
    if (!src) return match;
    return `<a class="cite" href="${escapeHtml(src.url)}" target="_blank" rel="noopener">[${num}]</a>`;
  });
}

function renderSources(sources) {
  if (!sources || sources.length === 0) return "";
  const chips = sources
    .map(
      (s, i) => `
      <a class="source-chip" href="${escapeHtml(s.url)}" target="_blank" rel="noopener">
        <span class="num">${i + 1}</span>${escapeHtml(s.title || s.url)}
      </a>`
    )
    .join("");
  return `<div class="sources-row">${chips}</div>`;
}

function renderRelated(related) {
  if (!related || related.length === 0) return "";
  const items = related
    .map((q) => `<button class="related-q" data-q="${encodeURIComponent(q)}">${escapeHtml(q)}</button>`)
    .join("");
  return `
    <div class="related-block">
      <div class="related-title">Related</div>
      ${items}
    </div>`;
}

function renderFiles(names) {
  if (!names || names.length === 0) return "";
  return `<div class="user-files">📎 ${names.map(escapeHtml).join(", ")}</div>`;
}

function renderTurn(turnEl, data) {
  const rawHtml = marked.parse(data.answer || "");
  const citedHtml = linkifyCitations(rawHtml, data.sources || []);

  turnEl.innerHTML = `
    <div class="user-msg">${escapeHtml(data.query)}</div>
    ${renderFiles(data.attachments)}
    ${renderSources(data.sources)}
    <div class="answer-box">${citedHtml}</div>
    ${renderRelated(data.related_questions)}
  `;

  turnEl.querySelectorAll(".related-q").forEach((btn) => {
    btn.addEventListener("click", () => {
      const q = decodeURIComponent(btn.dataset.q);
      runSearch(q);
    });
  });
}

// ---------------------------------------------------------------------------
// Search (text + optional files/images)
// ---------------------------------------------------------------------------
async function runSearch(query, files = []) {
  emptyState.style.display = "none";
  closeSidebar();

  const fileNames = files.map((f) => f.name);
  const shownQuery = query || "Describe and summarize the attached file(s).";

  const turn = document.createElement("div");
  turn.className = "turn";
  turn.innerHTML = `
    <div class="user-msg">${escapeHtml(shownQuery)}</div>
    ${renderFiles(fileNames)}
    <div class="loading">${files.length ? "Reading your files and thinking..." : "Searching the web and thinking..."}</div>
  `;
  conversation.appendChild(turn);
  conversation.scrollTop = conversation.scrollHeight;

  submitBtn.disabled = true;

  try {
    // multipart/form-data so files can be sent; do NOT set Content-Type manually
    const fd = new FormData();
    fd.append("query", query);
    files.forEach((f) => fd.append("files", f));

    const res = await fetch("/api/search", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({ error: `Server error (${res.status})` }));

    if (data.error) {
      turn.innerHTML = `<div class="user-msg">${escapeHtml(shownQuery)}</div><div class="answer-box">Error: ${escapeHtml(data.error)}</div>`;
      return;
    }

    renderTurn(turn, data);
    loadHistory(); // refresh sidebar with the new entry
  } catch (err) {
    turn.innerHTML = `<div class="user-msg">${escapeHtml(shownQuery)}</div><div class="answer-box">Something went wrong: ${escapeHtml(err)}</div>`;
  } finally {
    submitBtn.disabled = false;
    conversation.scrollTop = conversation.scrollHeight;
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const query = input.value.trim();
  const files = window.Attachments ? Attachments.get() : [];
  if (!query && files.length === 0) return;
  input.value = "";
  if (window.Attachments) Attachments.clear();
  runSearch(query, files);
});

newChatBtn.addEventListener("click", async () => {
  await fetch("/api/new-chat", { method: "POST" });
  conversation.innerHTML = "";
  emptyState.style.display = "flex";
  closeSidebar();
});

// ---------------------------------------------------------------------------
// Sidebar (works whether your CSS makes it a slide-in drawer or a fixed panel)
// ---------------------------------------------------------------------------
const sidebarStyle = document.createElement("style");
sidebarStyle.textContent = `
  .sidebar.collapsed { display: none !important; }
  .app-shell:has(.sidebar.collapsed) { grid-template-columns: 1fr !important; }
  .sidebar.force-open {
    display: flex !important; flex-direction: column;
    position: fixed !important; top: 0; left: 0; bottom: 0;
    width: 290px; max-width: 85vw; transform: none !important;
    z-index: 1000; box-shadow: 0 0 30px rgba(0,0,0,0.5);
  }
  .sidebar-backdrop { position: fixed; inset: 0; z-index: 999; display: none; background: rgba(0,0,0,0.25); }
  .sidebar-backdrop.show { display: block; }
`;
document.head.appendChild(sidebarStyle);

const backdrop = document.createElement("div");
backdrop.className = "sidebar-backdrop";
backdrop.addEventListener("click", () => closeSidebar());
document.body.appendChild(backdrop);

function isShown(el) {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return cs.display !== "none" && cs.visibility !== "hidden" &&
    r.width > 0 && r.right > 1 && r.left < window.innerWidth - 1;
}

function isDrawer() {
  const p = getComputedStyle(sidebar).position;
  return p === "fixed" || p === "absolute";
}

function sidebarIsOpen() {
  return sidebar.classList.contains("open") || sidebar.classList.contains("force-open");
}

function openSidebar() {
  sidebar.classList.remove("collapsed");
  sidebar.classList.add("open");
  // If the page's own CSS didn't actually reveal it, force it into view.
  setTimeout(() => {
    if (sidebar.classList.contains("open") && !isShown(sidebar)) {
      if (getComputedStyle(sidebar).backgroundColor === "rgba(0, 0, 0, 0)") {
        sidebar.style.background = getComputedStyle(document.body).backgroundColor || "#111";
      }
      sidebar.classList.add("force-open");
      backdrop.classList.add("show");
    }
  }, 400);
  if (isDrawer()) backdrop.classList.add("show");
}

function closeSidebar() {
  sidebar.classList.remove("open", "force-open");
  sidebar.style.background = "";
  backdrop.classList.remove("show");
}

function toggleSidebar() {
  if (isDrawer() || sidebar.classList.contains("force-open")) {
    sidebarIsOpen() ? closeSidebar() : openSidebar();
  } else {
    // permanent side panel: hide / show it
    sidebar.classList.toggle("collapsed");
  }
}

openSidebarBtn.addEventListener("click", toggleSidebar);
closeSidebarBtn.addEventListener("click", closeSidebar);
historyBtn.addEventListener("click", openSidebar);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSidebar();
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
async function loadHistory() {
  try {
    const res = await fetch("/api/history");
    const items = await res.json();

    if (!items || items.length === 0) {
      historyList.innerHTML = `<div class="history-empty">No searches yet</div>`;
      return;
    }

    historyList.innerHTML = items
      .map(
        (item) => `
        <div class="history-item" data-id="${item.id}">
          <span class="h-text">${escapeHtml(item.query)}</span>
          <button class="h-delete" data-id="${item.id}" title="Delete">🗑</button>
        </div>`
      )
      .join("");

    historyList.querySelectorAll(".history-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.classList.contains("h-delete")) return;
        const item = items.find((i) => String(i.id) === el.dataset.id);
        if (item) showHistoryItem(item);
      });
    });

    historyList.querySelectorAll(".h-delete").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await fetch(`/api/history/${btn.dataset.id}`, { method: "DELETE" });
        loadHistory();
      });
    });
  } catch (err) {
    historyList.innerHTML = `<div class="history-empty">Couldn't load history</div>`;
  }
}

function showHistoryItem(item) {
  emptyState.style.display = "none";
  conversation.innerHTML = "";
  const turn = document.createElement("div");
  turn.className = "turn";
  conversation.appendChild(turn);
  renderTurn(turn, item);
  closeSidebar();
}

// Load history on page load so the sidebar is populated immediately.
loadHistory();