import os
import re
import json
import logging
from langchain_groq import ChatGroq
from langchain_core.output_parsers import StrOutputParser
from .e_prompts import context_prompt, suggestions_prompt, title_prompt
from .g_stream_filter import strip_thinking_stream

logger = logging.getLogger(__name__)

def _strip_thinking(text: str) -> str:
    """Remove <think>...</think> blocks from Qwen model output."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    # Handle an unclosed <think> tag (e.g. output truncated at max_tokens)
    text = re.sub(r"<think>.*", "", text, flags=re.DOTALL)
    return text.strip()

# Groq's free tier enforces an output-tokens-per-minute ceiling (1000 at the
# time of writing) and rejects a request UP FRONT when max_tokens exceeds what
# is left of it. The answer's real length is irrelevant -- what matters is the
# budget you reserve, so a 4096 ceiling was refused outright with a 429 before
# the model ran at all.
ANSWER_MAX_TOKENS = int(os.getenv("GROQ_MAX_TOKENS", "700"))

# Follow-ups are three short strings. They do not need the answer's budget, and
# every token reserved here is one the answer cannot use in the same minute --
# two calls share one per-minute allowance.
SUGGESTION_MAX_TOKENS = int(os.getenv("GROQ_SUGGESTION_MAX_TOKENS", "200"))

# A title is a handful of words, and it is only ever generated once per
# conversation (on the opening turn). Keeping the reservation this small
# matters: the free tier rejects a request up front when max_tokens exceeds
# what is left of the per-minute ceiling, and on that first turn this call
# shares the minute with the answer and the follow-up suggestions.
TITLE_MAX_TOKENS = int(os.getenv("GROQ_TITLE_MAX_TOKENS", "24"))

# qwen3.6 is a reasoning model, and its <think> block is billed as output
# against that same cap even though _strip_thinking discards it before the user
# sees a word of it. Turning reasoning off is what makes the free tier workable:
# the budget was going on hidden text. Set to "default" to re-enable, or to an
# empty string when using a model that rejects the parameter entirely.
REASONING_EFFORT = os.getenv("GROQ_REASONING_EFFORT", "none") or None

# Answers stay near-deterministic: this bot's credibility rests on not drifting
# from the retrieved context. Not zero, though -- ChatStreamView's regenerate
# path deletes the previous answer and asks the same question again, and at 0
# the model returns the same text, which reads as a broken button.
ANSWER_TEMPERATURE = float(os.getenv("GROQ_TEMPERATURE", "0.2"))

# Follow-up suggestions and conversation titles are the opposite problem:
# variety IS the deliverable, and neither is grounded in retrieved context, so
# there is nothing for a higher temperature to drift away from.
EXTRAS_TEMPERATURE = float(os.getenv("GROQ_EXTRAS_TEMPERATURE", "0.7"))


def get_llm(max_tokens: int = None, temperature: float = None):
    kwargs = {}
    if REASONING_EFFORT:
        kwargs["reasoning_effort"] = REASONING_EFFORT
    return ChatGroq(
        model=os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b"),
        groq_api_key=os.getenv("GROQ_API_KEY"),
        # `is None`, not `or`: an explicit 0 is a legitimate request for full
        # determinism and must not be quietly replaced by the default.
        temperature=ANSWER_TEMPERATURE if temperature is None else temperature,
        max_tokens=max_tokens or ANSWER_MAX_TOKENS,
        **kwargs,
    )

def format_docs(docs):
    # Numbering here MUST stay 1-based and in the same order as retrieved_docs,
    # because _serialize_sources() (chat/b_views.py) and the frontend's [n]
    # citation parser both assume sources[n-1] == chunk numbered [n].
    return "\n\n".join(f"[{i}] {doc.page_content}" for i, doc in enumerate(docs, start=1))

def format_history(messages):

    if not messages:
        return "No previous conversation."

    lines = []

    for m in messages:
        speaker = "User" if m["role"] == 'user' else 'Assistant'
        lines.append(f"{speaker}: {m['content']}")

    return '\n'.join(lines) + '\n'

def _retrieve_and_build_chain_input(vectorstore, question: str, history: list, k: int):
    retrieved_docs = vectorstore.similarity_search(question, k=k)
    context = format_docs(retrieved_docs)
    history_text = format_history(history or [])
    chain_input = {"context": context, "question": question, "history": history_text}
    return retrieved_docs, chain_input

def answer_question(vectorstore, question: str, history:list, k:int = 3):
    llm = get_llm()
    retrieved_docs, chain_input = _retrieve_and_build_chain_input(vectorstore, question, history, k)
    if logger.isEnabledFor(logging.DEBUG):
        logger.debug("Full prompt sent to LLM:\n%s", context_prompt.format(**chain_input))

    chain = context_prompt | llm | StrOutputParser()
    raw_answer = chain.invoke(chain_input)
    answer = _strip_thinking(raw_answer)

    logger.info("Answer from LLM: %s", answer)
    logger.info("Sources used: %d chunk(s) from %s",
                len(retrieved_docs),
                set(d.metadata.get('original_filename') for d in retrieved_docs))

    return answer, retrieved_docs

def answer_question_stream(vectorstore, question: str, history: list, k: int = 3, llm=None):
    """Like answer_question, but returns retrieved docs immediately and a
    lazy generator of visible answer text (thinking tags stripped) instead
    of waiting for the full generation to complete.
    """
    llm = llm or get_llm()
    retrieved_docs, chain_input = _retrieve_and_build_chain_input(vectorstore, question, history, k)

    chain = context_prompt | llm | StrOutputParser()
    visible_stream = strip_thinking_stream(chain.stream(chain_input))

    return retrieved_docs, visible_stream

def generate_followup_suggestions(question: str, answer: str, history: list, llm=None, max_suggestions: int = 3) -> list:
    """Best-effort follow-up questions. Never raises — returns [] on any
    model or parsing failure so it can never break the main chat response.
    """
    if not answer:
        return []
    llm = llm or get_llm(SUGGESTION_MAX_TOKENS, EXTRAS_TEMPERATURE)
    chain = suggestions_prompt | llm | StrOutputParser()
    try:
        raw = chain.invoke({"question": question, "answer": answer, "history": format_history(history or [])})
    except Exception:
        logger.exception("Follow-up suggestion generation failed")
        return []

    raw = _strip_thinking(raw).strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw.split("\n", 1)[-1] if "\n" in raw else raw

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Follow-up suggestions were not valid JSON: %r", raw)
        return []

    if not isinstance(parsed, list):
        return []

    suggestions = [s.strip() for s in parsed if isinstance(s, str) and s.strip()]
    return suggestions[:max_suggestions]


TITLE_WRAPPERS = '"\'`*#'


def generate_title(question: str, llm=None, max_words: int = 6) -> str:
    """Best-effort short summary of what a conversation is about.

    Never raises: the caller falls back to a truncated question, so a title is
    a nicety that must not be able to break — or delay — a chat response.
    """
    question = (question or "").strip()
    if not question:
        return ""

    llm = llm or get_llm(TITLE_MAX_TOKENS, EXTRAS_TEMPERATURE)
    chain = title_prompt | llm | StrOutputParser()
    try:
        raw = chain.invoke({"question": question})
    except Exception:
        logger.exception("Title generation failed")
        return ""

    title = _strip_thinking(raw).strip()
    # Models like to wrap a title in quotes or lead with "Title:" no matter how
    # firmly the prompt says not to.
    title = title.splitlines()[0].strip() if title else ""
    title = re.sub(r'^(title|answer)\s*[:\-]\s*', '', title, flags=re.IGNORECASE)
    title = title.strip().strip(TITLE_WRAPPERS).strip()
    title = re.sub(r'[.]+$', '', title).strip()

    if not title:
        return ""

    words = title.split()
    if len(words) > max_words:
        title = " ".join(words[:max_words])
    return title[:60]
