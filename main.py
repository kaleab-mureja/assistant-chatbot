import os
import shutil
import json
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict
from uuid import uuid4

# Import LangChain components from the updated packages
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate
from langchain_huggingface import HuggingFaceEndpoint, ChatHuggingFace
from langchain_core.messages import AIMessage, HumanMessage

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

# --- Global state for sessions ---
VECTOR_STORES: Dict[str, FAISS] = {}
SESSION_MEMORY: Dict[str, Dict] = {} # Stores history and metadata
DB_FILE = "db.json"
UPLOAD_DIR = "./uploaded_pdfs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- Persistence Functions ---
def load_sessions():
    """Load sessions from the JSON file."""
    global SESSION_MEMORY
    if os.path.exists(DB_FILE) and os.path.getsize(DB_FILE) > 0:
        try:
            with open(DB_FILE, "r") as f:
                data = json.load(f)
                SESSION_MEMORY = data.get("sessions", {})
        except json.JSONDecodeError:
            print("Warning: db.json is empty or corrupted. Starting with an empty database.")
            SESSION_MEMORY = {}
    else:
        print("db.json not found or is empty. Starting with an empty database.")
        SESSION_MEMORY = {}

def save_sessions():
    """Save all sessions to the JSON file."""
    with open(DB_FILE, "w") as f:
        json.dump({"sessions": SESSION_MEMORY}, f, indent=4)

# Load sessions on startup
load_sessions()

# --- RAG Chain creation logic ---
def get_rag_chain(vector_store: FAISS):
    """Creates and returns a RAG chain for a given vector store."""
    hf_token = os.getenv("HUGGINGFACEHUB_API_TOKEN")
    if not hf_token:
        raise ValueError("HuggingFace API token not found in environment variables")

    # Use ChatHuggingFace with a properly configured HuggingFaceEndpoint
    llm_endpoint = HuggingFaceEndpoint(
        repo_id="mistralai/Mistral-7B-Instruct-v0.2",
        huggingfacehub_api_token=hf_token,
        task="conversational",  # This is the key fix
        temperature=0.1,
        max_new_tokens=512
    )
    llm = ChatHuggingFace(llm=llm_endpoint)

    prompt = ChatPromptTemplate.from_template("""
    You are a helpful AI assistant. Answer the user's question based on the provided context and conversation history.
    If you don't know the answer, just say that you don't know, don't try to make up an answer.

    Conversation History:
    {chat_history}

    Context:
    {context}

    Question: {input}

    Helpful Answer:
    """)

    document_chain = create_stuff_documents_chain(llm, prompt)
    retriever = vector_store.as_retriever(search_kwargs={"k": 3})
    retrieval_chain = create_retrieval_chain(retriever, document_chain)
    return retrieval_chain

# --- Endpoints ---
@app.get("/")
def read_root():
    return {"message": "Dynamic PDF Chatbot API is running! Use /upload-pdf and /chat to interact."}

@app.get("/sessions/")
def get_sessions():
    """Returns a list of all existing sessions."""
    return [{"session_id": sid, "history": session_data.get("history", []), "title": session_data.get("title", "New Chat")}
            for sid, session_data in SESSION_MEMORY.items()]

@app.delete("/sessions/{session_id}")
def delete_session(session_id: str):
    """Deletes a session and its associated data."""
    if session_id in SESSION_MEMORY:
        del SESSION_MEMORY[session_id]
        if session_id in VECTOR_STORES:
            del VECTOR_STORES[session_id]
        save_sessions()
        return {"message": f"Session {session_id} deleted successfully."}
    raise HTTPException(status_code=404, detail="Session not found.")

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

        # Process the document
        loader = PyPDFLoader(file_path)
        docs = loader.load()
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200
        )
        documents = text_splitter.split_documents(docs)

        # Create embeddings and vector store
        embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2"
        )
        vector_store = FAISS.from_documents(documents, embeddings)

        # Store the vector store and initialize session memory
        VECTOR_STORES[session_id] = vector_store
        SESSION_MEMORY[session_id] = {
            "title": file.filename,
            "history": [],
            "uploaded_file": file.filename
        }
        save_sessions()

        return {"message": "PDF processed successfully!", "session_id": session_id}

    except Exception as e:
        print(f"Error during file upload: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An error occurred during processing: {str(e)}")
    finally:
        if 'file_path' in locals() and os.path.exists(file_path):
            # Do not delete the file to allow for reloading, but consider a cleanup strategy later.
            pass

# --- Chat Request Model ---
class ChatRequest(BaseModel):
    user_query: str
    session_id: str

@app.post("/chat/")
async def chat_endpoint(request: ChatRequest):
    """Answers user queries based on the session's document."""
    session_id = request.session_id
    user_query = request.user_query

    if session_id not in SESSION_MEMORY:
        raise HTTPException(status_code=404, detail="Session not found.")

    if session_id not in VECTOR_STORES:
        session_data = SESSION_MEMORY.get(session_id)
        if not session_data or not session_data.get("uploaded_file"):
            raise HTTPException(status_code=400, detail="No document uploaded for this session.")

        # Try to reload the vector store
        try:
            file_path = os.path.join(UPLOAD_DIR, session_data["uploaded_file"])
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"File {file_path} not found.")

            loader = PyPDFLoader(file_path)
            docs = loader.load()
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
            documents = text_splitter.split_documents(docs)
            embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
            VECTOR_STORES[session_id] = FAISS.from_documents(documents, embeddings)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to reload document: {str(e)}")

    try:
        retrieval_chain = get_rag_chain(VECTOR_STORES[session_id])
        chat_history = "\n".join(SESSION_MEMORY[session_id].get("history", []))
        response = retrieval_chain.invoke({
            "input": user_query,
            "chat_history": chat_history
        })

        SESSION_MEMORY[session_id]["history"].extend([
            f"Human: {user_query}",
            f"AI: {response['answer']}"
        ])
        save_sessions()

        return {"response": response["answer"]}

    except ValueError as e:
        if "HuggingFace API token" in str(e):
            raise HTTPException(status_code=401, detail="Invalid HuggingFace API credentials")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error during chat: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")
