import fetch from "node-fetch";
import dotenv from 'dotenv';

dotenv.config();

// Switch between GPT-4 or Groq here
const API_URL = "https://api.groq.com/openai/v1/chat/completions"; 
const API_KEY = process.env.GROQ_API_KEY; // Replace with your key

async function getAgentReply(userQuery) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: "llama3-8b-8192",
      messages: [
        { role: "system", content: "You are an IT service desk agent. Be helpful and precise." },
        { role: "user", content: userQuery }
      ]
    })
  });

  const data = await response.json();
  console.log("Agent Response:", data.choices[0].message.content);
}

getAgentReply("My email is not syncing with Outlook. What should I do?");
