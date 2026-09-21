# Perplexed — A Perplexity AI Clone
### MCA Short-Term Internship Project (Generative AI Engineering)

An AI-powered search engine with user accounts and saved search history.
A small planning agent decides, per question, whether to do live web
retrieval, a direct-knowledge answer, or a plain calculation; retrieved
pages are chunked and embedded (real RAG, not just raw snippets) before an
LLM synthesizes a cited answer, formatted however best fits the question
(steps, bullets, a table, or plain prose) — the same core idea behind
Perplexity AI. It also supports file/image attachments, a code-writing
mode, a hallucination guardrail, and a user profile with avatar upload.

---

## 1. Modules

| # | Module              | What it does                                                             |
|---|---------------------|---------------------------------------------------------------------------|
| 1 | Auth                | Register / log in / log out (Flask-Login + hashed passwords)             |
| 2 | Agent (`agent.py`)  | PLAN step: picks "search", "calculate", or "direct" for each question    |
| 3 | Web search          | Live results via DuckDuckGo (`ddgs`, no API key needed)                  |
| 4 | RAG (`rag.py`)      | Fetches real page text, chunks it, embeds chunks + query, ranks by cosine similarity |
| 5 | LLM answer engine   | Google Gemini, grounded in retrieved chunks/results, cites sources `[n]` |
| 6 | Adaptive formatting | The LLM picks numbered steps / bullets / a table / prose per question    |
| 7 | Guardrail           | A second Gemini call checks whether the answer's claims are actually supported by the retrieved context |
| 8 | Attachments         | Images, PDF, DOCX, and text/code files can be attached and analyzed      |
| 9 | Code mode           | Detects "write me code" requests and answers with runnable, multi-file code |
| 10| Profile             | Full name, username/email, password change, avatar upload (type-sniffed, size-capped) |
| 11| History             | Every search a logged-in user makes is saved to SQLite and browsable     |
| 12| Related questions   | 3 AI-suggested follow-ups after every answer                             |

## 2. Architecture

```
 User registers/logs in
        |
        v
 Flask + Flask-Login (session), SQLite (users, search_history)
        |
        v
 User asks a question (optionally with attached files)
        |
        v
   Attachment?  ---yes---> Gemini reads files directly (images/PDF inline,
        |                  DOCX/text extracted) -> answer
        no
        |
   Code request? ---yes---> Gemini answers in CODE_GUIDE mode -> answer
        |
        no
        v
   Agent.plan_tool()  (agent.py)
        |
   +----+-------------------+
   |         |               |
"calculate" "direct"      "search"
   |         |               |
 safe AST  Gemini answers  DuckDuckGo (top 6) -> rag.py:
 eval      from general      fetch top-3 pages -> chunk -> embed
           knowledge         (gemini-embedding-001) -> cosine-rank
                              -> top-K chunks as numbered context
                                        |
                                        v
                              Gemini answers, cites [1] [2] ...
                                        |
                                        v
                              Guardrail: verify_answer() checks
                              claims against the retrieved context
        |
        v
   Answer + citations + 3 related questions rendered in the browser
        |
        v
   Saved to SQLite under the logged-in user's history
```

## 3. Tech stack

| Layer      | Technology                                          |
|------------|------------------------------------------------------|
| Backend    | Python, Flask, Flask-Login, Flask-SQLAlchemy          |
| Database   | SQLite (single file, `perplexed.db`, auto-created)    |
| Search     | `ddgs` (DuckDuckGo search, free, no key)               |
| RAG        | `requests` + `beautifulsoup4` (page fetch/parse), in-memory cosine similarity |
| LLM        | Google Gemini API (`google-genai`), models `gemini-flash-latest` with `gemini-flash-lite-latest` fallback |
| Embeddings | Gemini `gemini-embedding-001`                          |
| File parsing | `python-docx` (optional, only needed for `.docx` attachments) |
| Frontend   | HTML, CSS, vanilla JavaScript                          |
| Markdown rendering | marked.js (CDN)                                |
| IDE        | VS Code                                               |

## 4. Project structure

```
perplexity-clone/
├── app.py                  # Flask app: routes, uploads, Gemini calls, orchestration
├── agent.py                 # PLAN step: search / calculate / direct tool selection
├── rag.py                   # Page fetch, chunking, embeddings, cosine similarity
├── models.py                 # SQLAlchemy models: User, SearchHistory
├── requirements.txt
├── .env.example               # Copy to .env and fill in your own values
├── .gitignore
├── README.md
├── templates/
│   ├── index.html            # Main chat/search UI + sidebar history
│   ├── login.html
│   ├── register.html
│   └── profile.html          # Settings: personal details, photo, password
└── static/
    ├── style.css              # Dark, gradient-accented UI (incl. auth pages)
    ├── script.js               # Search flow, rendering, sidebar/history logic
    ├── attachments.css / .js    # Attach button, drag & drop, paste-to-attach, previews
    ├── chatactions.css / .js    # Copy / Regenerate / Like / Dislike / Read-aloud per answer
    ├── profile.css               # Settings page styling
    └── uploads/avatars/          # Saved profile photos (created automatically)
```

## 5. Setup instructions (VS Code)

1. Open the folder in VS Code (`File > Open Folder...`).
2. Open the integrated terminal (`` Ctrl+` ``) and create a virtual
   environment:
   ```bash
   python -m venv venv
   venv\Scripts\activate        # Windows
   source venv/bin/activate     # macOS / Linux
   ```
3. Install dependencies:
   ```bash
   python -m pip install -r requirements.txt
   ```
4. Get a free Gemini key at https://aistudio.google.com/app/apikey.
5. Copy `.env.example` to `.env` and fill in your key:
   ```
   GEMINI_API_KEY=your_key_here
   FLASK_SECRET_KEY=any-random-string
   ```
6. Run the app:
   ```bash
   python app.py
   ```
   Open **http://127.0.0.1:5000** — you'll be redirected to `/login`.
   Click "Sign up" to create an account, then start searching.

The SQLite database (`perplexed.db`) is created automatically on first run,
inside an `instance/` folder next to `app.py`. Delete it any time to reset
all users/history. Profile photos are saved under `static/uploads/avatars/`.

## 6. Feature notes

- **Agent (PLAN step)**: `agent.py`'s `plan_tool()` asks Gemini a one-word
  question — `calculate`, `direct`, or `search` — before doing any
  retrieval. This is a single-step tool-selection agent (not a looping
  ReAct agent): it picks one tool up front rather than re-planning after
  seeing a result. Pure arithmetic is evaluated locally with a restricted
  `ast`-based evaluator (`try_calculate`), never sent to an LLM.
- **RAG pipeline**: `rag.py` fetches the actual text of the top search
  result pages (not just snippets), splits it into overlapping chunks,
  embeds each chunk and the query with `gemini-embedding-001`, and ranks
  chunks by cosine similarity. Only the top-K chunks go into the prompt,
  still tagged with their original source number so `[1]`, `[2]` citations
  stay correct. If embeddings fail (quota/network), it degrades gracefully
  to an unranked chunk list rather than failing the search.
- **Guardrail**: after an answer is generated from search/RAG context, a
  separate Gemini call (`verify_answer`) checks whether every claim in the
  answer is actually backed by the retrieved sources, returning
  `supported` / `unsupported` / `None` (skipped). This flag is returned to
  the frontend as `verified` in the API response.
- **Attachments**: images, PDFs, DOCX, and common text/code files (up to
  5 files, 20 MB total) can be attached; images and PDFs go to Gemini as
  inline binary parts, DOCX/text files are extracted and inlined as text.
  Files are processed in memory only — nothing is written to disk.
- **Code mode**: a regex heuristic (`is_code_request`) detects requests to
  write/build/debug code and switches to a dedicated prompt that demands
  complete, runnable, multi-file code with no citations.
- **Model resilience**: `call_gemini()` retries transient errors (503/429)
  with backoff and falls back from `gemini-flash-latest` to
  `gemini-flash-lite-latest` if the primary model is overloaded.
- **Security**: passwords are never stored in plain text —
  `werkzeug.security` hashes them before they touch the database. Avatar
  uploads are validated by sniffing the file's actual magic bytes, not its
  extension or claimed MIME type.

## 7. Notes for your internship report

- **Problem statement**: Traditional search returns a list of links; users
  read multiple pages to piece together an answer. This project builds a
  conversational answer engine that reads the web *for* the user, cites
  its sources, checks its own answers against those sources, and remembers
  what each user has searched before.
- **Core techniques**: (1) a lightweight planning agent for tool
  selection, and (2) Retrieval-Augmented Generation (chunking + embeddings
  + cosine similarity) — grounding an LLM's output in retrieved documents
  to reduce hallucination and provide verifiable citations, with an
  explicit post-hoc guardrail check on top.
- **Testing ideas**: try ambiguous queries, pure-math questions, queries
  with no good search results, attachment-based questions, a coding
  request, multi-turn follow-ups, and confirm history persists correctly
  across a logout/login cycle.

## 8. Possible extensions (future scope)

- Search "focus modes" (Academic, Video, Social) that bias the DuckDuckGo
  query toward specific domains.
- Streaming the answer token-by-token instead of waiting for the full reply.
- A real vector store (FAISS/Chroma) if the number of chunks grows beyond
  what an in-memory cosine scan handles comfortably.
- Password reset via email.
- Exporting a saved history item as a PDF.