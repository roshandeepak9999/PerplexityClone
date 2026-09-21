"""
Agent module
------------
Implements a basic tool-calling agent: PLAN -> ACT.

  1. PLAN  - the LLM looks at the question and decides which single tool
             fits best (this is the "planning" step of an agent).
  2. ACT   - that tool is executed and its result feeds the final answer.

This deliberately reuses app.py's own `call_gemini` (passed in as
call_gemini_fn) instead of creating a second retry/model-fallback path.

Honest framing for a report: this is a single-step tool-selection agent,
not a multi-step autonomous agent - a fuller version would re-plan after
seeing each tool's result (ReAct-style looping).

Tools:
  - "search"    -> needs live/current web information (handled in app.py via rag.py)
  - "calculate" -> a pure arithmetic question, answered without any API call
  - "direct"    -> answerable from general knowledge, no retrieval needed
"""

import ast
import operator
import re

_ALLOWED_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.Mod: operator.mod,
}


def _safe_eval(node):
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_OPS:
        return _ALLOWED_OPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _ALLOWED_OPS:
        return _ALLOWED_OPS[type(node.op)](_safe_eval(node.operand))
    raise ValueError("Unsupported expression")


def extract_math_expression(query):
    """Pull the longest run of arithmetic-looking characters out of a
    natural-language question, e.g. 'what is 45*12+3?' -> '45*12+3'.
    Requires at least one operator, so a bare number like '100' (as in
    'convert 100 fahrenheit to celsius') is correctly rejected."""
    candidates = re.findall(r"[\d.\s+\-*/%^()]{3,}", query)
    candidates = [c for c in candidates if re.search(r"[+\-*/%^]", c)]
    if not candidates:
        return None
    return max(candidates, key=len).strip().replace("^", "**")


def try_calculate(query):
    """Attempt to safely evaluate an arithmetic expression found in the
    query. Returns the numeric result, or None if it isn't (purely) math."""
    expr = extract_math_expression(query)
    if not expr:
        return None
    try:
        tree = ast.parse(expr, mode="eval")
        return _safe_eval(tree.body)
    except Exception:
        return None


def plan_tool(call_gemini_fn, query):
    """Ask the LLM which tool best answers this question (the PLAN step).
    call_gemini_fn: app.py's own call_gemini(contents, retries=...) helper,
    so this reuses the existing retry + model-fallback logic."""
    prompt = f"""Decide which single tool best answers this user question.
Reply with EXACTLY ONE WORD, no punctuation:

- "calculate" - the question is purely a math/arithmetic calculation
- "direct" - answerable from general knowledge, does NOT need current or
  live information (definitions, greetings, coding help, well-known and
  unchanging facts)
- "search" - needs current, specific, or fact-checkable information from
  the live web (news, prices, "latest", real people/places, statistics,
  or anything you are not fully certain of)

Question: {query}

Answer with one word only:"""

    try:
        choice = call_gemini_fn(prompt, retries=1).strip().lower()
        for tool in ("calculate", "direct", "search"):
            if tool in choice:
                return tool
    except Exception as exc:
        print(f"[plan_tool] error: {exc}")

    return "search"  # fallback: the most grounded, safest option