// backend/index.js
console.log(">>> BACKEND START (threads + GPT + Gemini) <<<");

require("dotenv").config({ path: "../.env" });

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const pool = require("./db");
const { sendVerificationEmail } = require("./mailer");

const app = express();
const PORT = 3000;

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

app.use(cors());
app.use(express.json());

/* ====================== AUTH MIDDLEWARE ====================== */
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

/* =========================== HEALTH ========================== */
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Backend is running!" });
});

/* ============================================================= */
/*                AUTH: SIGNUP + EMAIL VERIFY                    */
/* ============================================================= */

// SIGNUP – create user (unverified) and send Gmail verification link
app.post("/auth/signup", async (req, res) => {
    const { name, email, password } = req.body;

    try {
        if (!name || !email || !password) {
            return res
                .status(400)
                .json({ error: "Name, email and password are required." });
        }

        const trimmedName = name.trim();
        const emailTrimmed = email.trim().toLowerCase();

        // basic email validation + only Gmail allowed
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailTrimmed) || !emailTrimmed.endsWith("@gmail.com")) {
            return res.status(400).json({
                error: "Please use a valid Gmail address (example@gmail.com).",
            });
        }

        // check if user already exists
        const [rows] = await pool.execute(
            "SELECT id, is_verified FROM users WHERE email = ?",
            [emailTrimmed]
        );

        if (rows.length > 0 && rows[0].is_verified === 1) {
            // already verified account
            return res
                .status(409)
                .json({ error: "An account with this email already exists." });
        }

        // hash password user typed in signup form
        const passwordHash = await bcrypt.hash(password, 10);

        // verification token + expiry (24h)
        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        let userId;

        if (rows.length === 0) {
            // create new user row
            const [insertResult] = await pool.execute(
                `INSERT INTO users
         (name, email, password_hash, is_verified, verification_token, verification_expires)
         VALUES (?, ?, ?, 0, ?, ?)`,
                [trimmedName, emailTrimmed, passwordHash, token, expires]
            );
            userId = insertResult.insertId;
        } else {
            // user exists but not verified – update their info
            userId = rows[0].id;
            await pool.execute(
                `UPDATE users
         SET name = ?, password_hash = ?, verification_token = ?, verification_expires = ?, is_verified = 0
         WHERE id = ?`,
                [trimmedName, passwordHash, token, expires, userId]
            );
        }

        const backendBase =
            process.env.BACKEND_BASE_URL || `http://localhost:${PORT}`;
        const verifyUrl = `${backendBase}/auth/verify-email?token=${token}`;

        // send verification email (non-fatal if this fails)
        try {
            await sendVerificationEmail(emailTrimmed, trimmedName, verifyUrl);
        } catch (mailErr) {
            console.error("Error sending verification email:", mailErr);
        }

        return res.status(200).json({
            success: true,
            message:
                "Signup received. Please check your Gmail inbox and click the verification link to activate your account.",
            userId,
        });
    } catch (err) {
        console.error("Error in /auth/signup:", err);
        res.status(500).json({ error: "Server error while signing up." });
    }
});

// VERIFY EMAIL – user clicks link in Gmail
app.get("/auth/verify-email", async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).json({ error: "Missing verification token." });
    }

    try {
        const [rows] = await pool.execute(
            `SELECT id, verification_expires
       FROM users
       WHERE verification_token = ?`,
            [token]
        );

        if (rows.length === 0) {
            return res.status(400).json({ error: "Invalid or already used token." });
        }

        const user = rows[0];
        const now = new Date();

        if (!user.verification_expires || user.verification_expires < now) {
            return res.status(400).json({ error: "Verification link has expired." });
        }

        // mark verified + clear token
        await pool.execute(
            `UPDATE users
       SET is_verified = 1,
           verification_token = NULL,
           verification_expires = NULL
       WHERE id = ?`,
            [user.id]
        );

        const frontendUrl =
            process.env.FRONTEND_BASE_URL || "http://127.0.0.1:5500/frontend/index.html";

        return res.redirect(`${frontendUrl}?verified=1`);
    } catch (err) {
        console.error("Error in /auth/verify-email:", err);
        res.status(500).json({ error: "Server error verifying email." });
    }
});

/* ============================ LOGIN =========================== */
// LOGIN – only allowed if email is verified, using password they set at signup
app.post("/auth/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required." });
        }

        const emailTrimmed = email.trim().toLowerCase();

        const [rows] = await pool.execute(
            "SELECT id, name, email, password_hash, is_verified FROM users WHERE email = ?",
            [emailTrimmed]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        const user = rows[0];

        // must be verified first
        if (!user.is_verified) {
            return res.status(403).json({
                error: "Your email is not verified. Please check your inbox.",
            });
        }

        // password_hash may be null if user existed before
        if (!user.password_hash) {
            return res.status(500).json({
                error: "Account error: missing password hash. Please reset your password.",
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        // generate JWT
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET || "dev-secret",
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            token,
            name: user.name,
            email: user.email,
        });

    } catch (err) {
        console.error("Error in /auth/login:", err);
        res.status(500).json({ error: "Server error while logging in." });
    }
});


/* ============================================================= */
/*                 GPT & GEMINI HELPERS                          */
/* ============================================================= */

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

    // very simple judge: prefer longer answer
    if (gem.length > gpt.length) {
        return { bestAnswer: gem, model: "gemini-2.5-flash" };
    }
    return { bestAnswer: gpt, model: "gpt-4o-mini" };
}

/* ============================================================= */
/*                    CHAT + THREADS                             */
/* ============================================================= */

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

// GET /api/history – list top-level threads
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

// GET /api/thread/:id – full conversation for a thread
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

// DELETE /api/thread/:id – delete whole conversation thread
app.delete("/api/thread/:id", authMiddleware, async (req, res) => {
    const threadId = req.params.id;

    try {
        const [rows] = await pool.execute(
            `SELECT id
       FROM conversations
       WHERE id = ?
         AND user_id = ?
         AND id = root_conversation_id`,
            [threadId, req.userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Thread not found." });
        }

        await pool.execute(
            `DELETE FROM conversations
       WHERE root_conversation_id = ?
         AND user_id = ?`,
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

/* =========================== START ============================ */
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
