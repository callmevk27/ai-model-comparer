// backend/mailer.js
const nodemailer = require("nodemailer");
require("dotenv").config({ path: "../.env" });

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.EMAIL_PORT) || 465,
    secure: process.env.EMAIL_SECURE === "false" ? false : true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

async function sendVerificationEmail(toEmail, userName, verifyUrl) {
    const appName = "AI Model Judge";

    const mailOptions = {
        from: `"${appName}" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: `Verify your email for ${appName}`,
        text: `Hi ${userName},

Please verify your email to activate your ${appName} account.

Click this link (or paste in browser):
${verifyUrl}

If you did not try to sign up, you can ignore this email.

Best,
${appName} Team`,
        html: `
        <div style="font-family: system-ui, sans-serif; color:#0f172a;">
          <h2>Verify your email, ${userName} 👋</h2>
          <p>Thanks for signing up for <strong>${appName}</strong>.</p>
          <p>Please click the button below to verify your Gmail address and activate your account:</p>
          <p style="margin:16px 0;">
            <a href="${verifyUrl}" 
               style="display:inline-block;padding:10px 18px;border-radius:999px;
                      background:#3b82f6;color:#fff;text-decoration:none;font-weight:600;">
              Verify my email
            </a>
          </p>
          <p style="font-size:13px;color:#4b5563;">
            Or copy and paste this link into your browser:<br/>
            <span style="word-break:break-all;">${verifyUrl}</span>
          </p>
          <hr/>
          <p style="font-size:12px;color:#6b7280;">
            If you did not request this, you can safely ignore this email.
          </p>
        </div>
        `,
    };

    await transporter.sendMail(mailOptions);
}

async function sendPasswordResetEmail(toEmail, name, resetUrl) {
    const appName = "AI Model Judge";

    const mailOptions = {
        from: `"${appName}" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: "Reset your AI Model Judge password",
        html: `
            <div style="font-family: system-ui, sans-serif; color:#0f172a;">
              <h2>Hello ${name},</h2>
              <p>You requested to reset your password.</p>
              <p>Click the button below to create a new one:</p>
              <p style="margin:16px 0;">
                <a href="${resetUrl}"
                   style="padding:10px 16px; background:#4f46e5; color:white; border-radius:999px; text-decoration:none;">
                  Reset Password
                </a>
              </p>
              <p style="font-size:13px;color:#4b5563;">
                  Or copy and paste this link into your browser:<br/>
                  <span style="word-break:break-all;">${resetUrl}</span>
              </p>
              <p>This link will expire in 1 hour.</p>
            </div>
        `,
    };

    return transporter.sendMail(mailOptions);
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
