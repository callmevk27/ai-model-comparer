const API_BASE = "http://localhost:3000";

// DOM
const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");
const loginPanel = document.getElementById("loginPanel");
const signupPanel = document.getElementById("signupPanel");

const loginEmailInput = document.getElementById("loginEmail");
const loginPasswordInput = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");

const signupNameInput = document.getElementById("signupName");
const signupEmailInput = document.getElementById("signupEmail");
const signupPasswordInput = document.getElementById("signupPassword");
const signupBtn = document.getElementById("signupBtn");
const signupError = document.getElementById("signupError");

// Tabs
function showLogin() {
    tabLogin.classList.add("auth-tab-active");
    tabSignup.classList.remove("auth-tab-active");
    loginPanel.classList.remove("auth-panel-hidden");
    signupPanel.classList.add("auth-panel-hidden");
}

function showSignup() {
    tabSignup.classList.add("auth-tab-active");
    tabLogin.classList.remove("auth-tab-active");
    signupPanel.classList.remove("auth-panel-hidden");
    loginPanel.classList.add("auth-panel-hidden");
}

tabLogin.addEventListener("click", showLogin);
tabSignup.addEventListener("click", showSignup);

// save & redirect
function saveAuthAndGoApp(token, user) {
    localStorage.setItem("authToken", token);
    localStorage.setItem("userName", user.name);
    localStorage.setItem("userEmail", user.email);
    window.location.href = "app.html";
}

// LOGIN
async function handleLogin() {
    loginError.textContent = "";

    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value.trim();
    if (!email || !password) {
        loginError.textContent = "Please enter email and password.";
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            loginError.textContent = data.error || "Could not log in.";
            return;
        }

        saveAuthAndGoApp(data.token, data.user);
    } catch (err) {
        console.error(err);
        loginError.textContent = "Error: Could not reach the server.";
    }
}

// SIGNUP
async function handleSignup() {
    signupError.textContent = "";

    const name = signupNameInput.value.trim();
    const email = signupEmailInput.value.trim();
    const password = signupPasswordInput.value.trim();

    if (!name || !email || !password) {
        signupError.textContent = "Please fill all fields.";
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            signupError.textContent = data.error || "Could not sign up.";
            return;
        }

        saveAuthAndGoApp(data.token, data.user);
    } catch (err) {
        console.error(err);
        signupError.textContent = "Error: Could not reach the server.";
    }
}

loginBtn.addEventListener("click", handleLogin);
signupBtn.addEventListener("click", handleSignup);

// allow Enter key
loginPasswordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
});
signupPasswordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSignup();
});
