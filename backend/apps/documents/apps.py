from django.apps import AppConfig

class DocumentsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'documents'

    def ready(self):
        # Imported for the post_delete receiver's side effect of registering
        # itself. Without this the signal is never connected and deleting a
        # document silently orphans its chunks in the vector store.
        from . import e_signals  # noqa: F401

    