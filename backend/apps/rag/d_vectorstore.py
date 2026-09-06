"""Vector store backed by pgvector, inside the application's own Postgres.

Chroma previously persisted to a directory on disk. That is fine locally and
quietly broken on a free-tier PaaS box, where the filesystem is ephemeral: the
index would be discarded on every deploy and every wake from sleep, with no
error to notice -- retrieval would just silently return nothing. Keeping the
vectors in Postgres means they live exactly as long as the database does, and
removes a component that would otherwise need hosting of its own.
"""
import os

from langchain_postgres import PGVector

from .c_embeddings import EMBEDDING_DIMENSIONS

COLLECTION_NAME = os.getenv('PGVECTOR_COLLECTION', 'aixia_documents')


def connection_string():
    """Render DATABASE_URL in the form SQLAlchemy expects.

    Django and SQLAlchemy disagree about URL schemes: Django accepts
    'postgres://', SQLAlchemy needs the driver named explicitly as
    'postgresql+psycopg://'. Deriving one from the other keeps a single
    DATABASE_URL in the environment rather than two that can drift apart.
    """
    url = os.getenv('DATABASE_URL')
    if not url:
        raise RuntimeError(
            'DATABASE_URL must be set: the vector store lives in the same '
            'database as the rest of the application.'
        )

    scheme, separator, rest = url.partition('://')
    if not separator:
        raise ValueError(f'DATABASE_URL is not a URL: {scheme!r}')
    if scheme in {'postgres', 'postgresql'}:
        return f'postgresql+psycopg://{rest}'
    return url


def load_vectorstore(embedder):
    return PGVector(
        embeddings=embedder,
        collection_name=COLLECTION_NAME,
        connection=connection_string(),
        # Declaring the width makes the column vector(768) instead of an
        # unconstrained vector, which is what lets Postgres build an index on
        # it. Without this, searches still work but degrade to a full scan.
        embedding_length=EMBEDDING_DIMENSIONS,
        use_jsonb=True,
    )


def build_vectorstore(chunks, embedder):
    vectorstore = load_vectorstore(embedder)
    vectorstore.add_documents(chunks)
    return vectorstore


def search(vectorstore, query: str, k: int = 3):
    return vectorstore.similarity_search(query, k=k)


def add_documents(vectorstore, chunks):
    vectorstore.add_documents(chunks)
    return vectorstore
