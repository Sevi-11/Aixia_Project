"""Rate limits specific to general mode.

Grounded mode is the app's purpose and is cheap: short, bounded answers over a
fixed corpus. General mode is an open LLM endpoint on a free tier with a hard
DAILY request ceiling, which makes it the one surface where a single visitor
running a loop -- or simply three readers arriving the same afternoon -- can
exhaust the quota for everyone else, during exactly the hour it matters.

So the limit lives here rather than on the default `anon` scope: it applies to
general-mode requests only, and leaves grounded chat on the looser rate.
"""
from rest_framework.throttling import SimpleRateThrottle


class GeneralChatRateThrottle(SimpleRateThrottle):
    """Throttles general-mode chat per client, and nothing else.

    Returning None from get_cache_key is DRF's documented way of saying "this
    throttle does not apply to this request", which is how grounded traffic
    passes through untouched.
    """

    scope = "general_chat"

    def get_cache_key(self, request, view):
        # request.data is already parsed by the time throttles run.
        try:
            mode = (request.data or {}).get("mode")
        except Exception:
            # An unparseable body is not this class's problem; the serializer
            # will reject it a moment later with a 400.
            return None

        if mode != "general":
            return None

        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }
