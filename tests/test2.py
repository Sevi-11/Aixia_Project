from backend.apps.rag.c_embeddings import get_embeddings
from sklearn.metrics.pairwise import cosine_similarity

embedder = get_embeddings()

sentences=[
    "I have experience in machine learning",
    "I have computer vision projects",
    "I have studied computer engineering",
    "I am gay"
]

vectors = embedder.embed_documents(sentences)

print(f"Number of Vectors: {len(vectors)}")
print(f"Vector Dimensions: {len(vectors[0])}")

sim_1 = cosine_similarity([vectors[0]], [vectors[1]])[0][0]
sim_2 = cosine_similarity([vectors[0]], [vectors[2]])[0][0]
sim_3 = cosine_similarity([vectors[0]], [vectors[3]])[0][0]

print(f"\nSimilarity (ML sentence vs CV vision sentence): {sim_1:.3f}")
print(f"Similarity (ML sentence vs computer engineering): {sim_2:.3f}")
print(f"Similarity (ML sentence vs gay sentence): {sim_3:.3f}")