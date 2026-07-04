from langchain_core.prompts import ChatPromptTemplate

context_prompt = ChatPromptTemplate.from_template("""
    You are answering questions about a person's background, using ONLY the context provided below.
If the answer is not contained in the context, say "I don't have that information" — do not guess or make anything up.

Context:
{context}

Question:
{question}

Answer:
""")

