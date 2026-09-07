"""Keep the vector store in step with the Document table.

Deleting a Document used to leave its embeddings behind: the row and the file
went, the chunks stayed. Those orphans are invisible in the admin but very
much alive in retrieval -- they keep occupying the k slots every question
competes for, and they keep labelling the sources panel with a filename that
no longer resolves to anything.

Hanging this on post_delete rather than putting it in an admin action is
deliberate. post_delete fires for a queryset delete too, which is what the
admin's "Delete selected documents" actually runs, so both the single-object
and the bulk path are covered by one hook -- and so is any future deletion
from a shell, a migration, or a view.
"""
import logging

from django.db.models.signals import post_delete
from django.dispatch import receiver

from rag.d_vectorstore import delete_document_vectors

from .models import Document

logger = logging.getLogger(__name__)


@receiver(post_delete, sender=Document, dispatch_uid='documents.delete_vectors')
def delete_vectors_for_document(sender, instance, **kwargs):
    """Drop the deleted document's chunks from the vector store.

    Never raises. The row is already gone by the time this runs, so an
    exception here would surface as a 500 on a delete that in fact succeeded,
    and would roll back the deletion of a document whose file is already
    unlinked. A leftover chunk is a retrieval nuisance; a half-deleted
    document is a corrupt state. Log loudly and let the delete stand.
    """
    try:
        removed = delete_document_vectors(instance.pk)
    except Exception:
        logger.exception(
            'Failed to delete vectors for document %s (%s). Its chunks are '
            'still in the index and will still be retrieved.',
            instance.pk, instance.original_filename,
        )
        return

    logger.info(
        'Deleted %d chunk(s) from the index for document %s (%s).',
        removed, instance.pk, instance.original_filename,
    )
