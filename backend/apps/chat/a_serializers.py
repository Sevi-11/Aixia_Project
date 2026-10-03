from rest_framework import serializers
from .models import ChatSession, ChatMessage

MAX_QUESTION_LENGTH = 2000

class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ['id', 'role', 'content', 'created_at']

class SiteContextSerializer(serializers.Serializer):
    """What the portfolio visitor has on screen, as ids only.

    The patterns are strict because these values pick metadata filters, and
    nothing free-form from the browser should reach a query or a prompt. The
    backend looks up titles and text for them in its own index.
    """
    page = serializers.ChoiceField(choices=['home', 'blog'])
    section = serializers.RegexField(r'^[a-z0-9-]{1,40}$')
    item = serializers.RegexField(r'^[a-z0-9-]{1,80}$', required=False, allow_null=True)


class ChatRequestSerializer(serializers.Serializer):
    session_id = serializers.IntegerField(required=False, allow_null=True)
    session_token = serializers.CharField(required=False, allow_blank=False)
    # Every character is sent to a paid-per-token (or free-tier, quota-capped)
    # model, so the length is bounded. Kept in step with the composer's
    # maxLength in frontend/components/Composer.js.
    question = serializers.CharField(required=False, allow_blank=True, default="", max_length=MAX_QUESTION_LENGTH)
    regenerate = serializers.BooleanField(required=False, default=False)
    # Which chat mode this question is for. Defaults to grounded: an omitted
    # mode must never silently become the ungrounded one, or an old client
    # would start getting unsourced answers about Vince. "site" is the
    # portfolio widget and needs `context`.
    mode = serializers.ChoiceField(
        choices=['grounded', 'general', 'site'],
        required=False,
        default='grounded',
    )
    context = SiteContextSerializer(required=False)

    def validate(self, data):
        if data.get('mode') == 'site' and not data.get('context'):
            raise serializers.ValidationError({'context': 'Site mode needs to know what is on screen.'})
        return data
