from backend.apps.rag.c_embeddings import get_embeddings
from backend.apps.rag.d_vectorstore import load_vectorstore
from backend.apps.rag.f_chains import answer_question

embedder = get_embeddings()
vectorstore = load_vectorstore(embedder)

print(vectorstore._collection.count())

questions = [
    "What machine learning experience do you have?",
    "What is your educational background?",
    "Do you have experience cloud computing"
]

for q in questions:
    answer, sources = answer_question(vectorstore, q)
    print(f"Q: {q}")
    print(f"A: {answer}\n")
    print("Sources used:")

    for s in sources:
        print(f" - {s.page_content}...")
    print("-" * 60)