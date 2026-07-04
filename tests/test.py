from backend.apps.rag.a_loader import load_document
from backend.apps.rag.b_splitter import text_splitter

docs = load_document(
    r"C:\Users\Admin\OneDrive\Documents\Person\Personal Projects\Aixia Project\backend\apps\documents\VIÑAS_CV_2026.pdf")
print(f"Loaded {len(docs)} page(s)")

chunks = text_splitter(docs)
print(f"Split into {len(chunks)} chunks")

for i, chunk in enumerate(chunks[:]):
    print(f"--- Chunk {i} ---")
    print(chunk.page_content)
    print()
