from unittest.mock import MagicMock

from langchain_core.documents import Document
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel

from rag.f_chains import answer_question_stream


def _fake_vectorstore(docs):
    vectorstore = MagicMock()
    vectorstore.similarity_search.return_value = docs
    return vectorstore


def test_returns_retrieved_docs_and_streams_visible_answer_text():
    docs = [
        Document(
            page_content="Sean has 5 years of ML experience.",
            metadata={"document_id": 1, "original_filename": "cv.pdf"},
        )
    ]
    vectorstore = _fake_vectorstore(docs)
    llm = GenericFakeChatModel(
        messages=iter(["<think>reasoning</think>Sean has extensive ML experience."])
    )

    retrieved_docs, token_stream = answer_question_stream(
        vectorstore, "What is Sean's ML experience?", history=[], llm=llm
    )
    answer = "".join(token_stream)

    assert retrieved_docs == docs
    assert answer == "Sean has extensive ML experience."
    assert "<think>" not in answer
