/*
 * chat-actions.js - ChatGPT-style action buttons under every answer:
 *   Copy | Regenerate | Like | Dislike | Read aloud
 * plus a floating "scroll to bottom" button on the side of the chat.
 *
 * It watches #conversation and adds the buttons to each new answer
 * automatically, so script.js doesn't need to change.
 */
(function () {
  "use strict";

  const CONVO_SELECTOR = "#conversation";
  const FORM_SELECTOR = "#searchForm";
  const INPUT_SELECTOR = "#queryInput";

  // How to find things inside one answer block. Adjust if your class names differ.
  const ANSWER_SELECTORS =
    ".answer, .answer-body, .answer-text, .answer-content, [class*='answer']";
  const QUESTION_SELECTORS =
    ".user-msg, .query, .question, .user-query, [class*='query'], [class*='question']";
  const LOADING_SELECTORS =
    ".loading, .spinner, .skeleton, [class*='loading'], [class*='spinner'], [class*='typing']";

  const svg = (inner) =>
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    inner +
    "</svg>";

  const ICON = {
    copy: svg(
      '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
        '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'
    ),
    check: svg('<polyline points="20 6 9 17 4 12"/>'),
    redo: svg(
      '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>' +
        '<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'
    ),
    up: svg(
      '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>'
    ),
    down: svg(
      '<path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>'
    ),
    speak: svg(
      '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>' +
        '<path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>'
    ),
    stop: svg('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
    arrow: svg('<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>'),
  };

  let convo, form, input;
  let lastQuery = "";

  /* ---------- helpers ---------- */

  function findAnswer(turn) {
    for (const el of turn.querySelectorAll(ANSWER_SELECTORS)) {
      if (!el.closest(".ca-bar") && el.innerText.trim()) return el;
    }
    return turn;
  }

  function findQuestion(turn, answer) {
    for (const el of turn.querySelectorAll(QUESTION_SELECTORS)) {
      if (el.closest(".ca-bar") || el.contains(answer) || answer.contains(el)) continue;
      const t = el.innerText.trim();
      if (t && t.length <= 300) return t;
    }
    return lastQuery;
  }

  function cleanText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(".ca-bar").forEach((n) => n.remove());
    return clone.innerText.trim();
  }

  function speechText(el) {
    return cleanText(el)
      .replace(/\[\d+\]/g, "") // citation markers like [1]
      .replace(/[`*#>|_~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function debounce(fn, ms) {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function button(title, icon, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ca-btn";
    b.title = title;
    b.setAttribute("aria-label", title);
    b.innerHTML = icon;
    b.addEventListener("click", onClick);
    return b;
  }

  /* ---------- the action bar ---------- */

  function makeBar(turn) {
    const bar = document.createElement("div");
    bar.className = "ca-bar";

    // Copy
    const copyBtn = button("Copy", ICON.copy, async () => {
      const text = cleanText(findAnswer(turn));
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      copyBtn.innerHTML = ICON.check;
      copyBtn.classList.add("active");
      setTimeout(() => {
        copyBtn.innerHTML = ICON.copy;
        copyBtn.classList.remove("active");
      }, 1500);
    });
    bar.appendChild(copyBtn);

    // Regenerate: re-run the same question
    bar.appendChild(
      button("Regenerate", ICON.redo, () => {
        const q = turn.dataset.caQuery;
        if (!q) return;
        input.value = q;
        if (form.requestSubmit) form.requestSubmit();
        else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      })
    );

    // Like / dislike (visual feedback, exclusive toggle)
    const up = button("Good answer", ICON.up, () => {
      up.classList.toggle("active");
      down.classList.remove("active");
    });
    const down = button("Bad answer", ICON.down, () => {
      down.classList.toggle("active");
      up.classList.remove("active");
    });
    bar.appendChild(up);
    bar.appendChild(down);

    // Read aloud
    if ("speechSynthesis" in window) {
      const speakBtn = button("Read aloud", ICON.speak, () => {
        const synth = window.speechSynthesis;
        if (speakBtn.classList.contains("active")) {
          synth.cancel();
          return;
        }
        synth.cancel();
        const u = new SpeechSynthesisUtterance(speechText(findAnswer(turn)));
        u.onstart = () => {
          speakBtn.classList.add("active");
          speakBtn.innerHTML = ICON.stop;
          speakBtn.title = "Stop reading";
        };
        const done = () => {
          speakBtn.classList.remove("active");
          speakBtn.innerHTML = ICON.speak;
          speakBtn.title = "Read aloud";
        };
        u.onend = done;
        u.onerror = done;
        synth.speak(u);
      });
      bar.appendChild(speakBtn);
    }

    return bar;
  }

  /* ---------- attach bars to new answers ---------- */

  function process() {
    Array.from(convo.children).forEach((turn) => {
      if (turn.querySelector(".ca-bar")) return; // already has one
      if (turn.querySelector(LOADING_SELECTORS)) return; // still loading
      const answer = findAnswer(turn);
      if (answer.innerText.trim().length < 20) return; // nothing to act on yet

      turn.dataset.caQuery = findQuestion(turn, answer);
      const bar = makeBar(turn);
      if (answer === turn) turn.appendChild(bar);
      else answer.insertAdjacentElement("afterend", bar);
    });
  }

  /* ---------- scroll-to-bottom button ---------- */

  function scroller() {
    let el = convo;
    while (el && el !== document.body) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 5) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function setupScrollButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ca-scroll";
    btn.title = "Scroll to bottom";
    btn.setAttribute("aria-label", "Scroll to bottom");
    btn.innerHTML = ICON.arrow;
    document.body.appendChild(btn);

    const distance = () => {
      const el = scroller();
      const isDoc = el === document.scrollingElement || el === document.documentElement;
      const view = isDoc ? window.innerHeight : el.clientHeight;
      return el.scrollHeight - el.scrollTop - view;
    };
    const update = () => btn.classList.toggle("show", distance() > 200);

    btn.addEventListener("click", () => {
      const el = scroller();
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });

    document.addEventListener("scroll", update, true); // catches any scroll container
    window.addEventListener("resize", update);
    new MutationObserver(debounce(update, 100)).observe(convo, {
      childList: true,
      subtree: true,
    });
    update();
  }

  /* ---------- init ---------- */

  function init() {
    convo = document.querySelector(CONVO_SELECTOR);
    form = document.querySelector(FORM_SELECTOR);
    input = document.querySelector(INPUT_SELECTOR);
    if (!convo || !form || !input) {
      console.warn("[chat-actions] could not find #conversation / #searchForm / #queryInput");
      return;
    }

    // remember the question at submit time (runs before script.js clears the box)
    form.addEventListener("submit", () => {
      lastQuery = input.value.trim();
    }, true);

    new MutationObserver(debounce(process, 150)).observe(convo, {
      childList: true,
      subtree: true,
    });
    process();
    setupScrollButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();