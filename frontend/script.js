// ===========================
// DOM ELEMENTS
// ===========================
const questionInput = document.getElementById("question");
const sendBtn = document.getElementById("sendBtn");
const statusText = document.getElementById("statusText");
const chatScroll = document.getElementById("chatScroll");
const emptyState = document.getElementById("emptyState");
const newThreadBtn = document.getElementById("newThreadBtn");

const userNameEl = document.getElementById("userName");
const logoutBtn = document.getElementById("logoutBtn");
const historyList = document.getElementById("historyList");
const refreshHistoryBtn = document.getElementById("refreshHistoryBtn");

const API_BASE = "http://localhost:3000";

// current thread id (root_conversation_id)
let activeThreadId = null;

// ===========================
// HELPERS
// ===========================

function formatModelName(raw) {
    return (raw || "Unknown")
        .replace("gpt-4o-mini", "GPT")
        .replace("gemini-2.5-flash", "Gemini");
}

/**
 * Basic markdown -> HTML:
 * - escapes HTML
 * - **bold**
 * - "* " bullets -> <ul><li>
 */
function renderMarkdownToHtml(raw) {
    if (!raw) return "";

    let text = raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    const lines = text.split("\n");
    let html = "";
    let inList = false;

    for (let line of lines) {
        const trimmed = line.trim();

        if (trimmed === "") {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            html += "<p></p>";
            continue;
        }

        const bulletMatch = trimmed.match(/^\*\s+(.*)/);
        if (bulletMatch) {
            if (!inList) {
                html += "<ul>";
                inList = true;
            }
            html += `<li>${bulletMatch[1]}</li>`;
            continue;
        }

        if (inList) {
            html += "</ul>";
            inList = false;
        }
        html += `<p>${trimmed}</p>`;
    }

    if (inList) html += "</ul>";

    return html;
}

// Escape HTML inside <pre><code>
function escapeHtml(str) {
    return (str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// Remove comments from JS/C/Java/Python-style code
function stripComments(code) {
    if (!code) return "";

    // Remove JS/C/Java/C++ block comments: /* ... */
    code = code.replace(/\/\*[\s\S]*?\*\//g, "");

    // Remove JS/C/Java/C++ single-line comments: //
    code = code.replace(/\/\/.*$/gm, "");

    // Remove Python/Ruby/bash comments: #
    code = code.replace(/^\s*#.*$/gm, "");

    // Remove leftover empty lines
    code = code
        .split("\n")
        .filter((line) => line.trim() !== "")
        .join("\n");

    return code.trim();
}

/**
 * Try to split an answer into { lang, code, explanation } based on ``` fences.
 * Example:
 *   Here is the code:
 *   ```js
 *   console.log("hi");
 *   ```
 *   Explanation...
 */
function splitCodeAndExplanation(answer) {
    if (!answer) return null;

    const fenceRegex = /```(\w+)?\n([\s\S]*?)```/m;
    const match = answer.match(fenceRegex);
    if (!match) return null;

    const lang = match[1] || "";
    const code = match[2] || "";
    const before = answer.slice(0, match.index).trim();
    const after = answer.slice(match.index + match[0].length).trim();

    const explanation = [before, after].filter(Boolean).join("\n\n").trim();

    return { lang, code, explanation };
}

/**
 * Append one Q&A block into the main chat area.
 * Includes:
 * - user question bubble
 * - AI answer bubble
 *   - if code detected => two-column layout (Code | Explanation)
 */
function appendMessageBlock(question, answer, model) {
    if (!chatScroll) return;
    if (emptyState) emptyState.classList.add("hidden");

    const container = document.createElement("div");
    container.className = "qa-block";

    // -------- USER QUESTION BUBBLE --------
    const qBubble = document.createElement("div");
    qBubble.className = "question-bubble";

    const qMeta = document.createElement("div");
    qMeta.className = "question-meta-row";
    qMeta.textContent = "You";

    const qText = document.createElement("p");
    qText.className = "question-text";
    qText.textContent = question;

    qBubble.appendChild(qMeta);
    qBubble.appendChild(qText);

    // -------- AI ANSWER BUBBLE --------
    const msg = document.createElement("section");
    msg.className = "chat-message ai-message";

    const avatar = document.createElement("div");
    avatar.className = "chat-avatar";
    avatar.textContent = "AI";

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";

    const metaRow = document.createElement("div");
    metaRow.className = "chat-meta-row";
    metaRow.textContent = `Best answer · ${formatModelName(model)}`;

    const body = document.createElement("div");
    body.className = "chat-text";

    // Try to split into code + explanation
    const split = splitCodeAndExplanation(answer);

    if (split && split.code.trim()) {
        // ----- TWO-COLUMN LAYOUT: CODE | EXPLANATION -----
        const twoCol = document.createElement("div");
        twoCol.className = "answer-two-col";

        // LEFT: code
        const codeCol = document.createElement("div");
        codeCol.className = "answer-code";

        const codeLabel = document.createElement("div");
        codeLabel.className = "answer-code-label";
        codeLabel.textContent = split.lang
            ? `Code (${split.lang})`
            : "Code";

        const codeBlock = document.createElement("pre");
        codeBlock.className = "answer-code-block";

        const codeInner = document.createElement("code");

        // Remove comments before showing
        const cleanedCode = stripComments(split.code);
        codeInner.innerHTML = escapeHtml(cleanedCode);

        codeBlock.appendChild(codeInner);
        codeCol.appendChild(codeLabel);
        codeCol.appendChild(codeBlock);

        // RIGHT: explanation
        const explCol = document.createElement("div");
        explCol.className = "answer-explainer";

        const explLabel = document.createElement("div");
        explLabel.className = "answer-explainer-label";
        explLabel.textContent = "Explanation";

        const explBody = document.createElement("div");
        explBody.className = "answer-explainer-body";
        explBody.innerHTML = renderMarkdownToHtml(split.explanation || "");

        explCol.appendChild(explLabel);
        explCol.appendChild(explBody);

        twoCol.appendChild(codeCol);
        twoCol.appendChild(explCol);

        body.appendChild(twoCol);
    } else {
        // ----- NORMAL SINGLE-COLUMN ANSWER -----
        body.innerHTML = renderMarkdownToHtml(answer);
    }

    bubble.appendChild(metaRow);
    bubble.appendChild(body);

    msg.appendChild(avatar);
    msg.appendChild(bubble);

    container.appendChild(qBubble);
    container.appendChild(msg);

    chatScroll.appendChild(container);
    chatScroll.scrollTop = chatScroll.scrollHeight;
}

// ===========================
// INIT APP
// ===========================
(function initApp() {
    const token = localStorage.getItem("authToken");
    if (!token) {
        alert("Please log in first.");
        window.location.href = "index.html";
        return;
    }

    const storedName = localStorage.getItem("userName");
    if (storedName && userNameEl) {
        userNameEl.textContent = storedName;
    }

    loadHistory();
})();

// ===========================
// LOGOUT
// ===========================
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("authToken");
        localStorage.removeItem("userName");
        localStorage.removeItem("userEmail");
        window.location.href = "index.html";
    });
}

// ===========================
// NEW CHAT / NEW THREAD (ChatGPT-style)
// ===========================
if (newThreadBtn) {
    newThreadBtn.addEventListener("click", () => {
        // 1) Ensure current thread is visible in history
        loadHistory();

        // 2) Reset active thread so next question becomes a new thread
        activeThreadId = null;

        // 3) Clear the chat area visually
        if (chatScroll) {
            chatScroll.innerHTML = "";
        }

        // 4) Show welcome / empty state again
        if (emptyState) {
            emptyState.classList.remove("hidden");
            chatScroll.appendChild(emptyState);
        }

        // 5) Reset input + status and focus the box
        statusText.textContent = "";
        questionInput.value = "";
        questionInput.focus();
    });
}

// ===========================
// ASK THE JUDGE
// ===========================
async function askJudge() {
    const question = questionInput.value.trim();
    if (!question) {
        alert("Please type a question first.");
        return;
    }

    const token = localStorage.getItem("authToken");
    if (!token) {
        alert("Session expired. Please log in again.");
        window.location.href = "index.html";
        return;
    }

    sendBtn.disabled = true;
    statusText.textContent = "Thinking…";

    try {
        const res = await fetch(`${API_BASE}/api/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                question,
                rootConversationId: activeThreadId,
            }),
        });

        const data = await res.json();

        if (res.status === 401) {
            alert("Session expired. Please log in again.");
            localStorage.removeItem("authToken");
            window.location.href = "index.html";
            return;
        }

        if (!res.ok) {
            statusText.textContent = data.error || "Something went wrong.";
            return;
        }

        // if this is a new thread, backend sends rootConversationId
        if (!activeThreadId && data.rootConversationId) {
            activeThreadId = data.rootConversationId;
        }

        appendMessageBlock(question, data.bestAnswer, data.chosenModel);

        statusText.textContent = "";
        questionInput.value = "";
        questionInput.focus();

        // if brand new thread, refresh history
        if (!activeThreadId) {
            loadHistory();
        }
    } catch (err) {
        console.error(err);
        statusText.textContent = "Error: Could not contact the server.";
    } finally {
        sendBtn.disabled = false;
    }
}

if (sendBtn) {
    sendBtn.addEventListener("click", askJudge);
}

if (questionInput) {
    questionInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            askJudge();
        }
    });
}

// ===========================
// HISTORY LIST + DELETE + THREAD LOAD
// ===========================
async function loadHistory() {
    const token = localStorage.getItem("authToken");
    if (!token || !historyList) return;

    historyList.innerHTML = "<p class='history-sub'>Loading history...</p>";

    try {
        const res = await fetch(`${API_BASE}/api/history`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();

        if (res.status === 401) {
            historyList.innerHTML =
                "<p class='history-sub'>Session expired. Please log in again.</p>";
            return;
        }

        if (!res.ok) {
            console.error("History error:", data);
            historyList.innerHTML =
                "<p class='history-sub'>Could not load history.</p>";
            return;
        }

        const items = data.items || [];
        if (items.length === 0) {
            historyList.innerHTML =
                "<p class='history-sub'>No conversations yet.</p>";
            if (emptyState && chatScroll && chatScroll.children.length === 1) {
                emptyState.classList.remove("hidden");
            }
            return;
        }

        historyList.innerHTML = "";

        items.forEach((row) => {
            const div = document.createElement("div");
            div.className = "history-item";

            const q = document.createElement("div");
            q.className = "history-question";
            q.textContent = row.question;

            const meta = document.createElement("div");
            meta.className = "history-meta";
            const model = formatModelName(row.model_used);
            const when = new Date(row.created_at).toLocaleString();
            meta.textContent = `${model} • ${when}`;

            const delBtn = document.createElement("div");
            delBtn.className = "history-delete-btn";
            delBtn.textContent = "Delete";

            div.dataset.id = row.id;

            // open thread
            div.addEventListener("click", (e) => {
                if (e.target === delBtn) return;
                activeThreadId = row.id;
                loadThread(row.id);
            });

            // delete thread
            delBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const ok = confirm("Delete this entire conversation?");
                if (!ok) return;

                const token = localStorage.getItem("authToken");
                try {
                    const delRes = await fetch(`${API_BASE}/api/thread/${row.id}`, {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${token}` },
                    });

                    let payload = {};
                    try {
                        payload = await delRes.json();
                    } catch { }

                    if (!delRes.ok || !payload.success) {
                        console.error("Delete failed:", delRes.status, payload);
                        alert(`Could not delete (status ${delRes.status}).`);
                        return;
                    }

                    div.remove();

                    if (String(activeThreadId) === String(row.id)) {
                        activeThreadId = null;
                        if (chatScroll) chatScroll.innerHTML = "";
                        if (emptyState) {
                            emptyState.classList.remove("hidden");
                        }
                    }

                    if (!historyList.children.length) {
                        historyList.innerHTML =
                            "<p class='history-sub'>No conversations yet.</p>";
                    }
                } catch (err) {
                    console.error("Delete error:", err);
                    alert("Error while deleting conversation.");
                }
            });

            div.appendChild(q);
            div.appendChild(meta);
            div.appendChild(delBtn);

            historyList.appendChild(div);
        });
    } catch (err) {
        console.error("loadHistory error:", err);
        historyList.innerHTML =
            "<p class='history-sub'>Error loading history.</p>";
    }
}

async function loadThread(threadId) {
    const token = localStorage.getItem("authToken");
    if (!token || !threadId) return;

    statusText.textContent = "Loading conversation…";

    try {
        const res = await fetch(`${API_BASE}/api/thread/${threadId}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();

        if (!res.ok) {
            statusText.textContent = data.error || "Could not load conversation.";
            return;
        }

        if (chatScroll) {
            chatScroll.innerHTML = "";
        }

        const items = data.items || [];
        items.forEach((row) => {
            appendMessageBlock(row.question, row.best_answer, row.model_used);
        });

        statusText.textContent = "";
        questionInput.value = "";
        questionInput.focus();
    } catch (err) {
        console.error("Error in loadThread:", err);
        statusText.textContent = "Error loading conversation.";
    }
}

if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener("click", () => {
        activeThreadId = null;
        loadHistory();
    });
}

/* ===================== DRAG TO RESIZE PANELS ===================== */
(function () {
    const root = document.documentElement;
    const appMain = document.querySelector(".app-main");
    const dragBar = document.getElementById("drag-divider");
    if (!appMain || !dragBar) {
        // If either is missing, don't attach handlers – avoid breaking the app
        return;
    }

    let isDragging = false;

    dragBar.addEventListener("mousedown", () => {
        isDragging = true;
        document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;

        const rect = appMain.getBoundingClientRect();
        const totalWidth = rect.width;
        const dividerWidth = dragBar.offsetWidth || 5;

        // Mouse position relative to left of app-main
        let chatWidth = e.clientX - rect.left;
        let historyWidth = totalWidth - chatWidth - dividerWidth;

        // Minimum widths for both panels
        const minChat = 300;
        const minHistory = 250;

        if (chatWidth < minChat) chatWidth = minChat;
        if (historyWidth < minHistory) {
            historyWidth = minHistory;
            chatWidth = totalWidth - historyWidth - dividerWidth;
        }

        // Apply new sizes via CSS variables
        root.style.setProperty("--chat-width", chatWidth + "px");
        root.style.setProperty("--history-width", historyWidth + "px");

        // Save preference
        localStorage.setItem("chatWidth", chatWidth);
        localStorage.setItem("historyWidth", historyWidth);
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
        document.body.style.userSelect = "auto";
    });

    // Restore size on load
    window.addEventListener("load", () => {
        const cw = localStorage.getItem("chatWidth");
        const hw = localStorage.getItem("historyWidth");
        if (cw && hw) {
            root.style.setProperty("--chat-width", cw + "px");
            root.style.setProperty("--history-width", hw + "px");
        }
    });
})();
