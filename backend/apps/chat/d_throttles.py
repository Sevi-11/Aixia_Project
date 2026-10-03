"""Rate limits per chat mode.

Every mode spends someone's free tier. General mode runs on Gemini, which caps
REQUESTS PER DAY. Grounded mode (the app) and site mode (the portfolio widget)
both run on Groq, which caps OUTPUT TOKENS PER MINUTE for the whole account.
The anon rate on the view covers everyone; the classes here add limits that
only make sense for particular modes.

Two shapes of limit:
- per visitor, so one reader running a loop cannot use everyone's share;
- shared by everyone, so no way of looking like many visitors -- a spoofed
  X-Forwarded-For, a botnet -- can exhaust the provider's quota.
"""
from rest_framework.throttling import SimpleRateThrottle


def _mode(request):
    # request.data is already parsed by the time throttles run. A missing mode
    # is grounded, matching the serializer's default.
    try:
        return (request.data or {}).get("mode") or "grounded"
    except Exception:
        # An unparseable body is not a throttle's problem; the serializer
        # will reject it a moment later with a 400.
        return None


class ModeThrottle(SimpleRateThrottle):
    """Applies only to requests in `modes`, per visitor or shared by all.

    Returning None from get_cache_key is DRF's documented way of saying "this
    throttle does not apply to this request".
    """

    modes = frozenset()
    shared = False

    def get_cache_key(self, request, view):
        if _mode(request) not in self.modes:
            return None
        ident = "all" if self.shared else self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class GeneralChatRateThrottle(ModeThrottle):
    scope = "general_chat"
    modes = frozenset({"general"})


class GeneralChatDailyThrottle(ModeThrottle):
    """One ceiling on general-mode requests across every visitor, kept under
    Gemini's daily quota."""

    scope = "general_chat_daily"
    modes = frozenset({"general"})
    shared = True


class SiteChatRateThrottle(ModeThrottle):
    """Per-visitor limit for the portfolio widget, which sits on every page of
    a public site."""

    scope = "site_chat"
    modes = frozenset({"site"})


class GroqDailyThrottle(ModeThrottle):
    """One ceiling across the two Groq-backed modes, so the widget cannot
    starve the app of answers or the other way round."""

    scope = "groq_daily"
    modes = frozenset({"grounded", "site"})
    shared = True
