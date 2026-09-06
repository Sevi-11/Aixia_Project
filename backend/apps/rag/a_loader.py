"""PDF loading.

Uses PyMuPDF directly instead of langchain-community's PyMuPDFLoader.
langchain-community is being sunset upstream, and that loader was the only
thing this project imported from it -- reimplementing ten lines drops the whole
dependency rather than carrying a deprecated one into a fresh deployment.
"""
import pymupdf
from langchain_core.documents import Document


def load_document(data: bytes, source_name: str = ''):
    """Load a PDF from raw bytes.

    Takes bytes rather than a filesystem path because uploads may live in
    object storage, where no local path exists -- Django's FileField.path
    raises NotImplementedError on every remote backend. Bytes is the one input
    that works identically for local disk and S3.

    The upload view caps files at 20 MB, so holding a whole document in memory
    is bounded.
    """
    with pymupdf.open(stream=data, filetype='pdf') as pdf:
        total_pages = pdf.page_count
        return [
            Document(
                page_content=page.get_text(),
                metadata={
                    'source': source_name,
                    'page': page.number,
                    'total_pages': total_pages,
                },
            )
            for page in pdf
        ]
