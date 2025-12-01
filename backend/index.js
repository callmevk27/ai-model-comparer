// backend/index.js

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000; // our backend will run on http://localhost:3000

// middlewares: these let us accept JSON and allow frontend to call us
app.use(cors());
app.use(express.json());

// Simple test route
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Backend is running!" });
});

// Fake AI chat route for now
app.post("/api/chat", (req, res) => {
    const { question } = req.body;

    // later we will:
    // 1) call GPT
    // 2) call Gemini
    // 3) call Claude / Grok
    // 4) compare answers and choose best
    // For now, just return a dummy response.
    const fakeResponse = {
        bestAnswer:
            "This is a placeholder combined answer. Later I will compare GPT, Gemini, Claude, and Grok here.",
        modelsConsidered: ["gpt (fake)", "gemini (fake)", "claude (fake)", "grok (fake)"],
        originalQuestion: question,
    };

    res.json(fakeResponse);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
