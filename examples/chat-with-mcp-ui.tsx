/**
 * Example: Chat UI Component with MCP Tool Support
 *
 * This component demonstrates how to handle MCP tool execution events
 * in the chat UI for a better user experience.
 */

'use client';

import { useState, useEffect, useRef } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolExecutions?: ToolExecution[];
}

interface ToolExecution {
  tool: string;
  status: 'executing' | 'completed' | 'failed';
  result?: unknown;
}

export function ChatWithMCPTools() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentToolExecutions, setCurrentToolExecutions] = useState<ToolExecution[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setCurrentToolExecutions([]);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';
      const toolExecutions: ToolExecution[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(line.slice(6));

            // Handle different event types
            if (data.type === 'tool_execution') {
              // Tool is starting to execute
              console.log(`🔧 Executing tool: ${data.tool}`);
              const execution: ToolExecution = {
                tool: data.tool,
                status: 'executing',
              };
              toolExecutions.push(execution);
              setCurrentToolExecutions([...toolExecutions]);
            } else if (data.type === 'tool_result') {
              // Tool execution completed
              console.log(`✅ Tool ${data.tool} ${data.success ? 'succeeded' : 'failed'}`);
              const execution = toolExecutions.find(e => e.tool === data.tool);
              if (execution) {
                execution.status = data.success ? 'completed' : 'failed';
                setCurrentToolExecutions([...toolExecutions]);
              }
            } else if (data.type === 'metadata') {
              // Final metadata, stream complete
              console.log('📊 Session metadata:', data);
            } else if (data.delta !== undefined) {
              // Regular chat content
              assistantMessage = data.content;

              // Update the assistant's message in real-time
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];

                if (lastMessage && lastMessage.role === 'assistant') {
                  // Update existing message
                  lastMessage.content = assistantMessage;
                  lastMessage.toolExecutions = [...toolExecutions];
                } else {
                  // Add new message
                  newMessages.push({
                    role: 'assistant',
                    content: assistantMessage,
                    timestamp: new Date(),
                    toolExecutions: [...toolExecutions],
                  });
                }

                return newMessages;
              });
            }
          } catch (error) {
            console.error('Failed to parse SSE data:', error);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request aborted');
      } else {
        console.error('Chat error:', error);
        setMessages(prev => [
          ...prev,
          {
            role: 'system',
            content: 'Sorry, there was an error processing your message.',
            timestamp: new Date(),
          },
        ]);
      }
    } finally {
      setIsLoading(false);
      setCurrentToolExecutions([]);
      abortControllerRef.current = null;
    }
  };

  const cancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4">
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`p-4 rounded-lg ${
              msg.role === 'user'
                ? 'bg-blue-100 ml-auto max-w-[80%]'
                : msg.role === 'assistant'
                ? 'bg-gray-100 mr-auto max-w-[80%]'
                : 'bg-yellow-50 text-center'
            }`}
          >
            <div className="font-semibold mb-1 capitalize">{msg.role}</div>
            <div className="whitespace-pre-wrap">{msg.content}</div>

            {/* Show tool executions for assistant messages */}
            {msg.toolExecutions && msg.toolExecutions.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-300">
                <div className="text-sm font-semibold text-gray-600 mb-1">
                  Tools Used:
                </div>
                {msg.toolExecutions.map((tool, toolIdx) => (
                  <div key={toolIdx} className="text-xs text-gray-500 flex items-center gap-2">
                    {tool.status === 'executing' && (
                      <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    )}
                    {tool.status === 'completed' && (
                      <span className="text-green-500">✓</span>
                    )}
                    {tool.status === 'failed' && (
                      <span className="text-red-500">✗</span>
                    )}
                    <span>{tool.tool.replace('__', ' → ')}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="text-xs text-gray-500 mt-2">
              {msg.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}

        {/* Show current tool executions */}
        {isLoading && currentToolExecutions.length > 0 && (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="font-semibold text-blue-900 mb-2">
              🔧 Executing Tools...
            </div>
            {currentToolExecutions.map((tool, idx) => (
              <div key={idx} className="text-sm text-blue-700 flex items-center gap-2">
                {tool.status === 'executing' && (
                  <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                )}
                {tool.status === 'completed' && (
                  <span className="text-green-600">✓</span>
                )}
                {tool.status === 'failed' && (
                  <span className="text-red-600">✗</span>
                )}
                <span>{tool.tool}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t pt-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && !isLoading && sendMessage(input)}
            placeholder="Type a message... (e.g., 'List files in /tmp' or 'What time is it?')"
            disabled={isLoading}
            className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
          {isLoading ? (
            <button
              onClick={cancelRequest}
              className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
            >
              Send
            </button>
          )}
        </div>

        {/* Example Prompts */}
        <div className="mt-2 text-sm text-gray-500">
          <div className="font-semibold mb-1">Try these examples:</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setInput('List the files in /tmp directory')}
              className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
            >
              📁 List files
            </button>
            <button
              onClick={() => setInput('What is the current time?')}
              className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
            >
              🕐 Current time
            </button>
            <button
              onClick={() => setInput('Read the contents of /tmp/test.txt')}
              className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
            >
              📄 Read file
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatWithMCPTools;
