import os
from fastapi import FastAPI
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import LangChain components
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate
from langchain_huggingface import HuggingFaceEndpoint, ChatHuggingFace

# Load environment variables
load_dotenv()

app = FastAPI()

# --- Add CORS Middleware ---
origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. Load Documents and Create Vector Store ---
# This part runs once when the server starts.
# Ensure your PDF file exists at ./data/your_document.pdf
loader = PyPDFLoader("./data/AI.pdf")
docs = loader.load()
text_splitter = RecursiveCharacterTextSplitter()
documents = text_splitter.split_documents(docs)
embeddings = HuggingFaceEmbeddings()
vector = FAISS.from_documents(documents, embeddings)

# --- 2. Create the RAG Chain ---
# Switched to a more reliable model for demonstration.
llm_endpoint = HuggingFaceEndpoint(repo_id="mistralai/Mistral-7B-Instruct-v0.2", max_new_tokens=512)
llm = ChatHuggingFace(llm=llm_endpoint)

prompt = ChatPromptTemplate.from_template("""
Answer the following question based only on the provided context.
If the answer is not in the context, say "I cannot answer based on the information provided."
Context:
{context}

Question: {input}
""")

document_chain = create_stuff_documents_chain(llm, prompt)
retriever = vector.as_retriever()
retrieval_chain = create_retrieval_chain(retriever, document_chain)

# --- 3. Define the Chat API Endpoint ---
class ChatRequest(BaseModel):
    query: str

@app.post("/chat")
def chat_endpoint(request: ChatRequest):
    response = retrieval_chain.invoke({"input": request.query})
    return {"response": response["answer"]}

# Add the welcome endpoint back
@app.get("/")
def read_root():
    return {"message": "Assistant Chatbot API is running! Use /chat to interact."}
