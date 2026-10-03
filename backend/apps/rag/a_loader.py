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

    The upload view caps files at 4 MB, so holding a whole document in memory
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


def load_entries(entries):
    """Turn cleaned knowledge entries (see documents/f_knowledge.py) into
    Documents.

    The title leads the text so every chunk the splitter cuts from a long entry
    still says what it belongs to. Everything the site widget needs to place an
    answer -- which page, section and item it describes, where to link -- rides
    along as metadata, and survives splitting because the splitter copies
    metadata onto each chunk.
    """
    documents = []
    for entry in entries:
        metadata = {
            'source_type': entry['type'],
            'source_id': entry['id'],
            'content_hash': entry['hash'],
            'page': entry['page'],
            'section': entry['section'],
            'title': entry['title'],
            'url': entry['url'],
        }
        if entry.get('item'):
            metadata['item'] = entry['item']
        if entry.get('actions'):
            metadata['actions'] = entry['actions']
        documents.append(Document(page_content=f"{entry['title']}\n\n{entry['text']}", metadata=metadata))
    return documents
