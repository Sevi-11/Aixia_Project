from langchain_chroma import Chroma
import os

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PERSIST_DIR = os.path.join(BACKEND_DIR, "data", "chroma_db")

def build_vectorstore(chunks, embedder):
    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=embedder,
        persist_directory=PERSIST_DIR)

    return vectorstore

def load_vectorstore(embedder):
    return Chroma(
        persist_directory=PERSIST_DIR,
        embedding_function = embedder
    )

def search(vectorstore, query: str, k: int=3):
    results =vectorstore.similarity_search(query, k=k)
    return results

def add_documents(vectorstore, chunks):
    vectorstore.add_documents(chunks)
    return vectorstore