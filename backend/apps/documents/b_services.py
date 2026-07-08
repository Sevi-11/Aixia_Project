from rag.a_loader import load_document
from rag.b_splitter import text_splitter
from rag.c_embeddings import get_embeddings
from rag.d_vectorstore import load_vectorstore, add_documents

def ingest_document(document):
    file_path = document.file.path

    docs = load_document(file_path)
    chunks = text_splitter(docs)

    for chunk in chunks:
        chunk.metadata["document_id"] = document.id
        chunk.metadata["original_filename"] = document.original_filename

    embedder = get_embeddings()
    vectorstore = load_vectorstore(embedder)
    add_documents(vectorstore, chunks)

    document.is_ingested = True
    document.save()

    return len(chunks)