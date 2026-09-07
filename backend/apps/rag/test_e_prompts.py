"""The answer prompt is a behaviour contract.

These assert the parts other code depends on, so a future tone edit cannot
silently break retrieval wiring or the sources panel.
"""
from rag.e_prompts import context_prompt, suggestions_prompt


def _rendered():
    return context_prompt.format(history="H", context="[1] C", question="Q")


def test_template_still_accepts_the_three_chain_inputs():
    # _retrieve_and_build_chain_input passes exactly these three.
    assert set(context_prompt.input_variables) == {"history", "context", "question"}


def test_prompt_keeps_the_inline_citation_contract():
    rendered = _rendered()

    assert "[1][2], not [1,2]" in rendered
    assert '"Sources" or "References" list' in rendered


def test_prompt_names_him_vince():
    assert 'Call him "Vince"' in _rendered()


def test_prompt_forbids_the_family_name_as_an_address_form():
    assert 'Never call him "Sean" on its own' in _rendered()


def test_prompt_keeps_the_full_legal_name_reachable():
    # Suppressing it entirely would make "what is his full name?" unanswerable.
    assert "Sean Vincent Vien V. Viñas" in _rendered()


def test_prompt_speaks_about_vince_rather_than_as_him():
    # Kept to one line of the source block -- the sentence that follows it
    # wraps, and a substring assertion cannot span the newline.
    assert "You speak ABOUT Vince, always in the third person." in _rendered()


def test_prompt_requires_an_answer_first_opening():
    assert "Open with one sentence that answers the question directly" in _rendered()


def test_prompt_forbids_headings():
    assert "Do not use headings." in _rendered()


def test_prompt_tells_a_miss_to_redirect_rather_than_dead_end():
    assert "Name one or two subjects the Context does cover" in _rendered()


def test_prompt_is_proportionate_to_the_answer_budget_it_governs():
    # Measured: the old policy rendered to 4,499 characters (~1,125 tokens at
    # roughly four characters per token) to govern a 700-token answer budget.
    # The replacement measures 2,326 (~582). The ceiling here is a ratchet
    # against the formatting menu creeping back, not a tight fit.
    assert len(_rendered()) / 4 < 700


def test_suggestions_prompt_uses_the_professional_name():
    rendered = suggestions_prompt.format(history="H", question="Q", answer="A")

    assert "Vince" in rendered
    assert "Sean" not in rendered
