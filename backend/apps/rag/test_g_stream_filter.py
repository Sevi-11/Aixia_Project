from g_stream_filter import strip_thinking_stream


def test_passes_through_plain_text_with_no_think_tags():
    chunks = ["Hello, ", "this is ", "a plain answer."]

    result = "".join(strip_thinking_stream(chunks))

    assert result == "Hello, this is a plain answer."


def test_removes_a_complete_think_block_in_a_single_chunk():
    chunks = ["<think>internal reasoning</think>Final answer."]

    result = "".join(strip_thinking_stream(chunks))

    assert result == "Final answer."


def test_removes_a_think_block_whose_tags_are_split_across_chunks():
    chunks = ["Hello <thi", "nk>secret</th", "ink> world"]

    result = "".join(strip_thinking_stream(chunks))

    assert result == "Hello  world"


def test_drops_an_unterminated_trailing_think_block():
    chunks = ["Answer text ", "<think>reasoning that ", "never closes"]

    result = "".join(strip_thinking_stream(chunks))

    assert result == "Answer text"


def test_strips_leading_whitespace_before_a_leading_think_block():
    chunks = ["  ", "<think>ignore</think>Hello"]

    result = "".join(strip_thinking_stream(chunks))

    assert result == "Hello"


def test_removes_multiple_separate_think_blocks():
    chunks = ["<think>a</think>Hello<think>b</think> World"]

    result = "".join(strip_thinking_stream(chunks))

    assert result == "Hello World"


def test_matches_whole_string_regex_stripping_for_arbitrary_char_by_char_splits():
    import re

    def strip_thinking_whole_string(text):
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
        text = re.sub(r"<think>.*", "", text, flags=re.DOTALL)
        return text.strip()

    samples = [
        "No think tags here at all.",
        "<think>only thinking, no answer</think>",
        "<think>reasoning</think>The real answer.",
        "Answer first.<think>reasoning after</think>",
        "<think>a</think>Middle<think>b</think>End",
        "  leading and trailing whitespace around real text  ",
        "Partial <think>unterminated forever",
    ]

    for sample in samples:
        expected = strip_thinking_whole_string(sample)
        streamed = "".join(strip_thinking_stream(list(sample)))
        assert streamed == expected, f"mismatch for sample={sample!r}"
