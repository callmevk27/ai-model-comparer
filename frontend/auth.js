// ====== CONFIG ======
const API_BASE = "http://localhost:3000";

// ====== DOM ELEMENTS ======
const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");

const loginPanel = document.getElementById("loginPanel");
const signupPanel = document.getElementById("signupPanel");
const forgotPanel = document.getElementById("forgotPanel");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");

const signupName = document.getElementById("signupName");
const signupEmail = document.getElementById("signupEmail");
const signupPassword = document.getElementById("signupPassword");
const signupConfirmPassword = document.getElementById("signupConfirmPassword");
const signupBtn = document.getElementById("signupBtn");
const signupError = document.getElementById("signupError");

const forgotPasswordLink = document.getElementById("forgotPasswordLink");
const forgotEmail = document.getElementById("forgotEmail");
const forgotBtn = document.getElementById("forgotBtn");
const forgotMsg = document.getElementById("forgotMsg");
const backToLoginBtn = document.getElementById("backToLoginBtn");

const verifiedBanner = document.getElementById("verifiedBanner");

// ====== HELPERS ======
function clearErrors() {
    if (loginError) loginError.textContent = "";
    if (signupError) {
        signupError.textContent = "";
        signupError.className = "error-text";
    }
    if (forgotMsg) {
        forgotMsg.textContent = "";
        forgotMsg.className = "error-text";
    }
}

function showLoginPanel() {
    clearErrors();
    loginPanel.classList.remove("auth-panel-hidden");
    signupPanel.classList.add("auth-panel-hidden");
    forgotPanel.classList.add("auth-panel-hidden");

    tabLogin.classList.add("auth-tab-active");
    tabSignup.classList.remove("auth-tab-active");
}

function showSignupPanel() {
    clearErrors();
    signupPanel.classList.remove("auth-panel-hidden");
    loginPanel.classList.add("auth-panel-hidden");
    forgotPanel.classList.add("auth-panel-hidden");

    tabSignup.classList.add("auth-tab-active");
    tabLogin.classList.remove("auth-tab-active");
}

function showForgotPanel() {
    clearErrors();
    forgotPanel.classList.remove("auth-panel-hidden");
    loginPanel.classList.add("auth-panel-hidden");
    signupPanel.classList.add("auth-panel-hidden");
}

// ====== TABS ======
if (tabLogin) {
    tabLogin.addEventListener("click", showLoginPanel);
}
if (tabSignup) {
    tabSignup.addEventListener("click", showSignupPanel);
}

// ====== LOGIN ======
async function handleLogin() {
    clearErrors();
    const email = loginEmail.value.trim();
    const password = loginPassword.value.trim();

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
            loginError.textContent = data.error || "Login failed.";
            return;
        }

        // Save token + name/email
        localStorage.setItem("authToken", data.token);
        localStorage.setItem("userName", data.name);
        localStorage.setItem("userEmail", data.email);

        window.location.href = "app.html";
    } catch (err) {
        console.error("Login error:", err);
        loginError.textContent = "Error: could not reach the server.";
    }
}

if (loginBtn) {
    loginBtn.addEventListener("click", handleLogin);
}
if (loginPassword) {
    loginPassword.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleLogin();
    });
}

// ====== SIGNUP ======
async function handleSignup() {
    clearErrors();
    const name = signupName.value.trim();
    const email = signupEmail.value.trim();
    const password = signupPassword.value.trim();
    const confirmPassword = signupConfirmPassword.value.trim();

    if (!name || !email || !password || !confirmPassword) {
        signupError.textContent = "Please fill in all fields.";
        return;
    }

    if (password !== confirmPassword) {
        signupError.textContent = "Passwords do not match.";
        signupConfirmPassword.value = "";
        signupConfirmPassword.focus();
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
            signupError.textContent = data.error || "Signup failed.";
            return;
        }

        // success UI
        signupError.className = "success-text";
        signupError.textContent =
            data.message ||
            "Signup successful. Please check your Gmail inbox and click the verification link.";

        // Optional: clear password fields
        signupPassword.value = "";
        signupConfirmPassword.value = "";
        signupName.value = "";
        signupEmail.value = "";
    } catch (err) {
        console.error("Signup error:", err);
        signupError.textContent = "Error: could not reach the server.";
    }
}

if (signupBtn) {
    signupBtn.addEventListener("click", handleSignup);
}
if (signupConfirmPassword) {
    signupConfirmPassword.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleSignup();
    });
}

// ====== FORGOT PASSWORD ======
if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", showForgotPanel);
}

if (backToLoginBtn) {
    backToLoginBtn.addEventListener("click", showLoginPanel);
}

if (forgotBtn) {
    forgotBtn.addEventListener("click", async () => {
        clearErrors();
        const email = forgotEmail.value.trim();

        if (!email) {
            forgotMsg.textContent = "Please enter your Gmail address.";
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/auth/forgot-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            const data = await res.json();

            if (!res.ok) {
                forgotMsg.textContent =
                    data.error || "Could not send reset link.";
                return;
            }

            // success
            forgotMsg.className = "success-text";
            forgotMsg.textContent =
                data.message ||
                "If this email exists, a reset link has been sent to your Gmail inbox.";
        } catch (err) {
            console.error("Forgot password error:", err);
            forgotMsg.textContent = "Error: could not reach the server.";
        }
    });
}

// ====== SHOW VERIFIED BANNER IF ?verified=1 ======
(function checkVerifiedFlag() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1" && verifiedBanner) {
        verifiedBanner.style.display = "block";
        showLoginPanel();
    }
})();
