from langchain_community.document_loaders import PyMuPDFLoader

def load_document(filepath: str):
    loader = PyMuPDFLoader(filepath)
    doc = loader.load()
    return doc

