'use client';

import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import ChatSidebar from '../app/components/ChatSidebar';
import { FiMenu } from 'react-icons/fi';

type Message = {
  text: string;
  sender: 'user' | 'ai';
};

type Session = {
  session_id: string;
  history: string[];
  title: string;
};

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        isSidebarOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node) &&
        window.innerWidth < 768
      ) {
        setIsSidebarOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isSidebarOpen]);

  const fetchSessions = async () => {
    try {
      const response = await axios.get('http://localhost:8000/sessions/');
      const fetchedSessions: Session[] = response.data;
      setSessions(fetchedSessions);
      if (fetchedSessions.length > 0 && !sessionId) {
        setSessionId(fetchedSessions[0].session_id);
        const firstSessionHistory = fetchedSessions[0].history.map(msg => {
          if (msg.startsWith("Human: ")) return { text: msg.substring(7), sender: "user" as const };
          return { text: msg.substring(4), sender: "ai" as const };
        });
        setMessages(firstSessionHistory);
      } else if (fetchedSessions.length === 0 && !sessionId) {
        setSessionId(uuidv4());
      }
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
      if (!sessionId) {
        setSessionId(uuidv4());
      }
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files?.[0] || null);
      setFileName(e.target.files?.[0]?.name || '');
    } else {
      setFile(null);
      setFileName('');
    }
  };

  const handleFileUpload = async () => {
    if (!file || !sessionId) return;

    setLoading(true);
    setMessages([{ text: 'Uploading and processing PDF...', sender: 'ai' }]);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);

    try {
      await axios.post('http://localhost:8000/upload-pdf/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setLoading(false);
      setMessages([
        { text: 'PDF processed successfully! You can now ask questions about the document.', sender: 'ai' },
      ]);
      fetchSessions();
    } catch (error) {
      console.error('File upload failed:', error);
      setLoading(false);
      setMessages([{ text: 'Failed to process PDF. Please try again.', sender: 'ai' }]);
    }
  };

  const handleChat = async () => {
    if (!input.trim() || !sessionId) return;

    const userMessage = { text: input, sender: 'user' as const };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post(
        'http://localhost:8000/chat/',
        {
          user_query: input,
          session_id: sessionId,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const aiMessage = { text: response.data.response, sender: 'ai' as const };
      setMessages((prev) => [...prev, aiMessage]);
      fetchSessions();
    } catch (error) {
      console.error('Chat failed:', error);
      const errorMessage = { text: 'Sorry, something went wrong. Please try again.', sender: 'ai' as const };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSession = (id: string) => {
    setSessionId(id);
    const selectedSession = sessions.find(s => s.session_id === id);
    if (selectedSession) {
      const newMessages = selectedSession.history.map(msg => {
        if (msg.startsWith("Human: ")) return { text: msg.substring(7), sender: "user" as const };
        return { text: msg.substring(4), sender: "ai" as const };
      });
      setMessages(newMessages);
      setFile(null);
      setFileName(selectedSession.title);
    }
    setIsSidebarOpen(false);
  };

  const handleCreateNew = () => {
    setSessionId(uuidv4());
    setMessages([]);
    setFile(null);
    setFileName("");
    setIsSidebarOpen(false);
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await axios.delete(`http://localhost:8000/sessions/${id}`);
      fetchSessions();
      if (id === sessionId) {
        handleCreateNew();
      }
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-900 to-gray-950 text-gray-100 font-sans relative">
      <div
        ref={sidebarRef}
        className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out md:static md:w-auto md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
        }`}
      >
        <ChatSidebar
          sessions={sessions}
          onSelectSession={handleSelectSession}
          onCreateNew={handleCreateNew}
          onDeleteSession={handleDeleteSession}
          activeSessionId={sessionId}
        />
      </div>

      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="w-full bg-gray-800/50 backdrop-blur-md border-b border-gray-700/50 shadow-lg p-4 flex items-center justify-between md:justify-center">
          <button
            className="md:hidden p-2 text-gray-400 hover:text-white transition-colors duration-200"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            <FiMenu className="h-6 w-6" />
          </button>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Assistant Chat Bot
          </h1>
          <div className="w-10 md:hidden" />
        </header>

        <main className="flex-1 flex flex-col items-center p-4 md:p-6 overflow-hidden">
          <div className="flex flex-col w-full max-w-4xl h-full bg-gray-800/50 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-700/30 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <div className="mb-4 p-4 bg-gray-800/50 rounded-full">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-12 w-12"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-medium mb-2">Start a conversation</h3>
                  <p className="text-center max-w-md">
                    Upload a PDF document and ask questions about its content.
                  </p>
                </div>
              )}

              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] p-4 rounded-2xl shadow-lg transition-all duration-200 ${
                      msg.sender === 'user'
                        ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-none'
                        : 'bg-gray-700/80 text-gray-100 rounded-bl-none'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                    <div className="text-xs mt-1 opacity-70">
                      {msg.sender === 'user' ? 'You' : 'Assistant'}
                    </div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] p-4 rounded-2xl bg-gray-700/80 text-gray-200 rounded-bl-none">
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"></div>
                      <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 bg-gray-800/30 border-t border-gray-700/50">
              {fileName && (
                <div className="flex justify-between items-center mb-3 px-4 py-2 bg-gray-700/50 rounded-full backdrop-blur-sm">
                  <div className="flex items-center space-x-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-blue-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                    <p className="text-sm text-gray-300 truncate max-w-xs">{fileName}</p>
                  </div>
                  <button
                    onClick={() => { setFile(null); setFileName(''); }}
                    className="text-gray-400 hover:text-white transition-colors duration-200"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              )}

              <div className="flex items-center space-x-3">
                <label className="cursor-pointer bg-gray-700/50 hover:bg-gray-700/70 w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200 group">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-gray-400 group-hover:text-blue-400 transition-colors duration-200"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                </label>

                {file && (
                  <button
                    onClick={handleFileUpload}
                    disabled={!file || loading}
                    className={`w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200 ${
                      !file || loading
                        ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                        : 'bg-green-600/90 hover:bg-green-600 text-white'
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </button>
                )}

                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChat()}
                    placeholder="Ask something about the document..."
                    className="w-full bg-gray-700/50 border border-gray-700/50 focus:border-blue-500/50 p-3 pr-12 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-white placeholder-gray-500 transition-all duration-200"
                    disabled={loading}
                  />
                  <button
                    onClick={handleChat}
                    disabled={!input.trim() || loading || !fileName}
                    className={`absolute right-2 top-1/2 transform -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200 ${
                      !input.trim() || loading || !fileName
                        ? 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 5l7 7-7 7M5 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
