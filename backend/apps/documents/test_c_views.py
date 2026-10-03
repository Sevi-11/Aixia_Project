from django.test import SimpleTestCase

from .c_views import stored_filename
from .models import Document

LIMIT = Document._meta.get_field("original_filename").max_length


class StoredFilenameTests(SimpleTestCase):
    def test_short_names_are_untouched(self):
        assert stored_filename("cv.pdf") == "cv.pdf"

    def test_long_names_are_trimmed_to_fit_and_keep_the_extension(self):
        name = stored_filename("a" * 300 + ".pdf")
        assert len(name) == LIMIT
        assert name.endswith(".pdf")
