OPEN_TAG = "<think>"
CLOSE_TAG = "</think>"


def strip_thinking_stream(chunks):
    """Yield visible text from a raw LLM token stream, dropping any
    ``<think>...</think>`` blocks even when the tags are split across
    arbitrary chunk boundaries. Mirrors the whole-string regex behavior of
    stripping unterminated ``<think>`` blocks to end of stream, and
    stripping leading/trailing whitespace from the overall visible text.
    """
    pending = ""
    in_think = False
    started = False
    ws_buffer = ""

    def emit(text):
        nonlocal started, ws_buffer
        if not text:
            return None
        if not started:
            text = text.lstrip()
            if not text:
                return None
            started = True
        trimmed = text.rstrip()
        trailing_ws = text[len(trimmed):]
        if not trimmed:
            ws_buffer += text
            return None
        out = ws_buffer + trimmed
        ws_buffer = trailing_ws
        return out

    for chunk in chunks:
        data = pending + chunk
        pending = ""
        while True:
            if not in_think:
                idx = data.find(OPEN_TAG)
                if idx != -1:
                    piece = emit(data[:idx])
                    if piece:
                        yield piece
                    data = data[idx + len(OPEN_TAG):]
                    in_think = True
                    continue
                keep = len(OPEN_TAG) - 1
                if len(data) > keep:
                    piece = emit(data[:len(data) - keep])
                    if piece:
                        yield piece
                    pending = data[len(data) - keep:]
                else:
                    pending = data
                break
            else:
                idx = data.find(CLOSE_TAG)
                if idx != -1:
                    data = data[idx + len(CLOSE_TAG):]
                    in_think = False
                    continue
                keep = len(CLOSE_TAG) - 1
                pending = data[len(data) - keep:] if len(data) > keep else data
                break

    if not in_think and pending:
        piece = emit(pending)
        if piece:
            yield piece
    # If still in_think at stream end, the tag was never closed; its
    # content (held in `pending`, discarded here) is dropped, matching
    # the non-streaming regex fallback for a truncated <think> block.
