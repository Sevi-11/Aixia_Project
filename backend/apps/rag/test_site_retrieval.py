"""Site mode retrieval: anchored on what is on screen, then CV background."""
from unittest.mock import MagicMock

from langchain_core.documents import Document
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel

from rag import f_chains
from rag.d_vectorstore import DOCUMENTS_ONLY


def _doc(text, **metadata):
    return Document(page_content=text, metadata=metadata)


CARD = _doc("SentryScan\n\nReal-time human detection.", source_type="site", source_id="site:projects:sentryscan",
            page="home", section="projects", item="sentryscan", title="SentryScan", url="index.html#projects")
SECTION = _doc("Projects\n\nSelected work.", source_type="site", source_id="site:projects",
               page="home", section="projects", title="Projects", url="index.html#projects")
HELP = _doc("See a project's code\n\nSelect View repository.", source_type="help", source_id="help:see-code",
            page="home", section="projects", title="See a project's code", url="index.html#projects",
            actions=[{"type": "scroll", "target": "projects"}])
CV = _doc("Built SentryScan with YOLO.", document_id=1, original_filename="cv.pdf", page=0)


def _store(item=(), section=(), background=()):
    store = MagicMock()
    store.embeddings.embed_query.return_value = [0.1, 0.2]
    results = []
    if item is not None:
        results.append(list(item))
    results += [list(section), list(background)]
    store.similarity_search_by_vector.side_effect = results
    return store


CONTEXT = {"page": "home", "section": "projects", "item": "sentryscan"}


def test_embeds_the_question_once():
    store = _store([CARD], [SECTION], [CV])
    f_chains.retrieve_for_site(store, "What is this?", CONTEXT)
    store.embeddings.embed_query.assert_called_once_with("What is this?")


def test_item_then_section_then_cv_background():
    store = _store([CARD], [SECTION, HELP], [CV])
    docs, on_screen = f_chains.retrieve_for_site(store, "What is this?", CONTEXT)

    assert docs == [CARD, SECTION, HELP, CV]
    assert on_screen == {"site:projects:sentryscan", "site:projects"}
    filters = [call.kwargs["filter"] for call in store.similarity_search_by_vector.call_args_list]
    assert filters[0] == {"$and": [{"page": "home"}, {"item": "sentryscan"}]}
    assert filters[2] == DOCUMENTS_ONLY


def test_without_an_item_only_section_and_background_are_searched():
    store = _store(None, [SECTION], [CV])
    docs, _ = f_chains.retrieve_for_site(store, "Q", {"page": "home", "section": "projects"})
    assert docs == [SECTION, CV]
    assert store.similarity_search_by_vector.call_count == 2


def test_duplicates_from_item_and_section_searches_are_dropped():
    store = _store([CARD], [CARD, SECTION], [])
    docs, _ = f_chains.retrieve_for_site(store, "Q", CONTEXT)
    assert docs == [CARD, SECTION]


def test_screen_description_uses_the_indexed_title_not_browser_text():
    line = f_chains.describe_screen(CONTEXT, [CARD])
    assert line == 'The visitor is on the home page, in the Projects section. The project card in view is "SentryScan".'


def test_context_labels_tell_the_model_what_each_chunk_is():
    text = f_chains.format_site_docs([CARD, HELP, CV], {"site:projects:sentryscan"})
    assert text.startswith("[1] (on screen: SentryScan)")
    assert "[2] (how-to: See a project's code)" in text
    assert "[3] (CV)" in text


def test_actions_come_only_from_cited_help_topics():
    docs = [CARD, HELP]
    assert f_chains.actions_for_answer("Select View repository [2].", docs) == [
        {"label": "See a project's code", "actions": [{"type": "scroll", "target": "projects"}]},
    ]
    assert f_chains.actions_for_answer("It detects people [1].", docs) == []
    assert f_chains.actions_for_answer("Out of range [9].", docs) == []
    assert len(f_chains.actions_for_answer("Twice [2][2].", docs)) == 1


def test_grounded_mode_searches_documents_only():
    store = MagicMock()
    store.similarity_search.return_value = [CV]
    llm = GenericFakeChatModel(messages=iter(["An answer."]))
    f_chains.answer_question_stream(store, "Q", history=[], llm=llm)
    assert store.similarity_search.call_args.kwargs["filter"] == DOCUMENTS_ONLY


def test_site_stream_returns_docs_tokens_and_screen():
    store = _store([CARD], [SECTION], [CV])
    llm = GenericFakeChatModel(messages=iter(["It detects people [1]."]))
    docs, stream, screen = f_chains.answer_site_stream(store, "What is this?", [], CONTEXT, llm=llm)
    assert docs[0] is CARD
    assert "".join(stream) == "It detects people [1]."
    assert "SentryScan" in screen
