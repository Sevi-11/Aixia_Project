from backend.apps.rag.d_vectorstore import build_vectorstore, search
from backend.apps.rag.c_embeddings import get_embeddings
from backend.apps.rag.b_splitter import text_splitter
from backend.apps.rag.a_loader import load_document

docs = load_document(r"/backend/apps/documents/VINAS_CV_2026.pdf")
chunks = text_splitter(docs)
embedder = get_embeddings()

vectorstore = build_vectorstore(chunks, embedder)
query = "School attended to?"
results = search(vectorstore, query, k=3)

print(f"Query: {query}\n")
for i, r in enumerate(results):
    print(f"--- Result {i+1} ---")
    print(r.page_content)
    print()