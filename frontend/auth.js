const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const goToSignup = document.getElementById("goToSignup");
const goToLogin = document.getElementById("goToLogin");
const authMessage = document.getElementById("authMessage");

const API_BASE = "http://localhost:3000";

// Switch tabs
function showLogin() {
    loginTab.classList.add("active");
    signupTab.classList.remove("active");
    loginForm.classList.remove("hidden");
    signupForm.classList.add("hidden");
    authMessage.textContent = "";
    authMessage.className = "auth-message";
}

function showSignup() {
    signupTab.classList.add("active");
    loginTab.classList.remove("active");
    signupForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
    authMessage.textContent = "";
    authMessage.className = "auth-message";
}

loginTab.addEventListener("click", showLogin);
signupTab.addEventListener("click", showSignup);
if (goToSignup) goToSignup.addEventListener("click", showSignup);
if (goToLogin) goToLogin.addEventListener("click", showLogin);

// Real signup
signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value.trim();

    if (!name || !email || !password) {
        authMessage.textContent = "Please fill in all fields.";
        authMessage.className = "auth-message error";
        return;
    }

    authMessage.textContent = "Creating your account…";
    authMessage.className = "auth-message";

    try {
        const res = await fetch(`${API_BASE}/api/signup`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ name, email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            authMessage.textContent = data.error || "Signup failed.";
            authMessage.className = "auth-message error";
            return;
        }

        authMessage.textContent = data.message || "Account created. You can log in.";
        authMessage.className = "auth-message success";

        setTimeout(showLogin, 800);
    } catch (err) {
        console.error(err);
        authMessage.textContent = "Error: Could not reach the server.";
        authMessage.className = "auth-message error";
    }
});

// Real login
// Real login
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();

    if (!email || !password) {
        authMessage.textContent = "Please enter email and password.";
        authMessage.className = "auth-message error";
        return;
    }

    authMessage.textContent = "Logging you in…";
    authMessage.className = "auth-message";

    try {
        const res = await fetch(`${API_BASE}/api/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            authMessage.textContent = data.error || "Login failed.";
            authMessage.className = "auth-message error";
            return;
        }

        // Save token and user info for later
        if (data.token) {
            localStorage.setItem("authToken", data.token);
        }
        if (data.user) {
            localStorage.setItem("userName", data.user.name || "");
            localStorage.setItem("userEmail", data.user.email || "");
        }

        authMessage.textContent = "Login successful. Redirecting…";
        authMessage.className = "auth-message success";

        setTimeout(() => {
            window.location.href = "app.html";
        }, 700);
    } catch (err) {
        console.error(err);
        authMessage.textContent = "Error: Could not reach the server.";
        authMessage.className = "auth-message error";
    }
});

