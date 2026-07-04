from langchain_text_splitters import RecursiveCharacterTextSplitter

def text_splitter(doc, chunk_size=500, chunk_overlap=70):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size = chunk_size,
        chunk_overlap = chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],)

    chunks = splitter.split_documents(doc)
    return chunks


