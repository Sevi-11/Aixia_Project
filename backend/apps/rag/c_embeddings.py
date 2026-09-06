"""Embedding model for the RAG index.

Calls the Gemini API rather than running a sentence-transformers model in
process. That is a hosting constraint, not a preference: the local model pulls
in torch, which costs roughly 3 GB of image and several hundred MB resident per
worker -- more than a free-tier container has to give. Groq, which serves the
chat model, does not offer an embeddings endpoint, so this is a second provider
by necessity.
"""
import os

from langchain_google_genai import GoogleGenerativeAIEmbeddings

# gemini-embedding-001 returns 3072 dimensions by default, but pgvector's HNSW
# index refuses anything wider than 2000 -- at full width the vectors could be
# stored but never indexed. The model is trained with Matryoshka representation
# learning, so truncating to 768 is a supported operation rather than a lossy
# hack.
#
# Changing this number invalidates every stored vector: embeddings of different
# widths are not comparable, so the index has to be rebuilt from the source
# PDFs. It is not a knob to turn casually.
EMBEDDING_DIMENSIONS = 768

EMBEDDING_MODEL = os.getenv('EMBEDDING_MODEL', 'models/gemini-embedding-001')


def get_embeddings():
    return GoogleGenerativeAIEmbeddings(
        model=EMBEDDING_MODEL,
        output_dimensionality=EMBEDDING_DIMENSIONS,
    )
