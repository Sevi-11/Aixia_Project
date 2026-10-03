"""Vector store backed by pgvector, inside the application's own Postgres.

Chroma previously persisted to a directory on disk. That is fine locally and
quietly broken on a free-tier PaaS box, where the filesystem is ephemeral: the
index would be discarded on every deploy and every wake from sleep, with no
error to notice -- retrieval would just silently return nothing. Keeping the
vectors in Postgres means they live exactly as long as the database does, and
removes a component that would otherwise need hosting of its own.
"""
import functools
import os

from langchain_postgres import PGVector
from sqlalchemy import create_engine, text

from .c_embeddings import EMBEDDING_DIMENSIONS, get_embeddings

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


@functools.cache
def get_engine():
    """One SQLAlchemy engine, and so one connection pool, per process.

    Handing PGVector a URL instead makes it build a fresh engine every time,
    and nothing ever disposes of those -- each request left a pool holding
    connections open against Supabase's small client limit.

    pre_ping and recycle because the pooler closes idle connections, and a
    free-tier instance can sit idle for a long time between visitors.
    """
    return create_engine(
        connection_string(),
        pool_size=4,
        max_overflow=2,
        pool_pre_ping=True,
        pool_recycle=300,
    )


def load_vectorstore(embedder):
    return PGVector(
        embeddings=embedder,
        collection_name=COLLECTION_NAME,
        connection=get_engine(),
        # Declaring the width makes the column vector(768) instead of an
        # unconstrained vector, which is what lets Postgres build an index on
        # it. Without this, searches still work but degrade to a full scan.
        embedding_length=EMBEDDING_DIMENSIONS,
        use_jsonb=True,
    )


@functools.cache
def get_vectorstore():
    """The process-wide store. Use this rather than load_vectorstore().

    Constructing a PGVector is not free: it runs CREATE EXTENSION, creates the
    tables if missing, and looks up the collection -- several round trips that
    used to happen on every chat request. Once per process is enough.
    """
    return load_vectorstore(get_embeddings())


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
    with get_engine().begin() as connection:
        result = connection.execute(
            DELETE_BY_DOCUMENT_ID,
            # Compared as text because ->> yields text, which sidesteps
            # whether ingestion happened to store the id as a JSON number
            # or a string.
            {"document_id": str(document_id), "collection": COLLECTION_NAME},
        )
    return result.rowcount


# Chunks that came from an uploaded document (the CV and anything else the
# owner ingests) carry the document_id that ingestion writes; chunks synced
# from the website never do. Filtering on its presence keeps grounded mode on
# documents only, and works for chunks indexed before source_type existed.
DOCUMENTS_ONLY = {"document_id": {"$exists": True}}

# Website knowledge, as synced by POST /api/knowledge/sync/.
KNOWLEDGE_TYPES = ("site", "blog", "help")

SELECT_KNOWLEDGE_HASHES = text(
    "SELECT DISTINCT cmetadata->>'source_id', cmetadata->>'content_hash' "
    "FROM langchain_pg_embedding "
    "WHERE cmetadata->>'source_type' = ANY(:types) "
    "AND collection_id = ("
    "SELECT uuid FROM langchain_pg_collection WHERE name = :collection"
    ")"
)

DELETE_BY_SOURCE_IDS = text(
    "DELETE FROM langchain_pg_embedding "
    "WHERE cmetadata->>'source_id' = ANY(:ids) "
    "AND cmetadata->>'source_type' = ANY(:types) "
    "AND collection_id = ("
    "SELECT uuid FROM langchain_pg_collection WHERE name = :collection"
    ")"
)


def knowledge_hashes() -> dict:
    """{source_id: content_hash} for every website entry currently indexed."""
    get_vectorstore()  # creates the tables on a fresh database
    with get_engine().connect() as connection:
        rows = connection.execute(
            SELECT_KNOWLEDGE_HASHES,
            {"types": list(KNOWLEDGE_TYPES), "collection": COLLECTION_NAME},
        )
        return {source_id: content_hash for source_id, content_hash in rows}


def delete_knowledge(source_ids) -> int:
    """Remove every chunk of the given website entries. Returns the count.

    Scoped to website source types so a bad id can never reach a CV chunk.
    """
    source_ids = list(source_ids)
    if not source_ids:
        return 0
    with get_engine().begin() as connection:
        result = connection.execute(
            DELETE_BY_SOURCE_IDS,
            {"ids": source_ids, "types": list(KNOWLEDGE_TYPES), "collection": COLLECTION_NAME},
        )
    return result.rowcount
