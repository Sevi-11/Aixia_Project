"""How many chunks a question retrieves.

k=3 was thin for a corpus of several multi-page documents: near-identical
chunks crowd the slots, and a fact that lives in only one chunk -- a second
employer, say -- falls off the list entirely. The model then answers correctly
from what it was given and simply never sees the rest.
"""
import importlib
from unittest.mock import MagicMock, patch

from langchain_core.documents import Document
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel

from rag import f_chains


def _fake_vectorstore():
    vectorstore = MagicMock()
    vectorstore.similarity_search.return_value = [Document(page_content="A fact.")]
    return vectorstore


def test_retrieval_k_defaults_to_five():
    assert f_chains.RETRIEVAL_K == 5


def test_stream_retrieves_retrieval_k_chunks_by_default():
    vectorstore = _fake_vectorstore()
    llm = GenericFakeChatModel(messages=iter(["An answer."]))

    f_chains.answer_question_stream(vectorstore, "Q", history=[], llm=llm)

    _, kwargs = vectorstore.similarity_search.call_args
    assert kwargs.get("k") == f_chains.RETRIEVAL_K


def test_an_explicit_k_still_wins():
    vectorstore = _fake_vectorstore()
    llm = GenericFakeChatModel(messages=iter(["An answer."]))

    f_chains.answer_question_stream(vectorstore, "Q", history=[], k=2, llm=llm)

    _, kwargs = vectorstore.similarity_search.call_args
    assert kwargs.get("k") == 2


def test_environment_overrides_retrieval_k():
    try:
        with patch.dict("os.environ", {"RETRIEVAL_K": "8"}):
            assert importlib.reload(f_chains).RETRIEVAL_K == 8
    finally:
        importlib.reload(f_chains)
