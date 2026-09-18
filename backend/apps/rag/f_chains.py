import os
import re
import json
import logging
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.output_parsers import StrOutputParser
from .e_prompts import context_prompt, general_prompt, suggestions_prompt, title_prompt
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

# qwen3.8 is a reasoning model, and its <think> block is billed as output
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

# How many chunks a question retrieves. 3 was thin once the corpus held several
# multi-page documents: near-identical chunks -- two copies of a CV, or a CV and
# a resume saying the same thing -- crowd the slots, and a fact that appears in
# only one chunk falls off the list. Measured on a corpus with a duplicated CV,
# k=3 spent two of three slots on the same page of both copies, which is enough
# to lose an entire employer. The model then answers correctly from what it was
# given and never learns the rest exists.
RETRIEVAL_K = int(os.getenv("RETRIEVAL_K", "5"))


def get_llm(max_tokens: int = None, temperature: float = None):
    kwargs = {}
    if REASONING_EFFORT:
        kwargs["reasoning_effort"] = REASONING_EFFORT
    return ChatGroq(
        model=os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b"),
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
    retrieved_docs = vectorstore.similarity_search(question, k=k or RETRIEVAL_K)
    context = format_docs(retrieved_docs)
    history_text = format_history(history or [])
    chain_input = {"context": context, "question": question, "history": history_text}
    return retrieved_docs, chain_input

def answer_question(vectorstore, question: str, history:list, k:int = None):
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

def answer_question_stream(vectorstore, question: str, history: list, k: int = None, llm=None):
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


# ---------------------------------------------------------------------------
# General mode
#
# Served by Gemini rather than Groq, and the split is the point.
#
# Groq's free tier caps OUTPUT tokens per minute at 1000 for the whole
# organisation, and rejects a request up front when max_tokens exceeds what is
# left of that ceiling (see ANSWER_MAX_TOKENS above). Grounded answers are
# short, cited and the thing this app exists to demonstrate, so they keep that
# budget to themselves. General chat is open-ended and would drain it in a
# couple of turns, taking the grounded demo down with it in the hour a reader
# is actually looking.
#
# Gemini's free tier trades that per-minute cliff for a per-day one -- far more
# token headroom, but a hard request ceiling -- so general mode is additionally
# rate limited per visitor in apps/chat/d_throttles.py. langchain-google-genai
# is already a dependency: it serves the embeddings, so this costs no new
# package and no new credential (GOOGLE_API_KEY).
# ---------------------------------------------------------------------------

# gemini-2.5-flash is closed to new API keys as of this writing -- it answers
# with a 404 pointing at this one. Flash rather than Pro because the free tier
# is Flash-only.
GENERAL_MODEL = os.getenv("GENERAL_MODEL", "gemini-3.6-flash")

# Larger than the grounded ceiling because the constraint that set that number
# does not apply here -- but still bounded: an unbounded answer is a slow answer
# and burns a daily request for a reply nobody reads to the end.
GENERAL_MAX_TOKENS = int(os.getenv("GENERAL_MAX_TOKENS", "1200"))

# Above the grounded 0.2: there is no retrieved context to stay faithful to, and
# near-deterministic general chat reads as stilted.
GENERAL_TEMPERATURE = float(os.getenv("GENERAL_TEMPERATURE", "0.7"))

# Gemini 3.x Flash is a REASONING model, and its thinking tokens are billed as
# output against max_output_tokens -- exactly the trap REASONING_EFFORT above
# works around for qwen on Groq, in a different provider's clothing.
#
# Left on, a plain "three weekend project ideas" question spent 942 of 1250
# output tokens thinking, leaving ~300 for the answer, which then stopped
# mid-sentence with finish_reason=MAX_TOKENS. The reader sees a reply that just
# stops; nothing errors, and nothing in the logs says why.
#
# 0 disables thinking. The same question then finishes in ~780 output tokens
# with finish_reason=STOP. Raise it only together with GENERAL_MAX_TOKENS, and
# be aware the budget is spent before a single visible word is produced.
GENERAL_THINKING_BUDGET = int(os.getenv("GENERAL_THINKING_BUDGET", "0"))


def get_general_llm(max_tokens: int = None, temperature: float = None):
    """The general-mode model. Never used for grounded answers."""
    return ChatGoogleGenerativeAI(
        model=GENERAL_MODEL,
        google_api_key=os.getenv("GOOGLE_API_KEY"),
        # `is None` rather than `or`, so an explicit 0 survives -- same reason
        # as get_llm().
        temperature=GENERAL_TEMPERATURE if temperature is None else temperature,
        max_output_tokens=max_tokens or GENERAL_MAX_TOKENS,
        thinking_budget=GENERAL_THINKING_BUDGET,
    )


def answer_general_stream(question: str, history: list, llm=None):
    """Ungrounded chat.

    Mirrors answer_question_stream's shape -- a lazy generator of visible text --
    but retrieves nothing, so there are no documents to return. The caller still
    emits a sources event, empty, to keep one event contract for both modes.
    """
    llm = llm or get_general_llm()
    chain = general_prompt | llm | StrOutputParser()
    chain_input = {"question": question, "history": format_history(history or [])}
    # Gemini does not emit <think> blocks, but the filter is cheap and this
    # stays correct if GENERAL_MODEL is pointed at a reasoning model later.
    return strip_thinking_stream(chain.stream(chain_input))
