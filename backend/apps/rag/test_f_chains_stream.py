from unittest.mock import MagicMock

from langchain_core.documents import Document
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel

from rag.f_chains import answer_question_stream, format_docs, generate_followup_suggestions


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


def test_format_docs_numbers_chunks_in_retrieval_order():
    docs = [
        Document(page_content="First fact."),
        Document(page_content="Second fact."),
    ]

    formatted = format_docs(docs)

    assert formatted == "[1] First fact.\n\n[2] Second fact."


def test_generate_followup_suggestions_parses_valid_json_array():
    llm = GenericFakeChatModel(messages=iter(['["What projects has Sean worked on?", "What is his ML background?"]']))

    result = generate_followup_suggestions("Tell me about Sean.", "Sean is a software engineer.", [], llm=llm)

    assert result == ["What projects has Sean worked on?", "What is his ML background?"]


def test_generate_followup_suggestions_returns_empty_on_invalid_json():
    llm = GenericFakeChatModel(messages=iter(["this is not json"]))

    result = generate_followup_suggestions("Q", "A", [], llm=llm)

    assert result == []


def test_generate_followup_suggestions_returns_empty_on_non_list_json():
    llm = GenericFakeChatModel(messages=iter(['{"a": 1}']))

    result = generate_followup_suggestions("Q", "A", [], llm=llm)

    assert result == []


def test_generate_followup_suggestions_returns_empty_when_no_answer():
    result = generate_followup_suggestions("Q", "", [], llm=GenericFakeChatModel(messages=iter([""])))

    assert result == []
