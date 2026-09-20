/*
 * attachments.js - file & image attachments for the search box.
 *
 * Adds: 📎 attach button, preview chips (image thumbnails / file icons),
 * drag & drop anywhere on the page, and paste-image-from-clipboard.
 *
 * Public API (use it in script.js when sending the search):
 *   Attachments.get()    -> array of File objects
 *   Attachments.count()  -> number of attached files
 *   Attachments.clear()  -> remove all attachments
 */
(function () {
  "use strict";

  // If your search box isn't detected, put its exact selector first here.
  const INPUT_SELECTOR =
    "#queryInput, #query, #query-input, #search-input, textarea, input[type='text']";

  const MAX_FILES = 5;
  const MAX_TOTAL_MB = 20;
  const ACCEPT =
    "image/*,.pdf,.docx,.txt,.md,.csv,.json,.xml,.yaml,.yml,.log," +
    ".py,.js,.html,.css,.java,.c,.cpp,.sql";
  const OK_EXT = new Set(
    ACCEPT.split(",").filter((x) => x.startsWith(".")).map((x) => x.slice(1))
  );

  let files = [];
  let strip, notice, fileInput;

  function isImage(f) {
    return f.type.startsWith("image/");
  }

  function extOf(name) {
    const i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
  }

  const svg = (inner, size) =>
    '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    inner + "</svg>";

  const UPLOAD_PATH =
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>';
  const FILE_PATH =
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>' +
    '<line x1="16" y1="17" x2="8" y2="17"/>';

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function allowed(f) {
    return isImage(f) || OK_EXT.has(extOf(f.name));
  }

  function say(msg) {
    notice.textContent = msg;
    notice.style.display = "block";
    clearTimeout(say._t);
    say._t = setTimeout(() => (notice.style.display = "none"), 4000);
  }

  function addFiles(list) {
    for (const f of Array.from(list)) {
      if (!allowed(f)) {
        say(`"${f.name}" isn't supported. Use images, PDF, DOCX, or text/code files.`);
        continue;
      }
      if (files.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (files.length >= MAX_FILES) {
        say(`You can attach up to ${MAX_FILES} files.`);
        break;
      }
      const total = files.reduce((n, x) => n + x.size, 0) + f.size;
      if (total > MAX_TOTAL_MB * 1024 * 1024) {
        say(`Attachments are limited to ${MAX_TOTAL_MB} MB in total.`);
        continue;
      }
      files.push(f);
    }
    render();
  }

  function removeAt(i) {
    files.splice(i, 1);
    render();
  }

  function clear() {
    files = [];
    render();
  }

  function render() {
    // free old thumbnail URLs
    strip.querySelectorAll("img[data-url]").forEach((img) =>
      URL.revokeObjectURL(img.dataset.url)
    );
    strip.querySelectorAll(".att-chip").forEach((c) => c.remove());
    strip.style.display = files.length ? "flex" : "none";

    files.forEach((f, i) => {
      const chip = document.createElement("div");
      chip.className = "att-chip";
      chip.title = f.name;

      if (isImage(f)) {
        const img = document.createElement("img");
        const url = URL.createObjectURL(f);
        img.src = url;
        img.dataset.url = url;
        img.alt = f.name;
        chip.appendChild(img);
      } else {
        const icon = document.createElement("span");
        icon.className = "att-icon";
        icon.innerHTML = svg(FILE_PATH, 26);
        chip.appendChild(icon);
      }

      const text = document.createElement("div");
      text.className = "att-text";
      const name = document.createElement("span");
      name.className = "att-name";
      name.textContent = f.name;
      const meta = document.createElement("span");
      meta.className = "att-meta";
      meta.textContent =
        (isImage(f) ? "Image" : extOf(f.name).toUpperCase() || "File") +
        " \u00B7 " + formatSize(f.size);
      text.appendChild(name);
      text.appendChild(meta);
      chip.appendChild(text);

      const x = document.createElement("button");
      x.type = "button";
      x.className = "att-remove";
      x.setAttribute("aria-label", "Remove " + f.name);
      x.textContent = "×";
      x.addEventListener("click", () => removeAt(i));
      chip.appendChild(x);

      strip.appendChild(chip);
    });
  }

  function init() {
    const input = document.querySelector(INPUT_SELECTOR);
    if (!input) {
      console.warn("[attachments] search box not found - set INPUT_SELECTOR in attachments.js");
      return;
    }
    const box = input.parentElement;

    // hidden real file picker
    fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.multiple = true;
    fileInput.accept = ACCEPT;
    fileInput.style.display = "none";
    fileInput.addEventListener("change", () => {
      addFiles(fileInput.files);
      fileInput.value = ""; // allow picking the same file again
    });
    document.body.appendChild(fileInput);

    // 📎 button
    const btn = document.createElement("button");
    btn.type = "button"; // never submits the form
    btn.className = "att-btn";
    btn.title = "Upload files or images";
    btn.setAttribute("aria-label", "Upload files or images");
    btn.innerHTML = svg(UPLOAD_PATH, 18) + '<span class="att-label">Upload</span>';
    btn.addEventListener("click", () => fileInput.click());
    box.insertBefore(btn, input);

    // preview strip + notice, shown above the search box
    strip = document.createElement("div");
    strip.className = "att-strip";
    strip.style.display = "none";
    notice = document.createElement("div");
    notice.className = "att-notice";
    notice.style.display = "none";
    box.parentElement.insertBefore(notice, box);
    box.parentElement.insertBefore(strip, box);

    // paste images / files straight into the box
    input.addEventListener("paste", (e) => {
      const pasted = e.clipboardData && e.clipboardData.files;
      if (pasted && pasted.length) {
        e.preventDefault();
        addFiles(pasted);
      }
    });

    // drag & drop anywhere on the page
    const overlay = document.createElement("div");
    overlay.className = "att-drop";
    overlay.innerHTML =
      '<div class="att-drop-card">' + svg(UPLOAD_PATH, 40) +
      "<span>Drop files or images to upload</span></div>";
    document.body.appendChild(overlay);

    let depth = 0;
    const hasFiles = (e) =>
      e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");

    document.addEventListener("dragenter", (e) => {
      if (!hasFiles(e)) return;
      depth++;
      overlay.classList.add("show");
    });
    document.addEventListener("dragleave", (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) overlay.classList.remove("show");
    });
    document.addEventListener("dragover", (e) => {
      if (hasFiles(e)) e.preventDefault();
    });
    document.addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      overlay.classList.remove("show");
      addFiles(e.dataTransfer.files);
    });
  }

  window.Attachments = {
    get: () => files.slice(),
    count: () => files.length,
    clear,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();