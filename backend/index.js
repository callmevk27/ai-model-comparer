// backend/index.js
console.log(
    ">>> USING INDEX.JS WITH AUTH + GPT + GEMINI + JUDGE <<<"
);

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");
require("dotenv").config({ path: "../.env" });

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_key";

// -------- HEALTH CHECK ----------
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Backend is running!" });
});

// -------- AUTH MIDDLEWARE ----------
function authMiddleware(req, res, next) {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;

    if (!token) {
        return res.status(401).json({ error: "No token provided." });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) {
        console.error("JWT verify error:", err);
        return res.status(401).json({ error: "Invalid or expired token." });
    }
}

// -------- SIGNUP ----------
app.post("/api/signup", async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res
            .status(400)
            .json({ error: "Name, email, and password are required." });
    }

    try {
        // Check if user already exists
        const [rows] = await pool.execute(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );

        if (rows.length > 0) {
            return res
                .status(409)
                .json({ error: "User with this email already exists." });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const [result] = await pool.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            [name, email, passwordHash]
        );

        return res.json({
            success: true,
            message: "Account created successfully. You can now log in.",
            userId: result.insertId,
        });
    } catch (err) {
        console.error("Signup error:", err);
        return res.status(500).json({ error: "Server error during signup." });
    }
});

// -------- LOGIN ----------
app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res
            .status(400)
            .json({ error: "Email and password are required." });
    }

    try {
        const [rows] = await pool.execute(
            "SELECT id, name, email, password_hash FROM users WHERE email = ?",
            [email]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        const token = jwt.sign(
            { userId: user.id },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        return res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
            },
        });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: "Server error during login." });
    }
});

// -------- GPT HELPER ----------
async function getGptAnswer(question) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return "OpenAI API key not configured yet.";
    }

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
        return "No answer from GPT.";
    }

    return data.choices?.[0]?.message?.content || "No answer from GPT.";
}

// -------- GEMINI HELPER ----------
async function getGeminiAnswer(question) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return "Gemini API key not configured yet.";
    }

    const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
            method: "POST",
            headers: {
                "x-goog-api-key": apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [{ text: question }],
                    },
                ],
            }),
        }
    );

    const data = await response.json();

    if (!response.ok) {
        console.error("Gemini error:", data);
        return "No answer from Gemini.";
    }

    return (
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No answer from Gemini."
    );
}

// -------- HELPER: CHECK IF ANSWER IS REAL ----------
function hasRealAnswer(answer) {
    if (!answer) return false;

    const trimmed = answer.trim().toLowerCase();

    if (!trimmed) return false;
    if (trimmed.startsWith("no answer from")) return false;
    if (trimmed.includes("not configured yet")) return false;

    return true;
}

// -------- JUDGE HELPER ----------
async function judgeBestAnswer(question, gptAnswer, geminiAnswer) {
    const apiKey = process.env.OPENAI_API_KEY;

    const gptHas = hasRealAnswer(gptAnswer);
    const geminiHas = hasRealAnswer(geminiAnswer);

    // CASE 1: Neither model gave a real answer
    if (!gptHas && !geminiHas) {
        return {
            bestAnswer:
                gptAnswer ||
                geminiAnswer ||
                "No models could provide an answer.",
            model: "none",
            judgeExplanation: "Neither GPT nor Gemini returned a valid answer.",
        };
    }

    // CASE 2: Only GPT answered
    if (gptHas && !geminiHas) {
        return {
            bestAnswer: gptAnswer,
            model: "gpt-4o-mini",
            judgeExplanation: "Only GPT produced a valid answer.",
        };
    }

    // CASE 3: Only Gemini answered
    if (!gptHas && geminiHas) {
        return {
            bestAnswer: geminiAnswer,
            model: "gemini-2.5-flash",
            judgeExplanation: "Only Gemini produced a valid answer.",
        };
    }

    // CASE 4: Both answered → use GPT as judge
    if (!apiKey) {
        return {
            bestAnswer: gptAnswer,
            model: "gpt-4o-mini",
            judgeExplanation:
                "Both models answered, but no OpenAI key configured for judge; defaulting to GPT.",
        };
    }

    const prompt = `
You are an impartial judge comparing answers from two AI models.

Question:
${question}

Answer A (GPT):
${gptAnswer}

Answer B (Gemini):
${geminiAnswer}

Compare the answers on:
- correctness
- clarity
- completeness
- usefulness for a beginner

Reply ONLY as pure JSON with this structure (no extra text):

{
  "chosen_model": "gpt" or "gemini",
  "reason": "short explanation of why this answer is better"
}
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a strict JSON-only judge." },
                { role: "user", content: prompt },
            ],
        }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let chosenModel = "gpt";
    let reason = "Judge response could not be parsed, defaulting to GPT.";

    try {
        const parsed = JSON.parse(content);
        if (parsed.chosen_model === "gemini") {
            chosenModel = "gemini";
        } else {
            chosenModel = "gpt";
        }
        if (parsed.reason) {
            reason = parsed.reason;
        }
    } catch (e) {
        console.error("Error parsing judge JSON:", e, "raw content:", content);
    }

    const bestAnswer = chosenModel === "gemini" ? geminiAnswer : gptAnswer;
    const modelId =
        chosenModel === "gemini" ? "gemini-2.5-flash" : "gpt-4o-mini";

    return {
        bestAnswer,
        model: modelId,
        judgeExplanation: reason,
    };
}

// -------- MAIN CHAT (PROTECTED) ----------
app.post("/api/chat", authMiddleware, async (req, res) => {
    const { question } = req.body;

    console.log(
        ">>> /api/chat REAL hit at",
        new Date().toISOString(),
        "user:",
        req.userId,
        "question:",
        question
    );

    if (!question || question.trim() === "") {
        return res.status(400).json({ error: "Question is required" });
    }

    try {
        // 1) Ask both models
        const [gpt, gemini] = await Promise.all([
            getGptAnswer(question),
            getGeminiAnswer(question),
        ]);

        // 2) Judge between them
        const { bestAnswer, model, judgeExplanation } = await judgeBestAnswer(
            question,
            gpt,
            gemini
        );

        // 3) Save best answer in DB
        await pool.execute(
            "INSERT INTO conversations (user_id, question, best_answer, model_used) VALUES (?, ?, ?, ?)",
            [req.userId, question, bestAnswer, model]
        );


        // 4) Respond
        res.json({
            originalQuestion: question,
            bestAnswer,
            chosenModel: model,
            judgeExplanation,
            modelsConsidered: [
                { model: "gpt-4o-mini", answer: gpt },
                { model: "gemini-2.5-flash", answer: gemini },
            ],
        });
    } catch (err) {
        console.error("Error in /api/chat:", err);
        res.status(500).json({ error: "Server error" });
    }
});
// -------- HISTORY (LATEST CONVERSATIONS FOR LOGGED-IN USER) ----------
app.get("/api/history", authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT question, best_answer, model_used, created_at
       FROM conversations
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
            [req.userId]
        );

        res.json({ items: rows });
    } catch (err) {
        console.error("Error in /api/history:", err);
        res.status(500).json({ error: "Server error while loading history." });
    }
});


// -------- START SERVER ----------
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
