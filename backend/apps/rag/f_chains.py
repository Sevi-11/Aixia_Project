import os
import re
import logging
from langchain_groq import ChatGroq
from langchain_core.output_parsers import StrOutputParser
from .e_prompts import context_prompt
from .g_stream_filter import strip_thinking_stream

logger = logging.getLogger(__name__)

def _strip_thinking(text: str) -> str:
    """Remove <think>...</think> blocks from Qwen model output."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    # Handle an unclosed <think> tag (e.g. output truncated at max_tokens)
    text = re.sub(r"<think>.*", "", text, flags=re.DOTALL)
    return text.strip()

def get_llm():
    return ChatGroq(
        model=os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b"),
        groq_api_key=os.getenv("GROQ_API_KEY"),
        temperature=0,
        max_tokens=4096
    )

def format_docs(docs):
    return "\n\n".join([doc.page_content for doc in docs])

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