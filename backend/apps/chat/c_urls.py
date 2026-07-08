from django.urls import path
from .b_views import ChatView

urlpatterns = [
    path('', ChatView.as_view(), name='chat')
]