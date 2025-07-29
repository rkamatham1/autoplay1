import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    let id = localStorage.getItem("sessionId");
    if (!id) {
      id = uuidv4();
      localStorage.setItem("sessionId", id);
    }
    setSessionId(id);
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);

    const res = await fetch("http://localhost:3000/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input, sessionId })
    });

    const data = await res.json();
    const aiMsg = { role: "agent", content: data.reply };
    setMessages((prev) => [...prev, aiMsg]);
    setInput("");
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-blue-600 text-white p-4 text-xl">
        L1 Agent (One Ticket per Session)
      </header>

      <div className="flex-1 p-4 overflow-y-auto">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`my-2 p-2 rounded-lg max-w-xl ${
              msg.role === "user"
                ? "bg-blue-100 text-right ml-auto"
                : "bg-green-100 text-left mr-auto"
            }`}
          >
            <strong>{msg.role === "user" ? "You: " : "Agent: "}</strong>
            {msg.content}
          </div>
        ))}
      </div>

      <div className="p-4 bg-white flex">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Type your message..."
          className="border p-2 rounded flex-1 mr-2"
        />
        <button
          onClick={sendMessage}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default App;
