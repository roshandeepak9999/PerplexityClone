# Perplexed — A Perplexity AI Clone
### MCA Short-Term Internship Project (Generative AI Engineering)

An AI-powered search engine with user accounts and saved search history.
It answers natural-language questions by searching the live web and asking
an LLM to synthesize a cited answer, formatted however best fits the
question (steps, bullets, a table, or plain prose) — the same core idea
behind Perplexity AI.

---

## 1. Modules

| # | Module              | What it does                                                        |
|---|---------------------|----------------------------------------------------------------------|
| 1 | Auth                | Register / log in / log out (Flask-Login + hashed passwords)        |
| 2 | Web search          | Live results via DuckDuckGo (no API key needed)                     |
| 3 | LLM answer engine   | Google Gemini, grounded only in the search results, cites sources   |
| 4 | Adaptive formatting | The LLM picks numbered steps / bullets / a table / prose per question |
| 5 | History             | Every search a logged-in user makes is saved to SQLite and browsable |
| 6 | Related questions   | 3 AI-suggested follow-ups after every answer                        |

## 2. Architecture

```
 User registers/logs in
        |
        v
 Flask + Flask-Login (session), SQLite (users, search_history)
        |
        v
 User asks a question
        |
        v
 DuckDuckGo Search (top 6 results)  ---->  Gemini API
        |                                       |
        |                     numbered sources as context, cite as [1] [2]...
        |                                       |
        v                                       v
   Answer + citations + 3 related questions rendered in the browser
        |
        v
   Saved to SQLite under the logged-in user's history
```

## 3. Tech stack

| Layer      | Technology                                     |
|------------|--------------------------------------------------|
| Backend    | Python, Flask, Flask-Login, Flask-SQLAlchemy     |
| Database   | SQLite (single file, `perplexed.db`, auto-created) |
| Search     | `duckduckgo-search` (free, no key)                |
| LLM        | Google Gemini API (`gemini-flash-latest`, free tier) |
| Frontend   | HTML, CSS, vanilla JavaScript                     |
| Markdown rendering | marked.js (CDN)                           |
| IDE        | VS Code                                          |

## 4. Project structure

```
perplexity-clone/
├── app.py                 # Flask app: routes, search, LLM logic
├── models.py               # SQLAlchemy models: User, SearchHistory
├── requirements.txt
├── .env.example
├── README.md
├── templates/
│   ├── index.html          # Main search UI + sidebar history
│   ├── login.html
│   └── register.html
└── static/
    ├── style.css            # Dark, gradient-accented UI (incl. auth pages)
    └── script.js            # Search, citations, sidebar/history logic
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
right next to `app.py`. Delete it any time to reset all users/history.

## 6. Notes for your internship report

- **Problem statement**: Traditional search returns a list of links; users
  read multiple pages to piece together an answer. This project builds a
  conversational answer engine that reads the web *for* the user, cites
  its sources, and remembers what each user has searched before.
- **Core technique**: Retrieval-Augmented Generation (RAG) — grounding an
  LLM's output in retrieved documents to reduce hallucination and provide
  verifiable citations.
- **Security note worth mentioning**: passwords are never stored in plain
  text — `werkzeug.security` hashes them before they touch the database.
- **Testing ideas**: try ambiguous queries, queries with no good search
  results, multi-turn follow-ups, and confirm history persists correctly
  across a logout/login cycle.

## 7. Possible extensions (future scope)

- Search "focus modes" (Academic, Video, Social) that bias the DuckDuckGo
  query toward specific domains.
- Streaming the answer token-by-token instead of waiting for the full reply.
- Password reset via email.
- Exporting a saved history item as a PDF.
