"use client";

import {useState, useRef, useEffect} from "react";

export default function ChatWindow() {

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [sessionId, setSessionId] = useState(null);
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({behavior:"smooth"});
    }, [messages, loading]);

    async function handleSend(){
         if (!input.trim()) return;

        const userMessage = {role: "user", content: input}
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setLoading(true);

        try {
            const response = await fetch("http://127.0.0.1:8000/api/chat/", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    session_id: sessionId,
                    question: userMessage.content,
                }),
            })

            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}`);
            }

            const data = await response.json();

            setSessionId(data.session_id);
            setMessages((prev) => [
                ...prev,
                {role: "assistant", content: data.answer, sources: data.sources},
            ]);

        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {role:"assistant", content: `Error: ${error.message}`},
            ]);
        } finally {
            setLoading(false);
        }

    }

    return (
        <div className="flex flex-col h-screen max-w-2xl mx-auto p-4">
            <div className="flex-1 overflow-y-auto space-y-3 mb-4">

                {messages.length === 0 && !loading && (
                    <div className="text-center text-gray-400 mt-10">
                        Ask a question about Engr. Sean's background to get started
                    </div>
                )}

                {messages.map((msg, i) => (
                    <MessageBubble key={i} message={msg} />
                ))}

                {loading && (
                    <div className="bg-gray-200 text-gray-500 italic p-3 rounded-lg max-w-[80%] mr-auto">
                        Thinking...
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <div className="flex gap-2">
                <input
                  className="flex-1 border rounded-lg px-3 py-2"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Ask anything..."
                  disabled={loading}
                />
                <button
                    className="bg-blue-500 text-white px-4 py-2 rounded-lg"
                    onClick={handleSend}
                    disabled={loading}
                >
                    Send
                </button>
            </div>
        </div>
    );
}

function MessageBubble({ message }) {
    if (message.role === "error") {
        return (
            <div className="bg-red-100 text-red-700 border border-red-300 p-3 rounded-lg max-w-[80%] mr-auto">
                {message.content}
            </div>
        );
    }

    const isUser = message.role === "user";

    return (
        <div
          className={`p-3 rounded-lg max-w-[80%] ${
            isUser ? "bg-blue-500 text-white ml-auto" : "bg-gray-200 text-black mr-auto"
          }`}
        >
            <div>{message.content}</div>

            {!isUser && message.sources && message.sources.length > 0 && (
                <details className="mt-2 text-xs text-gray-600">
                    <summary className="cursor-pointer select-none">
                        Sources ({message.sources.length})
                    </summary>

                    <div className="mt-1 space-y-1">

                        {message.sources.map((s, i) => (
                            <div key={i} className="bg-white/60 rounded p-2">
                                <div className="font-medium">{s.original_filename}</div>
                                <div className="line-clamp-3">{s.content}</div>
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
}

