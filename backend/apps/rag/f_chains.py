from langchain_ollama import ChatOllama
from langchain_core.output_parsers import StrOutputParser
from .e_prompts import context_prompt

def get_llm():
    return ChatOllama(
        model="llama3.2:3b",
        temperature=0
    )

def format_docs(docs):
    return "\n\n".join([doc.page_content for doc in docs])

def format_history(messages):

    if not messages:
        return "No previous conversation."

    lines = []

    for m in messages:
        speaker = "User" if m["role"] == 'user' else 'Assistant'
        lines.append(f"{speaker}: {m['content']}")

    return '\n'.join(lines) + '\n'

def answer_question(vectorstore, question: str, history:list, k:int = 3):
    llm = get_llm()
    retrieved_docs = vectorstore.similarity_search(question, k=k)
    context = format_docs(retrieved_docs)
    history_text = format_history(history or [])

    rendered_prompt = context_prompt.format(context=context, question=question, history=history_text)
    print("=== FULL PROMPT SENT TO LLM ===")
    print(rendered_prompt)
    print("================================")

    chain = context_prompt | llm | StrOutputParser()
    answer = chain.invoke({
        "context": context,
        "question": question,
        "history": history_text
    })

    print("=== ANSWER FROM LLM ===")
    print(answer)
    print("========================")
    print(f"Sources used: {len(retrieved_docs)} chunk(s) from "
          f"{set(d.metadata.get('original_filename') for d in retrieved_docs)}")
    print("========================")

    return answer, retrieved_docs