const questionInput = document.getElementById("question");
const sendBtn = document.getElementById("sendBtn");
const statusText = document.getElementById("statusText");
const resultCard = document.getElementById("resultCard");
const bestAnswerEl = document.getElementById("bestAnswer");
const chosenModelEl = document.getElementById("chosenModel");

const userNameEl = document.getElementById("userName");
const logoutBtn = document.getElementById("logoutBtn");
const historyList = document.getElementById("historyList");
const refreshHistoryBtn = document.getElementById("refreshHistoryBtn");

const API_BASE = "http://localhost:3000";

// On load: check auth, set name, load history
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

// Logout
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("authToken");
        localStorage.removeItem("userName");
        localStorage.removeItem("userEmail");
        window.location.href = "index.html";
    });
}

// Ask the judge
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
    bestAnswerEl.textContent = "";
    chosenModelEl.textContent = "";
    resultCard.classList.add("hidden");

    try {
        const res = await fetch(`${API_BASE}/api/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ question }),
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
            resultCard.classList.add("hidden");
            return;
        }

        bestAnswerEl.textContent = data.bestAnswer || "No answer returned.";
        chosenModelEl.textContent = (data.chosenModel || "Unknown")
            .replace("gpt-4o-mini", "GPT")
            .replace("gemini-2.5-flash", "Gemini");

        resultCard.classList.remove("hidden");
        statusText.textContent = "";

        // reload history after a successful question
        loadHistory();
    } catch (err) {
        console.error(err);
        statusText.textContent = "Error: Could not contact the server.";
        resultCard.classList.add("hidden");
    } finally {
        sendBtn.disabled = false;
    }
}

if (sendBtn) {
    sendBtn.addEventListener("click", askJudge);
}

if (questionInput) {
    questionInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            askJudge();
        }
    });
}

// Load history from backend
async function loadHistory() {
    const token = localStorage.getItem("authToken");
    if (!token || !historyList) return;

    historyList.innerHTML = "<p class='history-sub'>Loading history…</p>";

    try {
        const res = await fetch(`${API_BASE}/api/history`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        const data = await res.json();

        if (res.status === 401) {
            historyList.innerHTML =
                "<p class='history-sub'>Session expired. Please log in again.</p>";
            return;
        }

        if (!res.ok) {
            historyList.innerHTML =
                "<p class='history-sub'>Could not load history.</p>";
            return;
        }

        const items = data.items || [];
        if (items.length === 0) {
            historyList.innerHTML =
                "<p class='history-sub'>No conversations yet.</p>";
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
            const model = (row.model_used || "Unknown")
                .replace("gpt-4o-mini", "GPT")
                .replace("gemini-2.5-flash", "Gemini");
            meta.textContent = `${model} • ${new Date(
                row.created_at
            ).toLocaleString()}`;

            div.appendChild(q);
            div.appendChild(meta);
            historyList.appendChild(div);
        });
    } catch (err) {
        console.error(err);
        historyList.innerHTML =
            "<p class='history-sub'>Error loading history.</p>";
    }
}

if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener("click", loadHistory);
}
