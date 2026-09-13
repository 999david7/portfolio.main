/**
 * Serverless contact handler (Vercel / Netlify functions style).
 *
 * The Express server in server.js implements the same contract at
 * POST /api/contact. This file exists so the form keeps working when the
 * site is deployed to a serverless host instead of a long-running Node
 * process. The front end calls the same relative path either way.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LIMITS = { name: 100, email: 254, message: 5000 };

async function sendEmail({ name, email, message }) {
    const to = process.env.CONTACT_EMAIL;
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!to || !host || !user || !pass) return false;

    const nodemailer = require("nodemailer");
    const transport = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: { user, pass },
    });

    await transport.sendMail({
        from: process.env.SMTP_FROM || user,
        to,
        replyTo: email,
        subject: `Portfolio contact: ${name}`,
        text: `From: ${name} <${email}>\n\n${message}`,
    });

    return true;
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

    // Honeypot — accept and drop.
    if (String(body.website || "").trim()) {
        return res.status(200).json({ ok: true });
    }

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const message = String(body.message || "").trim();

    if (!name || !email || !message) {
        return res
            .status(400)
            .json({ ok: false, error: "Name, email and message are all required." });
    }

    if (!EMAIL_RE.test(email)) {
        return res
            .status(400)
            .json({ ok: false, error: "That doesn't look like a valid email address." });
    }

    if (
        name.length > LIMITS.name ||
        email.length > LIMITS.email ||
        message.length > LIMITS.message
    ) {
        return res.status(400).json({ ok: false, error: "That message is too long to send." });
    }

    try {
        const sent = await sendEmail({ name, email, message });
        if (!sent) {
            // No SMTP on this deployment — there is nowhere durable to put the
            // message, so say so rather than pretending it was delivered.
            console.warn("[contact] SMTP not configured; message dropped:", email);
            return res.status(503).json({
                ok: false,
                error: "The contact service isn't configured yet. Please email me directly.",
            });
        }
    } catch (err) {
        console.error("[contact] send failed:", err.message);
        return res
            .status(502)
            .json({ ok: false, error: "Couldn't deliver your message. Please email me directly." });
    }

    return res.status(200).json({ ok: true });
};

function safeParse(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}
