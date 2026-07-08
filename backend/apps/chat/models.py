from django.db import models

class ChatSession(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Session {self.id} ({self.created_at:%Y-%m-%d %H:%M})"

class ChatMessage(models.Model):
    ROLE_CHOICES = [
        ('user', 'User'),
        ('assistant', 'Assistant')
    ]

    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.role}] {self.content[:50]}"