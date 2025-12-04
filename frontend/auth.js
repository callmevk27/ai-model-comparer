// auth.js

const API_BASE = "http://localhost:3000";

// ---------- DOM ELEMENTS ----------
const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");

const loginPanel = document.getElementById("loginPanel");
const signupPanel = document.getElementById("signupPanel");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");

const signupName = document.getElementById("signupName");
const signupEmail = document.getElementById("signupEmail");
const signupPassword = document.getElementById("signupPassword");
const signupBtn = document.getElementById("signupBtn");
const signupError = document.getElementById("signupError");

// ---------- HELPERS ----------

function showLoginTab() {
    tabLogin.classList.add("auth-tab-active");
    tabSignup.classList.remove("auth-tab-active");

    loginPanel.classList.remove("auth-panel-hidden");
    signupPanel.classList.add("auth-panel-hidden");

    loginError.textContent = "";
}

function showSignupTab() {
    tabSignup.classList.add("auth-tab-active");
    tabLogin.classList.remove("auth-tab-active");

    signupPanel.classList.remove("auth-panel-hidden");
    loginPanel.classList.add("auth-panel-hidden");

    signupError.textContent = "";
}

// Simple email check
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}

// Read query params (to catch ?verified=1)
function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

// ---------- TAB SWITCH EVENTS ----------

if (tabLogin) {
    tabLogin.addEventListener("click", (e) => {
        e.preventDefault();
        showLoginTab();
    });
}

if (tabSignup) {
    tabSignup.addEventListener("click", (e) => {
        e.preventDefault();
        showSignupTab();
    });
}

// ---------- LOGIN ----------

async function handleLogin() {
    loginError.textContent = "";

    const email = (loginEmail.value || "").trim();
    const password = loginPassword.value || "";

    if (!email || !password) {
        loginError.textContent = "Please enter both email and password.";
        return;
    }

    if (!isValidEmail(email)) {
        loginError.textContent = "Please enter a valid email address.";
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "Logging in...";

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success || !data.token) {
            loginError.textContent =
                data.error || "Login failed. Please check your details.";
            return;
        }

        // ✅ Only store a real token
        localStorage.setItem("authToken", data.token);
        localStorage.setItem("userName", data.name || "");
        localStorage.setItem("userEmail", data.email || email);

        // Go to main app
        window.location.href = "app.html";
    } catch (err) {
        console.error("Login error:", err);
        loginError.textContent = "Error: Could not reach the server.";
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "Log in";
    }
}

if (loginBtn) {
    loginBtn.addEventListener("click", (e) => {
        e.preventDefault();
        handleLogin();
    });
}

// Allow Enter key on login fields
[loginEmail, loginPassword].forEach((el) => {
    if (!el) return;
    el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleLogin();
        }
    });
});

// ---------- SIGNUP ----------

async function handleSignup() {
    signupError.style.color = "#f87171"; // default red
    signupError.textContent = "";

    const name = (signupName.value || "").trim();
    const email = (signupEmail.value || "").trim().toLowerCase();
    const password = signupPassword.value || "";

    if (!name || !email || !password) {
        signupError.textContent = "Name, email and password are required.";
        return;
    }

    if (!isValidEmail(email)) {
        signupError.textContent = "Please enter a valid email address.";
        return;
    }

    signupBtn.disabled = true;
    signupBtn.textContent = "Signing up...";

    try {
        const res = await fetch(`${API_BASE}/auth/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
            signupError.textContent =
                data.error || "Could not create account. Please try again.";
            return;
        }

        // Success – ask user to check Gmail for verification link
        signupError.style.color = "#4ade80"; // green
        signupError.textContent =
            "Signup successful! Please check your Gmail inbox and click the verification link.";

        // Optionally auto-switch to login tab after a short delay
        setTimeout(() => {
            showLoginTab();
        }, 1500);
    } catch (err) {
        console.error("Signup error:", err);
        signupError.textContent = "Error: Could not reach the server.";
    } finally {
        signupBtn.disabled = false;
        signupBtn.textContent = "Sign up";
    }
}

if (signupBtn) {
    signupBtn.addEventListener("click", (e) => {
        e.preventDefault();
        handleSignup();
    });
}

// Allow Enter key on signup fields
[signupName, signupEmail, signupPassword].forEach((el) => {
    if (!el) return;
    el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSignup();
        }
    });
});

// ---------- ON LOAD: HANDLE ?verified=1 & CLEAR OLD TOKENS ----------

window.addEventListener("DOMContentLoaded", () => {
    // If user just verified email and got redirected with ?verified=1
    const verifiedFlag = getQueryParam("verified");
    if (verifiedFlag === "1" && loginError) {
        showLoginTab();
        loginError.style.color = "#4ade80"; // green
        loginError.textContent =
            "Your email has been verified. You can log in now.";
    }

    // If there's a broken "undefined" token from older code, clear it
    const existingToken = localStorage.getItem("authToken");
    if (existingToken === "undefined" || existingToken === "" || existingToken === null) {
        localStorage.removeItem("authToken");
    }
});
