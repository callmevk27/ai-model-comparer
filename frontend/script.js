const questionInput = document.getElementById("question");
const sendBtn = document.getElementById("sendBtn");
const statusText = document.getElementById("statusText");
const chatScroll = document.getElementById("chatScroll");
const emptyState = document.getElementById("emptyState");
const newThreadBtn = document.getElementById("newThreadBtn");
const scrollBtn = document.getElementById("scrollToBottomBtn");

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
    if (!raw) return "AI";
    const lower = String(raw).toLowerCase();
    if (lower.includes("gpt")) return "GPT";
    if (lower.includes("gemini")) return "Gemini";
    if (lower.includes("grok")) return "Grok";
    return raw;
}

// Escape HTML
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
 * ChatGPT-style markdown renderer:
 * - Escapes HTML
 * - Supports ``` fenced code blocks
 * - For each code block, renders:
 *   [Code label + Copy button] + <pre><code>...</code></pre>
 * - Handles **bold** and * bullet lists
 */
function renderMarkdownToHtml(raw) {
    if (!raw) return "";

    // 1) Escape everything first
    let text = raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // 2) Extract ```code``` blocks and replace with placeholders
    const codeBlocks = [];
    text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const cleaned = stripComments(code || "");
        const index = codeBlocks.length;
        codeBlocks.push({
            lang: lang || "",
            raw: cleaned,
        });
        return `__CODE_BLOCK_${index}__`;
    });

    // 3) Simple **bold**
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // 4) Line-based processing: headings, callouts, bullets, paragraphs
    const lines = text.split("\n");
    let html = "";
    let inList = false;

    for (let line of lines) {
        const trimmed = line.trim();

        // --- CODE PLACEHOLDER AS ITS OWN BLOCK ---
        const codePlaceholderMatch = trimmed.match(/^__CODE_BLOCK_(\d+)__$/);
        if (codePlaceholderMatch) {
            if (inList) {
                html += "</ul>";
                inList = false;
            }

            const idx = parseInt(codePlaceholderMatch[1], 10);
            const block = codeBlocks[idx];

            const label = block.lang
                ? block.lang.toUpperCase()
                : "CODE";

            const escapedCode = escapeHtml(block.raw);

            html += `
<div class="answer-code-wrapper" data-code-index="${idx}">
  <div class="code-header-row">
    <span class="code-lang-label">${label}</span>
    <button type="button" class="code-copy-btn">Copy</button>
  </div>
  <pre class="answer-code-block"><code>${escapedCode}</code></pre>
</div>`.trim();

            continue;
        }

        // --- BLANK LINE => CLOSE LIST, SKIP ---
        if (trimmed === "") {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            continue;
        }

        // --- CALLOUTS: Important / Note / Warning ---
        const importantMatch = trimmed.match(/^(&gt;\s*)?Important:(.*)/i);
        if (importantMatch) {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            html += `<div class="callout important"><strong>Important:</strong>${importantMatch[2]}</div>`;
            continue;
        }

        const noteMatch = trimmed.match(/^(&gt;\s*)?Note:(.*)/i);
        if (noteMatch) {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            html += `<div class="callout note"><strong>Note:</strong>${noteMatch[2]}</div>`;
            continue;
        }

        const warningMatch = trimmed.match(/^(&gt;\s*)?Warning:(.*)/i);
        if (warningMatch) {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            html += `<div class="callout warning"><strong>Warning:</strong>${warningMatch[2]}</div>`;
            continue;
        }

        // --- HEADINGS (#, ##, ###) ---
        const h3 = trimmed.match(/^###\s+(.*)/);
        if (h3) {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            html += `<h4>${h3[1]}</h4>`;
            continue;
        }

        const h2 = trimmed.match(/^##\s+(.*)/);
        if (h2) {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            html += `<h3>${h2[1]}</h3>`;
            continue;
        }

        const h1 = trimmed.match(/^#\s+(.*)/);
        if (h1) {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            html += `<h2>${h1[1]}</h2>`;
            continue;
        }

        // --- BULLET LISTS (* item) ---
        const bulletMatch = trimmed.match(/^\*\s+(.*)/);
        if (bulletMatch) {
            if (!inList) {
                html += "<ul>";
                inList = true;
            }
            html += `<li>${bulletMatch[1]}</li>`;
            continue;
        }

        // --- NORMAL PARAGRAPH ---
        if (inList) {
            html += "</ul>";
            inList = false;
        }
        html += `<p>${trimmed}</p>`;
    }

    if (inList) html += "</ul>";

    return html;
}

/**
 * Append one Q&A block into the main chat area.
 * ChatGPT-like:
 * - User bubble (right)
 * - AI bubble (left) with markdown + code blocks + per-code copy buttons
 */
function appendMessageBlock(question, answer, model) {
    if (!chatScroll) return;
    if (emptyState) emptyState.classList.add("hidden");

    const container = document.createElement("div");
    container.className = "qa-block";

    // -------- USER QUESTION BUBBLE (right aligned) --------
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

    // -------- AI ANSWER BUBBLE (left aligned) --------
    const msg = document.createElement("section");
    msg.className = "chat-message ai-message";

    const avatar = document.createElement("div");
    avatar.className = "chat-avatar";
    avatar.textContent = "AI";

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";

    // simple model label row at top
    const metaRow = document.createElement("div");
    metaRow.className = "chat-meta-row";
    metaRow.textContent = formatModelName(model) || "AI";

    const body = document.createElement("div");
    body.className = "chat-text";
    body.innerHTML = renderMarkdownToHtml(answer);

    bubble.appendChild(metaRow);
    bubble.appendChild(body);

    msg.appendChild(avatar);
    msg.appendChild(bubble);

    container.appendChild(qBubble);
    container.appendChild(msg);

    chatScroll.appendChild(container);

    // Wire up per-code-block copy buttons inside this answer
    const codeWrappers = body.querySelectorAll(".answer-code-wrapper");
    codeWrappers.forEach((wrapper) => {
        const btn = wrapper.querySelector(".code-copy-btn");
        const codeEl = wrapper.querySelector("code");
        if (!btn || !codeEl) return;

        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const codeText = codeEl.textContent || "";

            try {
                await navigator.clipboard.writeText(codeText);
                const old = btn.textContent;
                btn.textContent = "Copied";
                btn.classList.add("copy-btn-success");
                setTimeout(() => {
                    btn.textContent = old;
                    btn.classList.remove("copy-btn-success");
                }, 1200);
            } catch (err) {
                console.error("Copy failed:", err);
                btn.textContent = "Error";
                setTimeout(() => (btn.textContent = "Copy"), 1200);
            }
        });
    });

    // Scroll to bottom when new message arrives
    chatScroll.scrollTop = chatScroll.scrollHeight;

    if (scrollBtn) {
        scrollBtn.classList.add("hidden");
    }
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
        // Reload history so previous thread is visible
        loadHistory();

        // Reset active thread so next question becomes a new thread
        activeThreadId = null;

        // Clear the chat area visually
        if (chatScroll) {
            chatScroll.innerHTML = "";
        }

        // Show welcome / empty state again
        if (emptyState) {
            emptyState.classList.remove("hidden");
            chatScroll.appendChild(emptyState);
        }

        // Reset input + status and focus the box
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

        // refresh history, so new/updated thread shows up
        loadHistory();
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
                            chatScroll.appendChild(emptyState);
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

// ===================== DRAG TO RESIZE PANELS =====================
(function () {
    const root = document.documentElement;
    const appMain = document.querySelector(".app-main");
    const dragBar = document.getElementById("drag-divider");
    if (!appMain || !dragBar) {
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

        let chatWidth = e.clientX - rect.left;
        let historyWidth = totalWidth - chatWidth - dividerWidth;

        const minChat = 300;
        const minHistory = 250;

        if (chatWidth < minChat) chatWidth = minChat;
        if (historyWidth < minHistory) {
            historyWidth = minHistory;
            chatWidth = totalWidth - historyWidth - dividerWidth;
        }

        root.style.setProperty("--chat-width", chatWidth + "px");
        root.style.setProperty("--history-width", historyWidth + "px");

        localStorage.setItem("chatWidth", chatWidth);
        localStorage.setItem("historyWidth", historyWidth);
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
        document.body.style.userSelect = "auto";
    });

    window.addEventListener("load", () => {
        const cw = localStorage.getItem("chatWidth");
        const hw = localStorage.getItem("historyWidth");
        if (cw && hw) {
            root.style.setProperty("--chat-width", cw + "px");
            root.style.setProperty("--history-width", hw + "px");
        }
    });
})();

// ===================== SCROLL-TO-BOTTOM BUTTON LOGIC =====================
if (chatScroll && scrollBtn) {
    chatScroll.addEventListener("scroll", () => {
        const atBottom =
            chatScroll.scrollTop + chatScroll.clientHeight >=
            chatScroll.scrollHeight - 10;

        if (atBottom) {
            scrollBtn.classList.add("hidden");
        } else {
            scrollBtn.classList.remove("hidden");
        }
    });

    scrollBtn.addEventListener("click", () => {
        chatScroll.scrollTo({
            top: chatScroll.scrollHeight,
            behavior: "smooth",
        });
    });
}