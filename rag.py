"""
Retrieval-Augmented Generation (RAG) module
--------------------------------------------
Real chunking + embeddings + similarity search, replacing raw search
snippets with the most relevant passages from the actual pages.

Reuses the SAME `client` (google.genai.Client) the rest of app.py already
creates - no second client, no extra config needed.

Pipeline:
  1. Fetch each search result's real page text (not just the snippet)
  2. Split it into overlapping chunks
  3. Embed every chunk + the query (Gemini's gemini-embedding-001)
  4. Rank chunks by cosine similarity to the query - a simple in-memory
     "vector database" (no FAISS/Chroma dependency, kept lightweight)
  5. Return the top-K chunks, still tagged with their ORIGINAL source
     number so citations like [1], [2] keep pointing at the right result
"""

import re
import time
import math

import requests
from bs4 import BeautifulSoup

EMBED_MODEL = "gemini-embedding-001"

FETCH_TIMEOUT = 4            # seconds per page fetch
MAX_PAGE_CHARS = 4000         # how much of a page's text we read
CHUNK_SIZE = 700              # characters per chunk
CHUNK_OVERLAP = 100
RAG_MAX_RESULTS = 3           # only chunk/embed the top N search results
MAX_CHUNKS_PER_PAGE = 1       # keep total embedding calls small (free-tier limits)
TOP_K = 4                     # how many chunks to feed the LLM

_RETRYABLE = ("429", "503", "RESOURCE_EXHAUSTED", "UNAVAILABLE")


def fetch_page_text(url):
    """Download a page and return its visible text, or None on failure."""
    try:
        resp = requests.get(
            url,
            timeout=FETCH_TIMEOUT,
            headers={"User-Agent": "Mozilla/5.0 (compatible; MCA-Project-Bot/1.0)"},
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            tag.decompose()
        text = re.sub(r"\s+", " ", soup.get_text(separator=" ")).strip()
        return text[:MAX_PAGE_CHARS] if text else None
    except Exception:
        return None


def chunk_text(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    """Split text into overlapping fixed-size chunks."""
    chunks = []
    start = 0
    step = max(chunk_size - overlap, 1)
    while start < len(text):
        chunk = text[start : start + chunk_size].strip()
        if chunk:
            chunks.append(chunk)
        start += step
    return chunks


def embed_text(client, text, retries=2):
    """Get an embedding vector for a piece of text. None on failure."""
    for attempt in range(retries + 1):
        try:
            result = client.models.embed_content(model=EMBED_MODEL, contents=text)
            return result.embeddings[0].values
        except Exception as exc:
            msg = str(exc)
            if any(m in msg for m in _RETRYABLE) and attempt < retries:
                time.sleep(2 ** attempt)
                continue
            print(f"[embed_text] error: {exc}")
            return None
    return None


def cosine_similarity(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def build_chunk_store(client, query, search_results):
    """
    The core RAG retrieval step. Returns the TOP_K most relevant chunks
    across the fetched pages, ranked by similarity to the query - each
    chunk tagged with the original source number for citations.
    Returns [] if there's nothing to work with (no client, no results).
    """
    if client is None or not search_results:
        return []

    all_chunks = []
    for i, result in enumerate(search_results[:RAG_MAX_RESULTS], start=1):
        page_text = fetch_page_text(result.get("url", ""))
        text_to_chunk = page_text or result.get("snippet", "")
        if not text_to_chunk:
            continue
        for c in chunk_text(text_to_chunk)[:MAX_CHUNKS_PER_PAGE]:
            all_chunks.append(
                {
                    "source_num": i,
                    "text": c,
                    "url": result.get("url", ""),
                    "title": result.get("title", "Untitled"),
                }
            )

    if not all_chunks:
        return []

    query_embedding = embed_text(client, query)
    if query_embedding is None:
        # Embeddings unavailable (quota/error) - degrade gracefully to an
        # unranked list rather than failing the whole search.
        return all_chunks[:TOP_K]

    scored = []
    for chunk in all_chunks:
        chunk_embedding = embed_text(client, chunk["text"])
        if chunk_embedding is None:
            continue
        scored.append((cosine_similarity(query_embedding, chunk_embedding), chunk))

    if not scored:
        return all_chunks[:TOP_K]

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [chunk for _, chunk in scored[:TOP_K]]


def build_context_from_chunks(chunks):
    """Turn ranked chunks into the numbered context block for the LLM prompt."""
    return "\n\n".join(
        f"[{c['source_num']}] {c['title']}\n{c['text']}\nSource: {c['url']}"
        for c in chunks
    )