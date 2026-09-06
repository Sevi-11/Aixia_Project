from django.contrib import admin, messages

from .b_services import ingest_document
from .models import Document


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ('id', 'original_filename', 'uploaded_at', 'is_ingested')
    list_filter = ('is_ingested',)
    search_fields = ('original_filename',)
    actions = ('ingest_selected_documents',)

    @admin.action(description='Ingest selected documents into the search index')
    def ingest_selected_documents(self, request, queryset):
        """Run the RAG pipeline from the admin UI.

        Render's free tier has no shell, so on the deployed instance this is
        the only way to index a document at all -- it is the deployment's
        ingestion interface, not a convenience wrapper around one.

        Each document is handled independently and its own outcome reported:
        one malformed PDF should not silently abort the rest of the batch, and
        a bare "0 documents ingested" would say nothing about which failed or
        why.
        """
        for document in queryset:
            if document.is_ingested:
                self.message_user(
                    request,
                    f'{document.original_filename}: already ingested, skipped.',
                    messages.INFO,
                )
                continue
            try:
                chunk_count = ingest_document(document)
            except Exception as exc:
                # The embedding provider's quota error is the one failure that
                # is both common and self-inflicted, and its raw form is a wall
                # of JSON. Say the actionable part instead: wait, then retry.
                detail = str(exc)
                if 'RESOURCE_EXHAUSTED' in detail or '429' in detail:
                    detail = (
                        'hit the embedding quota (100 chunks per minute). '
                        'Nothing was saved. Wait a full '
                        'minute WITHOUT retrying -- a failed attempt still '
                        'spends quota, so retrying early keeps the window '
                        'full -- then ingest this document on its own.'
                    )
                self.message_user(
                    request,
                    f'{document.original_filename}: {detail}',
                    messages.ERROR,
                )
            else:
                self.message_user(
                    request,
                    f'{document.original_filename}: indexed {chunk_count} chunks.',
                    messages.SUCCESS,
                )
