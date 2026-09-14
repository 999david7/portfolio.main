/**
 * Portfolio server.
 *
 * Serves the static site and exposes a single hardened endpoint,
 * POST /api/contact, which stores submissions in data/messages.json and
 * — when SMTP is configured — forwards them by email.
 */

"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");

require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");

/* -------------------------------------------------------------------------- */
/* Storage                                                                     */
/* -------------------------------------------------------------------------- */

const MAX_STORED_MESSAGES = 5000;

function loadMessages() {
    try {
        const parsed = JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf8"));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveMessage(entry) {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    const messages = loadMessages();
    messages.push(entry);

    // Keep the file from growing without bound.
    const trimmed = messages.slice(-MAX_STORED_MESSAGES);

    // Write to a temp file first so a crash mid-write can't truncate the store.
    const tmp = `${MESSAGES_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(trimmed, null, 2), "utf8");
    fs.renameSync(tmp, MESSAGES_FILE);
}

/* -------------------------------------------------------------------------- */
/* Email (optional)                                                            */
/* -------------------------------------------------------------------------- */

const smtp = {
    to: process.env.CONTACT_EMAIL,
    host: process.env.SMTP_HOST,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
};

const smtpReady = Boolean(smtp.to && smtp.host && smtp.user && smtp.pass);

async function sendContactEmail({ name, email, message }) {
    if (!smtpReady) return;

    try {
        const nodemailer = require("nodemailer");
        const transport = nodemailer.createTransport({
            host: smtp.host,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === "true",
            auth: { user: smtp.user, pass: smtp.pass },
        });

        await transport.sendMail({
            from: process.env.SMTP_FROM || smtp.user,
            to: smtp.to,
            replyTo: email,
            subject: `Portfolio contact: ${name}`,
            text: `From: ${name} <${email}>\n\n${message}`,
        });
    } catch (err) {
        // A failed send must not fail the request — the message is already stored.
        console.error("[contact] email send failed:", err.message);
    }
}

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                               */
/* -------------------------------------------------------------------------- */

const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_MAX = 5; // submissions per IP per window
const hits = new Map();

function rateLimit(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);

    if (recent.length >= RATE_MAX) {
        const retryAfter = Math.ceil((RATE_WINDOW_MS - (now - recent[0])) / 1000);
        res.setHeader("Retry-After", String(retryAfter));
        return res.status(429).json({
            ok: false,
            error: "Too many messages from this address. Please try again later.",
        });
    }

    recent.push(now);
    hits.set(ip, recent);
    next();
}

// Drop idle buckets so the map doesn't grow forever.
const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [ip, times] of hits) {
        const live = times.filter((t) => now - t < RATE_WINDOW_MS);
        if (live.length) hits.set(ip, live);
        else hits.delete(ip);
    }
}, RATE_WINDOW_MS);
sweeper.unref();

/* -------------------------------------------------------------------------- */
/* Middleware                                                                  */
/* -------------------------------------------------------------------------- */

app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true");

app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    next();
});

app.use(express.json({ limit: "16kb" }));

/* -------------------------------------------------------------------------- */
/* API routes — mounted before express.static so nothing under /api can ever   */
/* be served as a file.                                                        */
/* -------------------------------------------------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LIMITS = {
    name: 100,
    email: 254,
    message: 5000,
};

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        uptime: Math.round(process.uptime()),
        email: smtpReady ? "configured" : "disabled",
    });
});

app.post("/api/contact", rateLimit, async (req, res) => {
    const body = req.body || {};

    // Honeypot: bots fill hidden fields. Accept and drop silently.
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
        return res
            .status(400)
            .json({ ok: false, error: "That message is too long to send." });
    }

    const entry = {
        name,
        email,
        message,
        at: new Date().toISOString(),
        ip: req.ip,
        userAgent: String(req.get("user-agent") || "").slice(0, 200),
    };

    try {
        saveMessage(entry);
    } catch (err) {
        console.error("[contact] save failed:", err);
        return res
            .status(500)
            .json({ ok: false, error: "Couldn't save your message. Try emailing me directly." });
    }

    console.log(`[contact] stored message from ${email}`);
    await sendContactEmail(entry);

    return res.status(200).json({ ok: true });
});

// Any other /api path or verb is a genuine miss — answer in JSON, not HTML.
app.all("/api/*", (req, res) => {
    res.status(404).json({ ok: false, error: "Not found" });
});

/* -------------------------------------------------------------------------- */
/* Static site                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The site is served straight out of the repo root so the same tree also works
 * on a static host — which means server-side source sits next to the public
 * files. Block it before express.static can hand it out.
 */
const PRIVATE_PATHS =
    /^\/(?:server\.js|data\/|node_modules\/|package(?:-lock)?\.json)/i;

app.use((req, res, next) => {
    if (PRIVATE_PATHS.test(req.path)) {
        return res.status(404).sendFile(path.join(ROOT, "404.html"));
    }
    next();
});

app.use(
    express.static(ROOT, {
        extensions: ["html"],
        dotfiles: "deny",
        setHeaders(res, filePath) {
            // Filenames aren't hashed: revalidate HTML, cache assets for a day.
            if (filePath.endsWith(".html")) {
                res.setHeader("Cache-Control", "no-cache");
            } else {
                res.setHeader("Cache-Control", "public, max-age=86400");
            }
        },
    })
);

// Everything else falls through to the styled 404 page.
app.use((req, res) => {
    res.status(404).sendFile(path.join(ROOT, "404.html"));
});

app.use((err, req, res, next) => {
    console.error("[server]", err);
    if (res.headersSent) return next(err);
    const bad = err.type === "entity.parse.failed" || err.type === "entity.too.large";
    res.status(bad ? 400 : 500).json({
        ok: false,
        error: bad ? "Malformed request." : "Something went wrong.",
    });
});

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */

const server = app.listen(PORT, HOST, () => {
    console.log(`Portfolio running at http://localhost:${PORT}`);
    console.log(`Contact email: ${smtpReady ? "SMTP configured" : "storing to data/messages.json only"}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        console.log(`\n${signal} — shutting down.`);
        server.close(() => process.exit(0));
        // Don't hang forever on a stuck connection.
        setTimeout(() => process.exit(1), 5000).unref();
    });
}

module.exports = app;
