from django.urls import path
from .b_views import ChatView, ChatStreamView

urlpatterns = [
    path('', ChatView.as_view(), name='chat'),
    path('stream/', ChatStreamView.as_view(), name='chat-stream'),
]
