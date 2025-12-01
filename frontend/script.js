// frontend/script.js

const askBtn = document.getElementById("askBtn");
const questionInput = document.getElementById("question");
const answerBox = document.getElementById("answer");
const debugBox = document.getElementById("debug");

askBtn.addEventListener("click", async () => {
    const question = questionInput.value.trim();

    if (!question) {
        answerBox.textContent = "Please type a question first.";
        return;
    }

    answerBox.textContent = "Thinking...";
    debugBox.textContent = "";

    try {
        const res = await fetch("http://localhost:3000/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ question }),
        });

        const data = await res.json();

        answerBox.textContent = data.bestAnswer || "No answer returned.";
        debugBox.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
        answerBox.textContent = "Error talking to backend. Is it running?";
        console.error(err);
    }
});
