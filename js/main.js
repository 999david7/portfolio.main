/* ==========================================================================
   PORTFOLIO — INTERACTION LAYER
   No dependencies. Loaded with `defer`, so it also works straight off the
   file system. Every module is self-guarding: if its markup isn't on the
   page, it does nothing.
   ========================================================================== */

"use strict";

(function () {
    /* ---------------------------------------------------------------- utils */

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const calm = () => reduceMotion.matches;

    /** Run fn at most once per animation frame. */
    function raf(fn) {
        let queued = false;
        return function (...args) {
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => {
                queued = false;
                fn.apply(this, args);
            });
        };
    }

    function clamp(n, min, max) {
        return Math.min(max, Math.max(min, n));
    }

    /* ------------------------------------------------------------------ zones
       The page runs light at the top and dark past the transition band. Fixed
       overlays (nav, back-to-top, cursor) float over both, so they carry
       `.dark` only while they sit above a dark zone. The palette lives in CSS
       custom properties, so toggling one class re-skins the whole element. */

    (function zones() {
        const floaters = $$("[data-zone-sync]");
        if (!floaters.length) return;

        // Only blocks in the document flow define a zone; overlays such as the
        // drawer carry `.dark` permanently and must not count as one.
        const zones = $$(".dark").filter((el) => {
            if (el.hasAttribute("data-zone-sync")) return false;
            const pos = getComputedStyle(el).position;
            return pos !== "fixed" && pos !== "absolute";
        });

        if (!zones.length) return;

        const nav = $("[data-nav]");

        function span(zone) {
            let top = zone.getBoundingClientRect().top + window.scrollY;
            let height = zone.offsetHeight;

            // Flip partway through the transition band rather than at its very
            // end, so the nav changes while the background is mid-blend.
            const prev = zone.previousElementSibling;
            if (prev && prev.classList.contains("transition")) {
                const lead = prev.offsetHeight * 0.45;
                top -= lead;
                height += lead;
            }

            return [top, top + height];
        }

        const sync = raf(() => {
            // Probe at the vertical middle of the nav bar.
            const probe = window.scrollY + (nav ? nav.offsetHeight / 2 : 32);
            const dark = zones.some((z) => {
                const [top, bottom] = span(z);
                return probe >= top && probe < bottom;
            });

            floaters.forEach((el) => el.classList.toggle("dark", dark));
        });

        window.addEventListener("scroll", sync, { passive: true });
        window.addEventListener("resize", sync, { passive: true });
        sync();
    })();

    /* --------------------------------------------------------- scroll progress */

    (function scrollProgress() {
        const bar = $("[data-progress-bar]");
        if (!bar) return;

        const update = raf(() => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            const value = max > 0 ? window.scrollY / max : 0;
            bar.style.setProperty("--progress", clamp(value, 0, 1).toFixed(4));
        });

        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update, { passive: true });
        update();
    })();

    /* ------------------------------------------------------------------- nav */

    (function nav() {
        const bar = $("[data-nav]");
        if (!bar) return;

        const onScroll = raf(() => {
            bar.classList.toggle("is-stuck", window.scrollY > 24);
        });

        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
    })();

    /* ------------------------------------------------------------- scroll spy */

    (function scrollSpy() {
        const links = $$(".nav__link[href^='#']");
        if (!links.length) return;

        const map = new Map();
        links.forEach((link) => {
            const section = document.getElementById(link.hash.slice(1));
            if (section) map.set(section, link);
        });
        if (!map.size) return;

        let current = null;

        const clear = () => {
            current = null;
            links.forEach((l) => l.classList.remove("is-active"));
        };

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    if (current === entry.target) return;
                    current = entry.target;
                    links.forEach((l) => l.classList.remove("is-active"));
                    map.get(entry.target).classList.add("is-active");
                });
            },
            { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
        );

        map.forEach((_, section) => observer.observe(section));

        // Back at the hero, nothing is "current" — the observer never fires
        // for a section that scrolls away above the band, so clear it here.
        const first = map.keys().next().value;
        window.addEventListener(
            "scroll",
            raf(() => {
                if (window.scrollY + window.innerHeight * 0.5 < first.offsetTop) clear();
            }),
            { passive: true }
        );
    })();

    /* ---------------------------------------------------------------- drawer */

    (function drawer() {
        const panel = $("[data-drawer]");
        const openBtn = $("[data-drawer-open]");
        const scrim = $("[data-scrim]");
        if (!panel || !openBtn || !scrim) return;

        let lastFocus = null;

        const focusables = () =>
            $$(
                "a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex='-1'])",
                panel
            ).filter((el) => el.offsetParent !== null);

        function open() {
            lastFocus = document.activeElement;
            scrim.hidden = false;
            // Force a reflow so the transition runs from the hidden state.
            void scrim.offsetWidth;
            panel.classList.add("is-open");
            scrim.classList.add("is-open");
            panel.removeAttribute("inert");
            panel.setAttribute("aria-hidden", "false");
            openBtn.setAttribute("aria-expanded", "true");
            openBtn.setAttribute("aria-label", "Close menu");
            document.body.classList.add("is-locked");
            const first = focusables()[0];
            if (first) first.focus();
        }

        function close() {
            panel.classList.remove("is-open");
            scrim.classList.remove("is-open");
            panel.setAttribute("inert", "");
            panel.setAttribute("aria-hidden", "true");
            openBtn.setAttribute("aria-expanded", "false");
            openBtn.setAttribute("aria-label", "Open menu");
            document.body.classList.remove("is-locked");
            if (lastFocus && lastFocus.focus) lastFocus.focus();
            window.setTimeout(() => {
                if (!panel.classList.contains("is-open")) scrim.hidden = true;
            }, 450);
        }

        const isOpen = () => panel.classList.contains("is-open");

        openBtn.addEventListener("click", () => (isOpen() ? close() : open()));
        scrim.addEventListener("click", close);
        const closeBtn = $("[data-drawer-close]", panel);
        if (closeBtn) closeBtn.addEventListener("click", close);
        $$("a", panel).forEach((a) => a.addEventListener("click", close));

        document.addEventListener("keydown", (e) => {
            if (!isOpen()) return;

            if (e.key === "Escape") {
                e.preventDefault();
                close();
                return;
            }

            if (e.key !== "Tab") return;

            // Keep focus inside the drawer while it's open.
            const items = focusables();
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });

        // A resize past the breakpoint should not leave the page locked.
        window.addEventListener("resize", () => {
            if (isOpen() && window.innerWidth > 860) close();
        });
    })();

    /* ---------------------------------------------------------- smooth anchors */

    (function anchors() {
        document.addEventListener("click", (e) => {
            const link = e.target.closest('a[href^="#"]');
            if (!link) return;

            const hash = link.getAttribute("href");
            if (!hash || hash === "#") return;

            const target = document.getElementById(hash.slice(1));
            if (!target) return;

            e.preventDefault();

            const nav = $("[data-nav]");
            const offset = nav ? nav.offsetHeight + 12 : 12;
            const top = target.getBoundingClientRect().top + window.scrollY - offset;

            window.scrollTo({
                top: Math.max(0, top),
                behavior: calm() ? "auto" : "smooth",
            });

            // Keep the URL and focus in sync without the browser's own jump.
            history.replaceState(null, "", hash);
            target.setAttribute("tabindex", "-1");
            target.focus({ preventScroll: true });
        });
    })();

    /* ---------------------------------------------------------------- reveals */

    (function reveals() {
        let pending = $$("[data-reveal]");
        if (!pending.length) return;

        if (calm() || !("IntersectionObserver" in window)) {
            pending.forEach((el) => el.classList.add("is-in"));
            return;
        }

        function show(el) {
            el.classList.add("is-in");
            observer.unobserve(el);
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) show(entry.target);
                });
            },
            { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
        );

        pending.forEach((el) => observer.observe(el));

        /**
         * The observer samples intersections once per frame, so an element
         * that flies past during a fast scroll or an anchor jump can be
         * missed — and would then stay invisible for good. This sweep is the
         * guarantee; the observer is just the cheap path. It unhooks itself
         * once everything has been revealed.
         */
        const sweep = raf(() => {
            pending = pending.filter((el) => {
                if (el.classList.contains("is-in")) return false;
                if (el.getBoundingClientRect().top < window.innerHeight - 60) {
                    show(el);
                    return false;
                }
                return true;
            });

            if (!pending.length) {
                window.removeEventListener("scroll", sweep);
                window.removeEventListener("resize", sweep);
            }
        });

        window.addEventListener("scroll", sweep, { passive: true });
        window.addEventListener("resize", sweep, { passive: true });
        sweep();
    })();

    /* ------------------------------------------------------------- split text */

    (function splitText() {
        const nodes = $$("[data-split]");
        if (!nodes.length) return;

        nodes.forEach((node) => {
            const text = node.textContent.trim();
            node.setAttribute("aria-label", text);

            if (calm()) return;

            const frag = document.createDocumentFragment();
            let index = 0;

            text.split(/\s+/).forEach((word, w, all) => {
                const wordEl = document.createElement("span");
                wordEl.className = "split__word";
                wordEl.setAttribute("aria-hidden", "true");

                Array.from(word).forEach((char) => {
                    const outer = document.createElement("span");
                    outer.className = "split__char";
                    outer.style.setProperty("--i", String(index++));

                    const inner = document.createElement("span");
                    inner.textContent = char;

                    outer.appendChild(inner);
                    wordEl.appendChild(outer);
                });

                frag.appendChild(wordEl);
                if (w < all.length - 1) frag.appendChild(document.createTextNode(" "));
            });

            node.textContent = "";
            node.appendChild(frag);
        });
    })();

    /* --------------------------------------------------------------- counters */

    (function counters() {
        const nodes = $$("[data-count]");
        if (!nodes.length) return;

        if (calm() || !("IntersectionObserver" in window)) return;

        const run = (el) => {
            const target = Number(el.dataset.count);
            const suffix = el.dataset.suffix || "";
            if (!Number.isFinite(target)) return;

            const duration = 1100;
            const start = performance.now();

            const tick = (now) => {
                const p = clamp((now - start) / duration, 0, 1);
                // easeOutExpo
                const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
                el.textContent = Math.round(target * eased) + suffix;
                if (p < 1) requestAnimationFrame(tick);
            };

            el.textContent = "0" + suffix;
            requestAnimationFrame(tick);
        };

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    run(entry.target);
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 0.6 }
        );

        nodes.forEach((el) => observer.observe(el));
    })();

    /* ------------------------------------------------------- magnetic buttons */

    (function magnetic() {
        if (calm() || !finePointer.matches) return;

        const strength = 0.32;
        const radius = 70;

        $$("[data-magnetic]").forEach((el) => {
            const move = (e) => {
                const r = el.getBoundingClientRect();
                const dx = e.clientX - (r.left + r.width / 2);
                const dy = e.clientY - (r.top + r.height / 2);
                el.style.setProperty(
                    "--tx",
                    clamp(dx * strength, -radius, radius).toFixed(2) + "px"
                );
                el.style.setProperty(
                    "--ty",
                    clamp(dy * strength, -radius, radius).toFixed(2) + "px"
                );
            };

            const reset = () => {
                el.style.setProperty("--tx", "0px");
                el.style.setProperty("--ty", "0px");
            };

            el.addEventListener("pointermove", move);
            el.addEventListener("pointerleave", reset);
            el.addEventListener("blur", reset);
        });
    })();

    /* ----------------------------------------------------------------- ripple */

    (function ripple() {
        document.addEventListener("pointerdown", (e) => {
            const btn = e.target.closest(".btn, .icon-btn, .filter");
            if (!btn || btn.hasAttribute("disabled")) return;
            if (calm()) return;

            const r = btn.getBoundingClientRect();
            const x = e.clientX - r.left;
            const y = e.clientY - r.top;
            // Reach the furthest corner from the click point.
            const size =
                2 *
                Math.max(
                    Math.hypot(x, y),
                    Math.hypot(r.width - x, y),
                    Math.hypot(x, r.height - y),
                    Math.hypot(r.width - x, r.height - y)
                );

            const dot = document.createElement("span");
            dot.className = "ripple";
            dot.style.width = dot.style.height = size + "px";
            dot.style.left = x + "px";
            dot.style.top = y + "px";

            btn.appendChild(dot);
            dot.addEventListener("animationend", () => dot.remove());
        });
    })();

    /* ------------------------------------------------------- spotlight + tilt */

    (function cards() {
        const spots = $$(".card--spot");
        const tilts = $$(".card--tilt");

        spots.forEach((card) => {
            card.addEventListener("pointermove", (e) => {
                const r = card.getBoundingClientRect();
                card.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
                card.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
            });
        });

        if (calm() || !finePointer.matches) return;

        const maxTilt = 5;

        tilts.forEach((card) => {
            card.addEventListener("pointermove", (e) => {
                const r = card.getBoundingClientRect();
                const px = (e.clientX - r.left) / r.width - 0.5;
                const py = (e.clientY - r.top) / r.height - 0.5;
                card.style.setProperty("--ry", (px * maxTilt * 2).toFixed(2) + "deg");
                card.style.setProperty("--rx", (-py * maxTilt * 2).toFixed(2) + "deg");
            });

            card.addEventListener("pointerleave", () => {
                card.style.setProperty("--rx", "0deg");
                card.style.setProperty("--ry", "0deg");
            });
        });
    })();

    /* ------------------------------------------------------- timeline progress */

    (function timeline() {
        const track = $("[data-timeline]");
        const bar = $("[data-timeline-progress]");
        if (!track || !bar) return;

        const update = raf(() => {
            const r = track.getBoundingClientRect();
            const anchor = window.innerHeight * 0.62;
            const value = (anchor - r.top) / r.height;
            bar.style.setProperty("--progress", clamp(value, 0, 1).toFixed(4));
        });

        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update, { passive: true });
        update();

        // Light up each dot as its card arrives. This state toggles both ways,
        // so it must not reuse `is-in` — that class belongs to the reveal
        // system, which only ever adds it.
        const items = $$("[data-tl]", track);
        if (!items.length || !("IntersectionObserver" in window)) {
            items.forEach((el) => el.classList.add("is-lit"));
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    entry.target.classList.toggle("is-lit", entry.isIntersecting);
                });
            },
            { rootMargin: "-25% 0px -35% 0px", threshold: 0 }
        );

        items.forEach((el) => observer.observe(el));
    })();

    /* -------------------------------------------------------------------- faq */

    (function faq() {
        const list = $("[data-faq]");
        if (!list) return;

        list.addEventListener("click", (e) => {
            const btn = e.target.closest(".faq__q");
            if (!btn) return;

            const item = btn.closest(".faq__item");
            const open = btn.getAttribute("aria-expanded") === "true";

            // Accordion: only one panel stays open.
            $$(".faq__item.is-open", list).forEach((other) => {
                if (other === item) return;
                other.classList.remove("is-open");
                const q = $(".faq__q", other);
                if (q) q.setAttribute("aria-expanded", "false");
            });

            item.classList.toggle("is-open", !open);
            btn.setAttribute("aria-expanded", String(!open));
        });
    })();

    /* ----------------------------------------------------------- copy to clip */

    (function copy() {
        $$("[data-copy]").forEach((btn) => {
            const original = btn.innerHTML;
            let timer = null;

            btn.addEventListener("click", async () => {
                const text = btn.dataset.copy;
                let ok = false;

                try {
                    if (navigator.clipboard && window.isSecureContext) {
                        await navigator.clipboard.writeText(text);
                        ok = true;
                    } else {
                        // http:// and file:// fall back to the legacy path.
                        const ta = document.createElement("textarea");
                        ta.value = text;
                        ta.setAttribute("readonly", "");
                        ta.style.position = "fixed";
                        ta.style.opacity = "0";
                        document.body.appendChild(ta);
                        ta.select();
                        ok = document.execCommand("copy");
                        ta.remove();
                    }
                } catch (err) {
                    ok = false;
                }

                btn.innerHTML = ok
                    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>'
                    : original;
                btn.setAttribute(
                    "aria-label",
                    ok ? "Email copied" : "Copy failed — select the address manually"
                );
                if (ok) btn.style.color = "var(--success)";

                window.clearTimeout(timer);
                timer = window.setTimeout(() => {
                    btn.innerHTML = original;
                    btn.style.color = "";
                    btn.setAttribute("aria-label", "Copy email address");
                }, 2000);
            });
        });
    })();

    /* --------------------------------------------------------- contact form */

    (function contactForm() {
        const form = $("[data-contact-form]");
        if (!form) return;

        const note = $("[data-form-note]", form);
        const submit = $("[data-submit]", form);
        const submitLabel = submit ? $(".btn__label", submit) : null;
        const originalLabel = submitLabel ? submitLabel.innerHTML : "";

        const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
        const MAILTO = "999david01@gmx.at";
        const FIELDS = ["name", "email", "message"];

        /** Named access that can't collide with collection properties. */
        const fld = (n) => form.elements.namedItem(n);
        const val = (n) => {
            const el = fld(n);
            return el ? String(el.value || "").trim() : "";
        };

        const rules = {
            name: (v) =>
                !v ? "Please tell me your name."
                : v.length < 2 ? "That looks a little short."
                : "",
            email: (v) =>
                !v ? "I need an email to reply to."
                : !EMAIL.test(v) ? "That doesn't look like a valid email."
                : "",
            message: (v) =>
                !v ? "Say a few words about the project."
                : v.length < 10 ? "A bit more detail would help."
                : "",
        };

        function fieldError(name, msg) {
            const input = fld(name);
            const slot = $(`[data-error-for="${name}"]`, form);
            if (slot) slot.textContent = msg;
            if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
            return !msg;
        }

        function setNote(text, state) {
            if (!note) return;
            note.dataset.state = state || "";
            note.innerHTML = "";
            if (state === "busy") {
                const s = document.createElement("span");
                s.className = "spinner";
                note.appendChild(s);
            }
            note.appendChild(document.createTextNode(text));
        }

        function setBusy(busy) {
            if (!submit) return;
            submit.disabled = busy;
            if (submitLabel) {
                submitLabel.innerHTML = busy ? "Sending…" : originalLabel;
            }
        }

        // Validate a field once it has been touched, then live on every keystroke.
        FIELDS.forEach((name) => {
            const input = fld(name);
            if (!input) return;

            const check = () => fieldError(name, rules[name](input.value.trim()));

            input.addEventListener("blur", check);
            input.addEventListener("input", () => {
                if (input.getAttribute("aria-invalid") === "true") check();
            });
        });

        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const data = {
                name: val("name"),
                email: val("email"),
                message: val("message"),
                website: val("website"),
            };

            // Honeypot — quietly accept and drop.
            if (data.website) {
                form.reset();
                setNote("Thanks — message received.", "ok");
                return;
            }

            const results = FIELDS.map((n) => fieldError(n, rules[n](data[n])));

            if (results.includes(false)) {
                setNote("Please fix the highlighted fields.", "error");
                const firstBad = $("[aria-invalid='true']", form);
                if (firstBad) firstBad.focus();
                return;
            }

            setBusy(true);
            setNote("Sending your message…", "busy");

            try {
                const res = await fetch("api/contact", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                });

                const payload = await res.json().catch(() => null);

                if (!res.ok || !payload || payload.ok !== true) {
                    const msg =
                        (payload && payload.error) ||
                        (res.status === 429
                            ? "Too many messages just now — try again in a minute."
                            : "Something went wrong on my end.");
                    setNote(msg, "error");
                    setBusy(false);
                    return;
                }

                form.reset();
                FIELDS.forEach((n) => fieldError(n, ""));
                setNote("Message sent — I'll get back to you soon.", "ok");
                setBusy(false);
                window.setTimeout(() => setNote("", ""), 6000);
            } catch (err) {
                // No API reachable (static hosting, offline, file://).
                // Hand the visitor a pre-filled email instead of a dead end.
                setBusy(false);
                setNote("Couldn't reach the server — opening your email app instead…", "error");

                const subject = encodeURIComponent(`Portfolio enquiry from ${data.name}`);
                const body = encodeURIComponent(`${data.message}\n\n— ${data.name} (${data.email})`);
                window.setTimeout(() => {
                    window.location.href = `mailto:${MAILTO}?subject=${subject}&body=${body}`;
                }, 900);
            }
        });
    })();

    /* ------------------------------------------------------------- back to top */

    (function toTop() {
        const btn = $("[data-to-top]");
        if (!btn) return;

        const onScroll = raf(() => {
            btn.classList.toggle("is-shown", window.scrollY > window.innerHeight * 0.8);
        });

        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();

        btn.addEventListener("click", () => {
            window.scrollTo({ top: 0, behavior: calm() ? "auto" : "smooth" });
        });
    })();

    /* ---------------------------------------------------------------- cursor */

    (function cursor() {
        const ring = $("[data-cursor]");
        if (!ring || calm() || !finePointer.matches) return;

        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;
        let rx = x;
        let ry = y;
        let running = false;

        const HOVERABLE =
            "a, button, .card, .chip, input, textarea, select, summary, [role='button']";

        function loop() {
            rx += (x - rx) * 0.18;
            ry += (y - ry) * 0.18;
            ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
            if (running) requestAnimationFrame(loop);
        }

        document.addEventListener(
            "pointermove",
            (e) => {
                if (e.pointerType !== "mouse") return;
                x = e.clientX;
                y = e.clientY;
                if (!running) {
                    running = true;
                    rx = x;
                    ry = y;
                    ring.classList.add("is-on");
                    requestAnimationFrame(loop);
                }
            },
            { passive: true }
        );

        document.addEventListener("pointerover", (e) => {
            if (e.target.closest && e.target.closest(HOVERABLE)) {
                ring.classList.add("is-hover");
            }
        });

        document.addEventListener("pointerout", (e) => {
            if (e.target.closest && e.target.closest(HOVERABLE)) {
                ring.classList.remove("is-hover");
            }
        });

        document.addEventListener("pointerdown", () => ring.classList.add("is-down"));
        document.addEventListener("pointerup", () => ring.classList.remove("is-down"));

        document.addEventListener("mouseleave", () => ring.classList.remove("is-on"));
        document.addEventListener("mouseenter", () => {
            if (running) ring.classList.add("is-on");
        });
    })();

    /* ------------------------------------------------------------ projects page */

    (function projectFilters() {
        const grid = $("[data-projects]");
        if (!grid) return;

        const cards = $$("[data-project]", grid);
        const buttons = $$("[data-filter]");
        const search = $("[data-search]");
        const empty = $("[data-empty]");
        const countEl = $("[data-result-count]");

        let activeFilter = "all";
        let query = "";

        // Show how many projects sit behind each filter.
        buttons.forEach((btn) => {
            const key = btn.dataset.filter;
            const slot = $(".filter__count", btn);
            if (!slot) return;
            slot.textContent =
                key === "all"
                    ? cards.length
                    : cards.filter((c) => c.dataset.category === key).length;
        });

        function apply() {
            let shown = 0;

            cards.forEach((card) => {
                const matchesFilter =
                    activeFilter === "all" || card.dataset.category === activeFilter;
                const haystack = (card.dataset.search || card.textContent).toLowerCase();
                const matchesQuery = !query || haystack.includes(query);
                const visible = matchesFilter && matchesQuery;

                card.classList.toggle("is-hidden", !visible);
                if (visible) {
                    card.style.setProperty("--d", String(shown));
                    shown++;
                }
            });

            if (empty) empty.classList.toggle("is-shown", shown === 0);
            if (countEl) {
                countEl.textContent = `${shown} project${shown === 1 ? "" : "s"}`;
            }
        }

        buttons.forEach((btn) => {
            btn.addEventListener("click", () => {
                activeFilter = btn.dataset.filter;
                buttons.forEach((b) =>
                    b.setAttribute("aria-pressed", String(b === btn))
                );

                const url = new URL(window.location.href);
                if (activeFilter === "all") url.searchParams.delete("filter");
                else url.searchParams.set("filter", activeFilter);
                history.replaceState(null, "", url);

                apply();
            });
        });

        if (search) {
            search.addEventListener("input", () => {
                query = search.value.trim().toLowerCase();
                apply();
            });

            // "/" jumps to search, Escape clears it.
            document.addEventListener("keydown", (e) => {
                const active = document.activeElement;
                const typing =
                    !!active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
                if (e.key === "/" && !typing) {
                    e.preventDefault();
                    search.focus();
                } else if (e.key === "Escape" && document.activeElement === search) {
                    search.value = "";
                    query = "";
                    apply();
                    search.blur();
                }
            });
        }

        // Deep link: ?filter=web
        const requested = new URL(window.location.href).searchParams.get("filter");
        const match = buttons.find((b) => b.dataset.filter === requested);
        if (match) match.click();
        else apply();

        // Reset button inside the empty state.
        const reset = $("[data-reset-filters]");
        if (reset) {
            reset.addEventListener("click", () => {
                if (search) search.value = "";
                query = "";
                const all = buttons.find((b) => b.dataset.filter === "all");
                if (all) all.click();
                else apply();
            });
        }
    })();

    /* ------------------------------------------------------------------- year */

    (function year() {
        $$("[data-year]").forEach((el) => {
            el.textContent = String(new Date().getFullYear());
        });
    })();
})();
