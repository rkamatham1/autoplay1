import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// --- CONFIGURATION ---
// IMPORTANT: Replace these placeholder values with your actual credentials.
const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const API_KEY = process.env.GROQ_API_KEY; // Your Groq API Key
const SERVICENOW_INSTANCE = "https://dev274092.service-now.com/api/now/table/incident"; // Your ServiceNow instance URL
const SN_USERNAME = "admin"; // Your ServiceNow username
const SN_PASSWORD = process.env.SERVICENOW_PASSWORD; // Your ServiceNow password

// --- MIDDLEWARE SETUP ---
app.use(cors({ origin: "http://localhost:3001" })); // Allows frontend to connect
app.use(express.json()); // Parses incoming JSON requests

// --- IN-MEMORY SESSION STORE ---
// Note: This is for demonstration. For production, use a persistent store like Redis.
const sessions = {};

// --- HELPER FUNCTIONS ---

/**
 * Calls the Groq AI model to get a response.
 * @param {Array<object>} messages - The conversation history.
 * @returns {Promise<string>} The AI's response text.
 */
async function getAIResponse(messages) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: messages,
      }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("AI API Error Response:", errorBody);
        throw new Error(`AI API request failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "I'm having trouble connecting to my brain right now. Please try again.";
  } catch (error) {
    console.error("Error in getAIResponse:", error);
    return "An unexpected error occurred while thinking. Please try again.";
  }
}

/**
 * Creates an incident ticket in ServiceNow.
 * @param {string} short_description - A brief summary of the issue.
 * @param {string} description - The full description and context.
 * @returns {Promise<string>} The ticket number or an error string.
 */
async function createTicket(short_description, description) {
  const TICKET_API_URL = `${SERVICENOW_INSTANCE}`;
  try {
    const res = await fetch(TICKET_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(`${SN_USERNAME}:${SN_PASSWORD}`).toString("base64"),
      },
      body: JSON.stringify({
        short_description,
        description,
        category: "inquiry",
      }),
    });

    if (!res.ok) {
        const errorBody = await res.text();
        console.error("ServiceNow API Error Response:", errorBody);
        throw new Error(`ServiceNow API request failed with status ${res.status}`);
    }
    
    const json = await res.json();
    return json.result?.number || "TICKET_ERROR";
  } catch (error) {
    console.error("Error in createTicket:", error);
    return "TICKET_CREATION_FAILED";
  }
}


// --- MAIN CHAT ENDPOINT ---
app.post("/ask", async (req, res) => {
  const { message, sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ reply: "Error: Missing session ID." });
  }

  // Initialize session if it's new
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      stage: "askName",
      history: [{ role: "assistant", content: "Hello! I'm a virtual IT assistant. To start, what is your name?" }],
      user: {},
      ticketCreated: false,
    };
  }

  const session = sessions[sessionId];
  
  // Don't add initial empty message from frontend to history
  if (message) {
      session.history.push({ role: "user", content: message });
  }

  let reply = "";

  // --- CONVERSATION STATE MACHINE ---
  switch (session.stage) {
    case "askName":
      session.user.name = message.trim();
      session.stage = "askEmail";
      reply = `Thanks, ${session.user.name}! Could you please provide your email?`;
      break;

    case "askEmail":
      session.user.email = message.trim();
      session.stage = "askIssue";
      reply = "Great! Now, please describe your issue in detail.";
      break;

    case "askIssue":
      session.user.issue = message.trim();
      session.stage = "confirmSolution";
      
      // Use AI to generate a solution
      const solutionPrompt = [
        { role: "system", content: "You are an expert IT helpdesk agent. Analyze the user's issue and provide a clear, step-by-step solution. Do not ask for more information, just provide the best possible solution based on the problem described." },
        { role: "user", content: session.user.issue }
      ];
      const solution = await getAIResponse(solutionPrompt);
      
      reply = `${solution}\n\nPlease let me know if this solves your issue.`;
      
      // In the background, have the AI summarize the issue for the ticket
      const summaryPrompt = [
         { role: "system", content: "You are an expert summarizer. Read the following IT issue and summarize it into a single, concise sentence (less than 15 words) that would be suitable for a ticket title." },
         { role: "user", content: session.user.issue }
      ];
      session.user.issueSummary = await getAIResponse(summaryPrompt);
      break;

    case "confirmSolution":
      // Use AI to interpret the user's confirmation
      const confirmationPrompt = [
        { role: "system", content: "Analyze the user's message. Did they indicate their problem was solved? Respond with only 'YES' or 'NO'." },
        { role: "user", content: message }
      ];
      const confirmation = await getAIResponse(confirmationPrompt);

      if (confirmation.includes("YES")) {
        reply = "Excellent! I'm glad that solved it. I'll create a ticket to document this for our records.";
      } else {
        reply = "I'm sorry to hear that didn't work. I will escalate this to a technician by creating a support ticket.";
      }

      // Centralized ticket creation
      const ticketNumber = await createTicket(
        session.user.issueSummary || "User issue - summary failed",
        `Issue reported by: ${session.user.name} (${session.user.email})\n\n---\n\nUSER'S DESCRIPTION:\n${session.user.issue}`
      );

      if (ticketNumber.includes("ERROR")) {
        reply += "\n\nUnfortunately, there was an error creating the ticket. Please contact IT support directly.";
      } else {
        reply += `\n\nYour ticket number is: **${ticketNumber}**.`;
      }
      
      session.stage = "ticketCreated";
      reply += "\n\nIs there anything else I can help you with today?";
      break;

    case "ticketCreated":
        const newIssuePrompt = [
            { role: "system", content: "Analyze the user's message. Are they indicating they have a new, different issue? Respond with only 'YES' or 'NO'." },
            { role: "user", content: message }
        ];
        const newIssueConfirmation = await getAIResponse(newIssuePrompt);

        if (newIssueConfirmation.includes("YES")) {
            session.stage = "askIssue";
            session.user.issue = "";
            session.user.issueSummary = "";
            reply = "Okay, please describe your new issue.";
        } else {
            reply = "Thank you for using the IT helpdesk. Have a great day!";
            // Optionally, you could end the session here by deleting `sessions[sessionId]`
        }
        break;
  }

  session.history.push({ role: "assistant", content: reply });
  res.json({ reply, history: session.history });
});


// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
