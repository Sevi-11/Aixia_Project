import os

from langchain_text_splitters import RecursiveCharacterTextSplitter

# Chunk size is a retrieval-quality decision that is also, on the free tier, a
# quota decision. Google's embedding quota counts every chunk as one request
# (100/minute), not every batched API call -- so halving the chunk count
# halves the quota cost of ingesting a document.
#
# 500 characters, the original value, is roughly 125 tokens: small enough to
# split sentences mid-thought, which costs retrieval quality *and* quadruples
# the request count.
#
# 2000 was chosen by measuring the real corpus rather than by taste: the
# largest document needs 79 chunks at this size, leaving 21 of headroom under
# the 100/minute quota. At 1500 that same document needed 102 -- over the
# entire per-minute budget on its own, so no amount of retrying could ever
# have indexed it.
CHUNK_SIZE = int(os.getenv('CHUNK_SIZE', '2000'))
CHUNK_OVERLAP = int(os.getenv('CHUNK_OVERLAP', '250'))


def text_splitter(doc, chunk_size=None, chunk_overlap=None):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size or CHUNK_SIZE,
        chunk_overlap=chunk_overlap or CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    chunks = splitter.split_documents(doc)
    return chunks
