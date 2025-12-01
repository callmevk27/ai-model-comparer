const questionInput = document.getElementById("question");
const sendBtn = document.getElementById("sendBtn");
const statusText = document.getElementById("statusText");
const resultCard = document.getElementById("resultCard");
const bestAnswerEl = document.getElementById("bestAnswer");
const chosenModelEl = document.getElementById("chosenModel");

async function askJudge() {
    const question = questionInput.value.trim();

    if (!question) {
        alert("Please type a question first.");
        return;
    }

    // UI: loading state
    sendBtn.disabled = true;
    statusText.textContent = "Thinking…";
    bestAnswerEl.textContent = "";
    chosenModelEl.textContent = "";
    resultCard.classList.add("hidden");

    try {
        const res = await fetch("http://localhost:3000/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ question }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Something went wrong.");
        }

        bestAnswerEl.textContent = data.bestAnswer || "No answer returned.";
        chosenModelEl.textContent =
            (data.chosenModel || "Unknown")
                .replace("gpt-4o-mini", "GPT")
                .replace("gemini-2.5-flash", "Gemini");

        resultCard.classList.remove("hidden");
        statusText.textContent = "";
    } catch (err) {
        console.error(err);
        statusText.textContent = "Error: Could not get an answer from the server.";
        resultCard.classList.add("hidden");
    } finally {
        sendBtn.disabled = false;
    }
}

// Arrow button click
sendBtn.addEventListener("click", askJudge);

// Optional: Ctrl+Enter submits
questionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        askJudge();
    }
});
