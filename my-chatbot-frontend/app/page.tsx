"use client";

import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ text: string; sender: 'user' | 'ai' }[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const BASE_URL = 'http://127.0.0.1:8000';

  useEffect(() => {
    setSessionId(uuidv4());
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setFileName(e.target.files[0].name);
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
      await axios.post(`${BASE_URL}/upload-pdf/`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setMessages([
        { text: 'PDF processed successfully. You can now ask questions about the document.', sender: 'ai' },
      ]);
    } catch (error) {
      console.error('Error uploading file:', error);
      setMessages([{ text: 'Error processing PDF. Please try again.', sender: 'ai' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || loading || !sessionId) return;

    const userMessage = { text: input, sender: 'user' as 'user' };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post(`${BASE_URL}/chat/`, {
        session_id: sessionId,
        user_query: input,
      });
      const aiMessage = { text: response.data.ai_message, sender: 'ai' as 'ai' };
      setMessages((prevMessages) => [...prevMessages, aiMessage]);
    } catch (error: any) {
      console.error('Error sending message:', error);
      if (error.response && error.response.data && error.response.data.detail) {
        setMessages((prevMessages) => [...prevMessages, { text: error.response.data.detail, sender: 'ai' }]);
      } else {
        setMessages((prevMessages) => [...prevMessages, { text: 'Sorry, something went wrong. Please try again later.', sender: 'ai' }]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="bg-gray-100 min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white shadow-lg rounded-md flex flex-col h-[90vh]">
        
        {/* Header */}
        <div className="bg-blue-700 text-white p-5 rounded-t-md text-center shadow-md">
          <h1 className="text-3xl font-bold tracking-tight">Assistant Chatbot</h1>
        </div>

        {/* Chat window */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xl p-4 rounded-lg shadow-md ${
                  msg.sender === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-800'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* User input area */}
        <div className="p-5 border-t border-gray-200 bg-gray-50 rounded-b-md shadow-md">
          <div className="flex flex-col space-y-4">
            <div className="flex flex-row items-center space-x-3">
              <label
                htmlFor="file-upload"
                className="cursor-pointer px-4 py-2 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 text-sm font-semibold transition duration-200 ease-in-out"
              >
                Choose File
              </label>
              <input
                id="file-upload"
                type="file"
                className="sr-only"
                onChange={handleFileChange}
                disabled={loading}
              />
              {fileName && (
                <span className="bg-gray-100 text-gray-700 text-sm rounded-md px-2 py-1">
                  {fileName}
                </span>
              )}
              <button
                onClick={handleFileUpload}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-sm font-semibold transition duration-200 ease-in-out"
                disabled={!file || loading}
              >
                Upload
              </button>
            </div>

            <div className="flex space-x-3">
              <input
                type="text"
                className="flex-1 p-3 bg-gray-100 border border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 text-gray-800 transition duration-200 ease-in-out"
                placeholder="Ask me a question about the document..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !loading) {
                    handleSendMessage();
                  }
                }}
                disabled={loading}
              />
              <button
                onClick={handleSendMessage}
                className="px-6 py-3 bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:opacity-50 text-sm font-semibold transition duration-200 ease-in-out"
                disabled={loading || input.trim() === ''}
              >
                {loading ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
          {!sessionId && <p className="text-red-500 text-sm mt-2">Initializing session...</p>}
        </div>
      </div>
    </div>
  );
}

export default App;
