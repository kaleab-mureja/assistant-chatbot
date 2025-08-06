import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Optional
from uuid import UUID

# Import LangChain components
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate
from langchain_huggingface import HuggingFaceEndpoint, ChatHuggingFace
from langchain.memory import ConversationBufferMemory

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

# --- Global state to store vector stores and memory per session ---
VECTOR_STORES: Dict[str, FAISS] = {}
SESSION_MEMORY: Dict[str, ConversationBufferMemory] = {}
UPLOAD_DIR = "./uploaded_pdfs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- RAG Chain creation logic ---
def get_rag_chain(vector_store: FAISS, memory: ConversationBufferMemory):
    """Creates and returns a RAG chain for a given vector store and memory."""
    llm_endpoint = HuggingFaceEndpoint(
        repo_id="mistralai/Mistral-7B-Instruct-v0.2",
        max_new_tokens=512,
        # Ensure HUGGINGFACEHUB_API_TOKEN is set in your .env file
        huggingfacehub_api_token=os.getenv("HUGGINGFACEHUB_API_TOKEN")
    )
    llm = ChatHuggingFace(llm=llm_endpoint)

    prompt = ChatPromptTemplate.from_template("""
    You are a helpful AI assistant. Answer the user's question based on the provided context and conversation history.
    If the answer is not in the context, say "I cannot answer based on the information provided."

    Conversation History:
    {chat_history}

    Context:
    {context}

    Question: {input}
    """)

    document_chain = create_stuff_documents_chain(llm, prompt)
    retriever = vector_store.as_retriever()
    retrieval_chain = create_retrieval_chain(retriever, document_chain)
    return retrieval_chain

# --- Endpoints ---
@app.get("/")
def read_root():
    return {"message": "Dynamic PDF Chatbot API is running! Use /upload-pdf and /chat to interact."}

@app.post("/upload-pdf/")
async def upload_pdf(file: UploadFile = File(...), session_id: str = Form(...)):
    """Handles PDF file upload and processes it to create a vector store."""
    try:
        if file.content_type != "application/pdf":
            raise HTTPException(status_code=400, detail="Invalid file type. Only PDFs are allowed.")

        # Save the uploaded file temporarily
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Process the document to create the vector store
        loader = PyPDFLoader(file_path)
        docs = loader.load()
        text_splitter = RecursiveCharacterTextSplitter()
        documents = text_splitter.split_documents(docs)
        
        embeddings = HuggingFaceEmbeddings()
        vector_store = FAISS.from_documents(documents, embeddings)

        # Store the vector store and initialize new memory for the session
        VECTOR_STORES[session_id] = vector_store
        SESSION_MEMORY[session_id] = ConversationBufferMemory()
        
        return {"message": "PDF processed successfully!", "session_id": session_id}

    except Exception as e:
        print(f"Error during file upload: {e}")
        raise HTTPException(status_code=500, detail=f"An error occurred during processing: {e}")
    finally:
        # Clean up the temporary file
        if os.path.exists(file_path):
            os.remove(file_path)

# --- Chat Request Model ---
class ChatRequest(BaseModel):
    user_query: str
    session_id: str

@app.post("/chat/")
async def chat_endpoint(request: ChatRequest):
    """Answers user queries based on the session's document and conversation history."""
    session_id = request.session_id
    user_query = request.user_query
    
    if session_id not in VECTOR_STORES:
        raise HTTPException(status_code=404, detail="No document uploaded for this session.")
        
    vector_store = VECTOR_STORES[session_id]
    memory = SESSION_MEMORY[session_id]
    
    # Get the chat history from the memory
    chat_history = memory.load_memory_variables({})["history"]
    
    # Pass the history to the RAG chain
    retrieval_chain = get_rag_chain(vector_store, memory)
    
    try:
        response = retrieval_chain.invoke({"input": user_query, "chat_history": chat_history})
        
        # Update memory with the new interaction
        memory.save_context({"input": user_query}, {"output": response["answer"]})
        
        return {"response": response["answer"]}
    except Exception as e:
        print(f"Error during chat: {e}")
        raise HTTPException(status_code=500, detail="An error occurred while processing the chat request.")
