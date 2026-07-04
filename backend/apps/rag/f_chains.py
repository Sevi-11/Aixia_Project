from langchain_ollama import ChatOllama
from langchain_core.output_parsers import StrOutputParser
from backend.apps.rag.e_prompts import context_prompt

def get_llm():
    return ChatOllama(
            model="llama3.2:3b",
        temperature=0
    )

def format_docs(docs):
    return "\n\n".join([doc.page_content for doc in docs])

def answer_question(vectorstore, question: str, k:int = 3):
    llm = get_llm()
    retrieved_docs = vectorstore.similarity_search(question, k=k)
    context = format_docs(retrieved_docs)

    chain = context_prompt | llm | StrOutputParser()
    answer = chain.invoke({"context": context, "question": question})

    return answer, retrieved_docs