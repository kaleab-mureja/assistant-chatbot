import React from 'react';
import { FiPlus, FiMessageSquare, FiTrash2 } from 'react-icons/fi';

type Session = {
  session_id: string;
  history: string[];
  title: string;
};

type ChatSidebarProps = {
  sessions: Session[];
  onSelectSession: (sessionId: string) => void;
  onCreateNew: () => void;
  onDeleteSession?: (sessionId: string) => void;
  activeSessionId: string | null;
};

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  sessions,
  onSelectSession,
  onCreateNew,
  onDeleteSession,
  activeSessionId
}) => {
  return (
    <div className="w-64 md:w-72 lg:w-80 h-full bg-gray-900/50 backdrop-blur-md border-r border-gray-700/30 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700/30">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Chat History
          </h2>
          <button
            onClick={onCreateNew}
            className="p-2 bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-500 hover:to-blue-600 transition-all duration-200 shadow-md hover:shadow-blue-500/20 flex items-center gap-2"
          >
            <FiPlus className="text-lg" />
            <span className="hidden md:inline">New Chat</span>
          </button>
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4 text-center">
            <FiMessageSquare className="text-3xl mb-3 opacity-60" />
            <p>No chat history yet</p>
            <p className="text-sm mt-1">Start a new conversation to see it here</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <div
                key={session.session_id}
                onClick={() => onSelectSession(session.session_id)}
                className={`group relative flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                  activeSessionId === session.session_id
                    ? 'bg-gradient-to-r from-blue-600/20 to-blue-800/20 border border-blue-500/30 shadow-lg'
                    : 'hover:bg-gray-800/50 border border-transparent'
                }`}
              >
                <div className="flex items-center min-w-0">
                  <div className={`w-3 h-3 rounded-full mr-3 flex-shrink-0 ${
                    activeSessionId === session.session_id
                      ? 'bg-blue-400 shadow-[0_0_8px_2px_rgba(96,165,250,0.3)]'
                      : 'bg-gray-600 group-hover:bg-gray-500'
                  }`} />
                  <p className={`text-sm truncate ${
                    activeSessionId === session.session_id
                      ? 'text-white font-medium'
                      : 'text-gray-300 group-hover:text-white'
                  }`}>
                    {session.title || 'New Conversation'}
                  </p>
                </div>
                {onDeleteSession && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.session_id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all duration-200 p-1"
                    title="Delete chat"
                  >
                    <FiTrash2 className="text-sm" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700/30 text-xs text-gray-500">
        <p>Assistant Chat Bot v1.0</p>
      </div>
    </div>
  );
};

export default ChatSidebar;
