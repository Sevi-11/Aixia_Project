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
from sqlalchemy import create_engine, text

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


# Deleting the chunks by metadata rather than by id is not a shortcut -- it is
# the only option that works on documents already indexed. PGVector.delete()
# takes explicit chunk ids, and ingest_document() discards the ids that
# add_documents() hands back, so for anything already in the store there is no
# id list to pass. Every chunk does carry the document_id that ingestion writes
# into its metadata, and that survives retroactively: no migration, and nothing
# has to be re-embedded to become deletable.
#
# Without this, deleting a Document removes the row and the file while leaving
# its embeddings in place forever -- still retrieved, still competing for the
# k slots, still labelling the sources panel with a filename that no longer
# resolves to anything.
DELETE_BY_DOCUMENT_ID = text(
    "DELETE FROM langchain_pg_embedding "
    "WHERE cmetadata->>'document_id' = :document_id "
    "AND collection_id = ("
    "SELECT uuid FROM langchain_pg_collection WHERE name = :collection"
    ")"
)


def delete_document_vectors(document_id) -> int:
    """Remove every chunk belonging to one document. Returns the count.

    Scoped to this collection: one database can hold several, and a bare
    delete on the metadata would reach into all of them.
    """
    engine = create_engine(connection_string())
    try:
        with engine.begin() as connection:
            result = connection.execute(
                DELETE_BY_DOCUMENT_ID,
                # Compared as text because ->> yields text, which sidesteps
                # whether ingestion happened to store the id as a JSON number
                # or a string.
                {"document_id": str(document_id), "collection": COLLECTION_NAME},
            )
        return result.rowcount
    finally:
        engine.dispose()
