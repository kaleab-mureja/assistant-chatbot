'use client';

import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

type Message = {
  text: string;
  sender: 'user' | 'ai';
};

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Set a new session ID on component mount
  useEffect(() => {
    setSessionId(uuidv4());
  }, []);

  // Auto-scroll to the bottom of the chat window
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
      const response = await axios.post('http://localhost:8000/upload-pdf/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('File upload successful:', response.data);
      setLoading(false);
      setMessages([
        { text: 'PDF processed successfully! You can now ask questions about the document.', sender: 'ai' },
      ]);
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
    } catch (error) {
      console.error('Chat failed:', error);
      const errorMessage = { text: 'Sorry, something went wrong. Please try again.', sender: 'ai' as const };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white font-sans">
      <header className="bg-gray-900 shadow-md p-4 flex items-center justify-center">
        <h1 className="text-2xl font-semibold text-blue-300">Assistant Chat Bot</h1>
      </header>

      <main className="flex-1 flex justify-center p-6 overflow-hidden">
        <div className="flex flex-col w-full max-w-3xl bg-gray-900 rounded-lg shadow-2xl border border-gray-700">
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-md p-4 rounded-xl shadow-md ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-200'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="max-w-md p-4 rounded-xl bg-gray-800 text-gray-200 animate-pulse">
                  Typing...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 bg-gray-900 border-t border-gray-700">
            {fileName && (
              <div className="flex justify-between items-center mb-2 px-4 py-2 bg-gray-800 rounded-md">
                <p className="text-sm text-gray-300">File: {fileName}</p>
                <button
                  onClick={() => { setFile(null); setFileName(''); }}
                  className="text-gray-400 hover:text-white"
                >
                  &times;
                </button>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <label className="cursor-pointer bg-gray-800 text-gray-400 p-3 rounded-full hover:bg-gray-700">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </label>

              <button
                onClick={handleFileUpload}
                disabled={!file || loading}
                className="bg-green-600 text-white font-bold p-3 rounded-full disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                placeholder="Message Assistant Chat Bot..."
                className="flex-1 bg-gray-800 border border-gray-700 p-3 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
                disabled={loading}
              />
              <button
                onClick={handleChat}
                disabled={!input.trim() || loading || !fileName}
                className="bg-blue-600 text-white p-3 rounded-full disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
