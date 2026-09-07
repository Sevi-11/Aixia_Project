"""Temperature is per-call, not global.

Answers stay near-deterministic because this bot's credibility rests on not
drifting from the retrieved context. Suggestions and titles run hot because
variety is their entire job and neither is grounded in a document.
"""
import importlib
from unittest.mock import patch

import pytest

from rag import f_chains


@pytest.fixture(autouse=True)
def _fake_api_key():
    """ChatGroq validates a key at construction; the tests never call out."""
    with patch.dict("os.environ", {"GROQ_API_KEY": "test-key-not-used"}):
        yield


def test_get_llm_defaults_to_the_answer_temperature():
    assert f_chains.get_llm().temperature == f_chains.ANSWER_TEMPERATURE


def test_answer_temperature_is_above_zero_so_regenerate_can_differ():
    assert f_chains.ANSWER_TEMPERATURE > 0


def test_get_llm_honours_an_explicit_temperature():
    assert f_chains.get_llm(temperature=0.9).temperature == 0.9


def test_get_llm_honours_an_explicit_zero():
    # Guards the `if temperature is None` check. Written as `temperature or
    # ANSWER_TEMPERATURE`, an explicit 0 would be silently replaced by 0.2.
    #
    # Not asserted as `== 0`: ChatGroq clamps a literal zero to 1e-08, because
    # the Groq API rejects 0 outright. Effectively-zero is the real contract.
    assert f_chains.get_llm(temperature=0).temperature < 1e-6


def test_extras_run_hotter_than_answers():
    assert f_chains.EXTRAS_TEMPERATURE > f_chains.ANSWER_TEMPERATURE


@pytest.mark.parametrize(
    "variable, constant",
    [
        ("GROQ_TEMPERATURE", "ANSWER_TEMPERATURE"),
        ("GROQ_EXTRAS_TEMPERATURE", "EXTRAS_TEMPERATURE"),
    ],
)
def test_environment_overrides_the_default(variable, constant):
    try:
        with patch.dict("os.environ", {variable: "0.42"}):
            reloaded = importlib.reload(f_chains)
            assert getattr(reloaded, constant) == 0.42
    finally:
        # Other test modules hold references into this module; leave the
        # process-wide defaults as they were found.
        importlib.reload(f_chains)
