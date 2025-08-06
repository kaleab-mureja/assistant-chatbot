import os
from dotenv import load_dotenv
from typing import Dict, Any, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import shutil
from pydantic import BaseModel
import asyncio
import logging

from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import FAISS
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferMemory

# 1. Initialize logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# 2. Load environment variables
load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    logger.error("GOOGLE_API_KEY not found. Please set it in your .env file.")
    raise HTTPException(status_code=500, detail="API key not configured.")

# 3. Initialize FastAPI app
app = FastAPI()

# 4. Configure CORS
origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 5. Global dictionary to store session data
sessions: Dict[str, Dict[str, Any]] = {}

# 6. Initialize models and components
embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001", google_api_key=GOOGLE_API_KEY)

# *** IMPORTANT FIX: Changed model from 'gemini-pro' to 'gemini-1.5-pro' to resolve the 404 error ***
llm = ChatGoogleGenerativeAI(model="gemini-1.5-pro", temperature=0.3, google_api_key=GOOGLE_API_KEY)

# 7. Helper function to get/create a session
def get_session(session_id: str) -> Dict[str, Any]:
    logger.debug(f"Attempting to get session for ID: {session_id}")
    if session_id not in sessions:
        logger.debug(f"Session ID {session_id} not found. Creating new session.")
        memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)
        sessions[session_id] = {"vector_store": None, "memory": memory}
    else:
        logger.debug(f"Session ID {session_id} found. Loading existing session.")
    
    session_data = sessions[session_id]
    logger.debug(f"Retrieved session data. Vector Store exists: {session_data['vector_store'] is not None}")
    logger.debug(f"Retrieved session data. Memory exists: {session_data['memory'] is not None}")
    return session_data

# 8. Pydantic model for chat requests
class ChatRequest(BaseModel):
    session_id: str
    user_query: str

# 9. PDF Upload Endpoint
@app.post("/upload-pdf/")
async def upload_pdf(session_id: str = Form(...), file: UploadFile = File(...)):
    """
    Handles PDF upload, processes the document, and creates a vector store for a session.
    """
    try:
        session_data = get_session(session_id)
        
        upload_dir = "uploaded_pdfs"
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.info(f"Attempting to load document from: {file_path}")

        loader = PyPDFLoader(file_path)
        pages = loader.load_and_split()
        logger.info(f"Number of documents (pages/sections) loaded: {len(pages)}")
        
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
        docs = text_splitter.split_documents(pages)
        logger.info(f"Number of chunks created: {len(docs)}")

        logger.info("Creating vector store...")
        vector_store = await asyncio.to_thread(FAISS.from_documents, docs, embeddings)
        session_data["vector_store"] = vector_store
        logger.info("Vector store created.")

        return JSONResponse(content={"message": "PDF processed and vector store created.", "session_id": session_id}, status_code=200)

    except Exception as e:
        logger.error(f"Failed to process PDF for session {session_id}: {e}", exc_info=True)
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Error during PDF upload and processing: {e}")

# 10. Chat Endpoint
@app.post("/chat/")
async def chat(request: ChatRequest):
    """
    Handles user chat queries by retrieving context from the vector store
    and generating a response using the LLM.
    """
    logger.debug(f"Chat request received for session ID: {request.session_id}")
    logger.debug(f"User query: {request.user_query}")
    
    session_data = get_session(request.session_id)
    vector_store = session_data.get("vector_store")
    memory = session_data.get("memory")

    if not vector_store:
        raise HTTPException(status_code=400, detail="PDF not processed for this session. Please upload a PDF first.")

    try:
        retriever = vector_store.as_retriever()
        
        qa_chain = ConversationalRetrievalChain.from_llm(
            llm=llm,
            retriever=retriever,
            memory=memory,
            return_source_documents=True
        )

        logger.debug(f"Invoking QA chain with query: {request.user_query}")
        response = await qa_chain.ainvoke({"question": request.user_query})

        ai_message = response.get("answer", "I'm sorry, I couldn't find an answer in the document.")
        source_documents = response.get("source_documents", [])
        
        return JSONResponse(content={"ai_message": ai_message, "source_documents": [doc.metadata.get('source') for doc in source_documents]}, status_code=200)

    except Exception as e:
        logger.error(f"Unhandled exception during chat for session {request.session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error processing chat request.")
