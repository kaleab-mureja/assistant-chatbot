import os
import shutil
import logging
from typing import Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from langchain_community.chat_message_histories import ChatMessageHistory
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_huggingface import HuggingFaceEndpoint

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Configuration ---
app = FastAPI()
upload_dir = "uploaded_pdfs"
os.makedirs(upload_dir, exist_ok=True)
sessions: Dict[str, Dict[str, Any]] = {}

origins = [
    "http://localhost:3000",
    "http://localhost",
    "http://127.0.0.1:3000",
    "null" # This allows requests from a local file opened in a browser
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models ---
class ChatRequest(BaseModel):
    session_id: str
    user_query: str

# --- Helper Functions ---
async def process_pdf(file_path: str, session_id: str):
    logger.info(f"Processing PDF for session: {session_id}")
    try:
        loader = PyPDFLoader(file_path)
        documents = loader.load()
        
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = text_splitter.split_documents(documents)
        
        embeddings_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
        
        vector_store = FAISS.from_documents(chunks, embeddings_model)
        
        llm = HuggingFaceEndpoint(
            repo_id="google/flan-t5-base",
            temperature=0.5,
        )
        
        chat_history = ChatMessageHistory()
        
        sessions[session_id] = {
            "vector_store": vector_store,
            "llm": llm,
            "chat_history": chat_history,
        }
        logger.info(f"PDF processed and components stored for session: {session_id}")
    except Exception as e:
        logger.error(f"Error processing PDF: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {e}")

# --- API Endpoints ---
@app.post("/upload-pdf/")
async def upload_pdf(session_id: str = Form(...), file: UploadFile = File(...)):
    if session_id in sessions:
        logger.info(f"Existing session found for {session_id}. Resetting.")
        del sessions[session_id]
        
    try:
        file_location = os.path.join(upload_dir, file.filename)
        with open(file_location, "wb+") as file_object:
            shutil.copyfileobj(file.file, file_object)
        
        await process_pdf(file_location, session_id)
        
        return JSONResponse(content={"message": "PDF processed successfully", "session_id": session_id})
    except Exception as e:
        logger.error(f"Error in /upload-pdf/: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during upload.")

@app.post("/chat/")
async def chat(request: ChatRequest):
    session = sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found. Please upload a PDF first.")
        
    try:
        vector_store = session["vector_store"]
        llm = session["llm"]
        chat_history = session["chat_history"]
        
        retriever = vector_store.as_retriever()
        relevant_docs = retriever.invoke(request.user_query)
        context = " ".join([doc.page_content for doc in relevant_docs])
        
        prompt = (
            f"You are a helpful AI assistant. Use the following pieces of context to answer the question at the end. "
            f"If you don't know the answer, just say that you don't know, don't try to make up an answer.\n\n"
            f"Context: {context}\n\n"
            f"Question: {request.user_query}\n\n"
            f"Helpful Answer:"
        )

        result = llm.invoke(prompt)

        chat_history.add_user_message(request.user_query)
        chat_history.add_ai_message(result)
        
        return JSONResponse(content={"response": result})
    except Exception as e:
        logger.error(f"Error in /chat/: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error during chat: {e}")

@app.get("/health/")
async def health_check():
    return {"status": "ok"}
