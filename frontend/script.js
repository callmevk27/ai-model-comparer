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

const dragDivider = document.getElementById("drag-divider");
const scrollBottomBtn = document.getElementById("scrollToBottomBtn");

const fileInput = document.getElementById("fileInput");
const fileButton = document.getElementById("fileBtn");
const fileBadge = document.getElementById("fileBadge");
const fileBadgeName = document.getElementById("fileBadgeName");
const fileBadgeClear = document.getElementById("fileBadgeClear");

const API_BASE = "http://localhost:3000";

// current thread id (root_conversation_id)
let activeThreadId = null;

// currently attached file
let attachedFile = null;

// ===========================
// HELPER FUNCTIONS
// ===========================

function formatModelName(raw) {
    return (raw || "Unknown")
        .replace("gpt-4o-mini", "GPT")
        .replace("gemini-2.5-flash", "Gemini");
}

function escapeHtml(str) {
    return (str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function stripComments(code) {
    if (!code) return "";
    code = code.replace(/\/\*[\s\S]*?\*\//g, "");
    code = code.replace(/\/\/.*$/gm, "");
    code = code.replace(/^\s*#.*$/gm, "");
    return code.split("\n").filter((line) => line.trim() !== "").join("\n").trim();
}

function renderMarkdownToHtml(raw) {
    if (!raw) return "";
    let text = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const lines = text.split("\n");
    let html = "";
    let inList = false;

    for (let line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            if (inList) { html += "</ul>"; inList = false; }
            html += "<p></p>"; continue;
        }
        if (/^###\s+/.test(trimmed)) {
            if (inList) { html += "</ul>"; inList = false; }
            html += `<h3>${trimmed.replace(/^###\s+/, "")}</h3>`; continue;
        }
        if (/^##\s+/.test(trimmed)) {
            if (inList) { html += "</ul>"; inList = false; }
            html += `<h2>${trimmed.replace(/^##\s+/, "")}</h2>`; continue;
        }
        const bulletMatch = trimmed.match(/^\*\s+(.*)/);
        if (bulletMatch) {
            if (!inList) { html += "<ul>"; inList = true; }
            html += `<li>${bulletMatch[1]}</li>`; continue;
        }
        if (inList) { html += "</ul>"; inList = false; }
        html += `<p>${trimmed}</p>`;
    }
    if (inList) html += "</ul>";
    return html;
}

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

function scrollChatToBottom(smooth = true) {
    if (!chatScroll) return;
    const behavior = smooth ? "smooth" : "auto";
    chatScroll.scrollTo({ top: chatScroll.scrollHeight, behavior });
}

// ---------------------
// FILE BADGE HELPERS
// ---------------------
function updateFileBadge() {
    if (attachedFile) {
        const kb = Math.round(attachedFile.size / 1024);
        fileBadgeName.textContent = `${attachedFile.name} (${kb} KB)`;
        fileBadge.classList.remove("hidden");
    } else {
        fileBadge.classList.add("hidden");
        fileBadgeName.textContent = "";
    }
}

function clearAttachedFile() {
    attachedFile = null;
    if (fileInput) fileInput.value = "";
    updateFileBadge();
}

// ===========================
// APPEND MESSAGE BLOCK
// ===========================
function appendMessageBlock(question, answer, model, fileMeta) {
    if (!chatScroll) return;
    if (emptyState) emptyState.classList.add("hidden");

    const container = document.createElement("div");
    container.className = "qa-block";

    const qBubble = document.createElement("div");
    qBubble.className = "question-bubble";
    const qText = document.createElement("p");
    qText.className = "question-text";
    qText.textContent = question;

    if (fileMeta && fileMeta.name) {
        const chip = document.createElement("div");
        chip.className = "question-file-chip";
        chip.textContent = `📎 ${fileMeta.name}`;
        qBubble.appendChild(chip);
    }

    qBubble.appendChild(qText);

    const msg = document.createElement("section");
    msg.className = "chat-message ai-message";
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";

    const metaHeader = document.createElement("div");
    metaHeader.className = "chat-meta-header";
    const metaRow = document.createElement("div");
    metaRow.className = "chat-meta-row";
    metaRow.textContent = `Winner: ${formatModelName(model)}`;
    metaHeader.appendChild(metaRow);

    const body = document.createElement("div");
    body.className = "chat-text";

    const split = splitCodeAndExplanation(answer);
    if (split && split.code.trim()) {
        const codeBlock = document.createElement("pre");
        codeBlock.className = "answer-code-block";
        const codeInner = document.createElement("code");
        codeInner.innerHTML = escapeHtml(stripComments(split.code));
        codeBlock.appendChild(codeInner);
        body.appendChild(codeBlock);

        const expl = document.createElement("div");
        expl.innerHTML = renderMarkdownToHtml(split.explanation || "");
        body.appendChild(expl);
    } else {
        body.innerHTML = renderMarkdownToHtml(answer || "");
    }

    bubble.appendChild(metaHeader);
    bubble.appendChild(body);
    msg.appendChild(bubble);
    container.appendChild(qBubble);
    container.appendChild(msg);

    chatScroll.appendChild(container);
    scrollChatToBottom(true);
}

// ===========================
// ASYNC ACTIONS
// ===========================
async function askJudge() {
    const question = questionInput.value.trim();
    if (!question && !attachedFile) return;

    const token = localStorage.getItem("authToken");
    sendBtn.disabled = true;
    statusText.textContent = attachedFile ? "Uploading & Processing..." : "Consulting the models...";

    try {
        let res;
        let data;
        let fileMeta = null;

        if (attachedFile) {
            const formData = new FormData();
            formData.append("question", question);
            formData.append("file", attachedFile);
            if (activeThreadId) formData.append("rootConversationId", activeThreadId);

            res = await fetch(`${API_BASE}/api/chat-with-file`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
                body: formData
            });
            fileMeta = { name: attachedFile.name };
        } else {
            res = await fetch(`${API_BASE}/api/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ question, rootConversationId: activeThreadId })
            });
        }

        data = await res.json();
        if (!res.ok) throw new Error(data.error || "Server error");

        if (!activeThreadId) activeThreadId = data.rootConversationId;

        appendMessageBlock(question || "(File upload)", data.bestAnswer, data.chosenModel, fileMeta);

        questionInput.value = "";
        clearAttachedFile();
        statusText.textContent = "";
        loadHistory(); // Refresh sidebar
    } catch (err) {
        statusText.textContent = err.message;
    } finally {
        sendBtn.disabled = false;
    }
}

// ===========================
// DRAG TO RESIZE PANELS
// ===========================
if (dragDivider) {
    let isDragging = false;
    const root = document.documentElement;

    dragDivider.addEventListener("mousedown", () => {
        isDragging = true;
        document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const main = document.querySelector(".app-main");
        if (!main) return;

        const rect = main.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const minChat = 300;
        const minHistory = 260;

        let chatWidth = offsetX;
        let historyWidth = rect.width - chatWidth - dragDivider.offsetWidth;

        if (chatWidth < minChat) chatWidth = minChat;
        if (historyWidth < minHistory) historyWidth = minHistory;

        root.style.setProperty("--chat-width", chatWidth + "px");
        root.style.setProperty("--history-width", historyWidth + "px");
        localStorage.setItem("chatWidth", chatWidth);
        localStorage.setItem("historyWidth", historyWidth);
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
        document.body.style.userSelect = "auto";
    });
}

// ===========================
// EVENT LISTENERS
// ===========================
if (sendBtn) sendBtn.addEventListener("click", askJudge);

if (questionInput) {
    questionInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            askJudge();
        }
    });
}

if (fileButton && fileInput) {
    fileButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
        attachedFile = fileInput.files[0];
        updateFileBadge();
    });
}

if (fileBadgeClear) {
    fileBadgeClear.addEventListener("click", clearAttachedFile);
}

if (newThreadBtn) {
    newThreadBtn.addEventListener("click", () => {
        activeThreadId = null;
        chatScroll.innerHTML = "";
        emptyState.classList.remove("hidden");
        clearAttachedFile();
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        localStorage.clear();
        window.location.href = "index.html";
    });
}

// ===========================
// SCROLL-TO-BOTTOM BUTTON
// ===========================
if (chatScroll && scrollBottomBtn) {
    chatScroll.addEventListener("scroll", () => {
        const dist = chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight;
        dist > 160 ? scrollBottomBtn.classList.remove("hidden") : scrollBottomBtn.classList.add("hidden");
    });
    scrollBottomBtn.addEventListener("click", () => scrollChatToBottom(true));
}

// ===========================
// INIT APP
// ===========================
(function initApp() {
    const token = localStorage.getItem("authToken");
    if (!token) {
        window.location.href = "index.html";
        return;
    }
    const storedName = localStorage.getItem("userName");
    if (storedName && userNameEl) userNameEl.textContent = storedName;

    const cw = localStorage.getItem("chatWidth");
    const hw = localStorage.getItem("historyWidth");
    if (cw && hw) {
        document.documentElement.style.setProperty("--chat-width", cw + "px");
        document.documentElement.style.setProperty("--history-width", hw + "px");
    }
    loadHistory();
})();

async function loadHistory() {
    const token = localStorage.getItem("authToken");
    try {
        const res = await fetch(`${API_BASE}/api/history`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();
        historyList.innerHTML = "";
        data.items.forEach(row => {
            const div = document.createElement("div");
            div.className = "history-item";
            div.textContent = row.question.substring(0, 30) + "...";
            div.onclick = () => loadThread(row.id);
            historyList.appendChild(div);
        });
    } catch (err) { console.error(err); }
}

async function loadThread(threadId) {
    const token = localStorage.getItem("authToken");
    activeThreadId = threadId;
    try {
        const res = await fetch(`${API_BASE}/api/thread/${threadId}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();
        chatScroll.innerHTML = "";
        data.items.forEach(msg => appendMessageBlock(msg.question, msg.best_answer, msg.model_used));
        scrollChatToBottom(false);
    } catch (err) { console.error(err); }
}