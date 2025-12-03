console.log(">>> BACKEND START (threads + GPT + Gemini) <<<");

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const pool = require("./db");
require("dotenv").config({ path: "../.env" });

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// ---------- AUTH MIDDLEWARE ----------
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;

    if (!token) {
        return res.status(401).json({ error: "No token provided." });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.userId = payload.userId;
        next();
    } catch (err) {
        console.error("authMiddleware error:", err.message);
        return res.status(401).json({ error: "Invalid or expired token." });
    }
}

// ---------- HEALTH ----------
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Backend is running!" });
});

// ===================================================================
// AUTH: SIGNUP / LOGIN
// ===================================================================

app.post("/auth/signup", async (req, res) => {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
        return res
            .status(400)
            .json({ error: "Name, email, and password are required." });
    }

    try {
        const [rows] = await pool.execute(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );
        if (rows.length > 0) {
            return res.status(409).json({ error: "Email already registered." });
        }

        // NOTE: for production, hash the password (bcrypt).
        const [result] = await pool.execute(
            "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
            [name, email, password]
        );

        const userId = result.insertId;
        const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });

        res.json({
            token,
            user: { id: userId, name, email },
        });
    } catch (err) {
        console.error("Error in /auth/signup:", err);
        res.status(500).json({ error: "Server error during signup." });
    }
});

app.post("/auth/login", async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
        return res
            .status(400)
            .json({ error: "Email and password are required." });
    }

    try {
        const [rows] = await pool.execute(
            "SELECT id, name, password FROM users WHERE email = ?",
            [email]
        );
        if (rows.length === 0) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        const user = rows[0];
        // plain text compare; in prod use bcrypt.compare
        if (user.password !== password) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

        res.json({
            token,
            user: { id: user.id, name: user.name, email },
        });
    } catch (err) {
        console.error("Error in /auth/login:", err);
        res.status(500).json({ error: "Server error during login." });
    }
});

// ===================================================================
// GPT & GEMINI HELPERS
// ===================================================================

async function getGptAnswer(question) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return "OpenAI API key not configured yet.";
    }

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: question },
                ],
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("OpenAI error:", data);
            return `OpenAI error: ${data.error?.message || "unknown error"}`;
        }

        return data.choices?.[0]?.message?.content || "No answer from GPT.";
    } catch (err) {
        console.error("Error calling GPT:", err);
        return "Error contacting GPT.";
    }
}

async function getGeminiAnswer(question) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return "Gemini API key not configured yet.";
    }

    try {
        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
            {
                method: "POST",
                headers: {
                    "x-goog-api-key": apiKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: question }] }],
                }),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini error:", data);
            return `Gemini error: ${data.error?.message || "unknown error"}`;
        }

        return (
            data.candidates?.[0]?.content?.parts?.[0]?.text ||
            "No answer from Gemini."
        );
    } catch (err) {
        console.error("Error calling Gemini:", err);
        return "Error contacting Gemini.";
    }
}

function pickBestAnswer(gptAnswer, geminiAnswer) {
    const gpt = gptAnswer || "";
    const gem = geminiAnswer || "";

    if (!gpt && !gem) {
        return { bestAnswer: "No models returned an answer.", model: "none" };
    }
    if (!gpt) {
        return { bestAnswer: gem, model: "gemini-2.5-flash" };
    }
    if (!gem) {
        return { bestAnswer: gpt, model: "gpt-4o-mini" };
    }

    // simple judge
    if (gem.length > gpt.length) {
        return { bestAnswer: gem, model: "gemini-2.5-flash" };
    }
    return { bestAnswer: gpt, model: "gpt-4o-mini" };
}

// ===================================================================
// CHAT + THREADS
// ===================================================================

// POST /api/chat
app.post("/api/chat", authMiddleware, async (req, res) => {
    const { question, rootConversationId } = req.body || {};
    console.log(">>> /api/chat", { userId: req.userId, question, rootConversationId });

    if (!question || typeof question !== "string") {
        return res.status(400).json({ error: "Question is required." });
    }

    try {
        const [gpt, gemini] = await Promise.all([
            getGptAnswer(question),
            getGeminiAnswer(question),
        ]);

        const { bestAnswer, model } = pickBestAnswer(gpt, gemini);

        let rootId = rootConversationId || null;

        const [result] = await pool.execute(
            `INSERT INTO conversations
       (user_id, question, best_answer, model_used, root_conversation_id)
       VALUES (?, ?, ?, ?, ?)`,
            [req.userId, question, bestAnswer, model, rootId]
        );

        const insertedId = result.insertId;

        if (!rootId) {
            rootId = insertedId;
            await pool.execute(
                `UPDATE conversations
         SET root_conversation_id = ?
         WHERE id = ?`,
                [rootId, insertedId]
            );
        }

        res.json({
            originalQuestion: question,
            bestAnswer,
            chosenModel: model,
            modelsConsidered: [
                { model: "gpt-4o-mini", answer: gpt },
                { model: "gemini-2.5-flash", answer: gemini },
            ],
            rootConversationId: rootId,
        });
    } catch (err) {
        console.error("Error in /api/chat:", err);
        res.status(500).json({ error: "Server error in chat." });
    }
});

// GET /api/history – list threads
app.get("/api/history", authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id, question, best_answer, model_used, created_at
       FROM conversations
       WHERE user_id = ?
         AND id = root_conversation_id
       ORDER BY created_at DESC
       LIMIT 20`,
            [req.userId]
        );

        res.json({ items: rows });
    } catch (err) {
        console.error("Error in /api/history:", err);
        res
            .status(500)
            .json({ error: "Server error while loading history (threads)." });
    }
});

// GET /api/thread/:id – full conversation
app.get("/api/thread/:id", authMiddleware, async (req, res) => {
    const threadId = req.params.id;

    try {
        const [rows] = await pool.execute(
            `SELECT id, question, best_answer, model_used, created_at
       FROM conversations
       WHERE user_id = ?
         AND root_conversation_id = ?
       ORDER BY created_at ASC`,
            [req.userId, threadId]
        );

        res.json({ items: rows });
    } catch (err) {
        console.error("Error in /api/thread:", err);
        res
            .status(500)
            .json({ error: "Server error while loading conversation thread." });
    }
});

// DELETE /api/thread/:id – delete a full thread
app.delete("/api/thread/:id", authMiddleware, async (req, res) => {
    const threadId = req.params.id;

    try {
        const [rows] = await pool.execute(
            `SELECT id FROM conversations
       WHERE id = ? AND user_id = ? AND id = root_conversation_id`,
            [threadId, req.userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Thread not found." });
        }

        await pool.execute(
            `DELETE FROM conversations
       WHERE root_conversation_id = ? AND user_id = ?`,
            [threadId, req.userId]
        );

        console.log("Deleted thread", threadId, "for user", req.userId);
        res.json({ success: true });
    } catch (err) {
        console.error("Error deleting thread:", err);
        res
            .status(500)
            .json({ error: "Server error while deleting thread." });
    }
});

// ===================================================================
// START SERVER
// ===================================================================
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
