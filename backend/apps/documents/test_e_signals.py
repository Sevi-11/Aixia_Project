"""Deleting a Document must take its chunks with it.

`delete_document_vectors` is patched throughout rather than exercised for
real. It opens its own SQLAlchemy engine from DATABASE_URL, which under pytest
is the developer's database rather than the throwaway test one Django is
talking to -- so an unmocked call here would delete rows from a real index.
The SQL itself is verified against a live store instead; these tests cover the
wiring, which is the part that silently breaks.
"""
from unittest.mock import patch

import pytest

from documents.models import Document


@pytest.mark.django_db
def test_deleting_a_document_deletes_its_vectors():
    document = Document.objects.create(original_filename='cv.pdf', file='upload/cv.pdf')
    document_id = document.pk

    with patch('documents.e_signals.delete_document_vectors', return_value=3) as delete:
        document.delete()

    delete.assert_called_once_with(document_id)


@pytest.mark.django_db
def test_a_bulk_delete_also_deletes_vectors():
    # The admin's "Delete selected documents" runs a queryset delete, not
    # Model.delete() -- post_delete covers both, and this is the path that
    # would go unnoticed if the hook lived in the admin action instead.
    Document.objects.create(original_filename='a.pdf', file='upload/a.pdf')
    Document.objects.create(original_filename='b.pdf', file='upload/b.pdf')

    with patch('documents.e_signals.delete_document_vectors', return_value=1) as delete:
        Document.objects.all().delete()

    assert delete.call_count == 2


@pytest.mark.django_db
def test_a_vector_store_failure_leaves_the_document_deleted():
    # The row is already gone when the receiver runs. Raising here would turn
    # a successful delete into a 500 and roll back a document whose file is
    # already unlinked: a leftover chunk is a nuisance, a half-deleted
    # document is a corrupt state.
    document = Document.objects.create(original_filename='cv.pdf', file='upload/cv.pdf')

    with patch(
        'documents.e_signals.delete_document_vectors',
        side_effect=RuntimeError('database unreachable'),
    ):
        document.delete()

    assert not Document.objects.filter(original_filename='cv.pdf').exists()
