// NAME: Shuffle Queue
// AUTHOR: pablovns
// DESCRIPTION: Shuffles only user-added tracks in 'Next in queue' without altering the playback context or the currently playing track.

/// <reference path="../globals.d.ts" />

(function ShuffleQueue() {
    if (!Spicetify.Platform?.PlayerAPI || !Spicetify.showNotification) {
        setTimeout(ShuffleQueue, 500);
        return;
    }

    // Internationalization (i18n) dictionary
    const TRANSLATIONS = {
        en: {
            btnLabel: "Shuffle queue",
            topbarTooltip: "Shuffle 'Next in queue'",
            emptyQueue: "No tracks in 'Next in queue' to shuffle.",
            singleTrack: "Add at least 2 tracks to 'Next in queue' to shuffle.",
            successNotification: (count) => `🔀 Shuffled ${count} tracks in 'Next in queue'!`,
            errorNotification: (msg) => `Failed to shuffle queue: ${msg}`,
        },
        pt: {
            btnLabel: "Randomizar fila",
            topbarTooltip: "Randomizar 'Next in queue'",
            emptyQueue: "Nenhuma música em 'Next in queue' para randomizar.",
            singleTrack: "Adicione pelo menos 2 músicas em 'Next in queue' para randomizar.",
            successNotification: (count) => `🔀 ${count} músicas em 'Next in queue' foram randomizadas!`,
            errorNotification: (msg) => `Erro ao randomizar fila: ${msg}`,
        },
        es: {
            btnLabel: "Aleatorizar cola",
            topbarTooltip: "Aleatorizar 'Next in queue'",
            emptyQueue: "No hay canciones en 'Next in queue' para aleatorizar.",
            singleTrack: "Agrega al menos 2 canciones en 'Next in queue' para aleatorizar.",
            successNotification: (count) => `🔀 ¡Se aleatorizaron ${count} canciones en 'Next in queue'!`,
            errorNotification: (msg) => `Error al aleatorizar la cola: ${msg}`,
        },
    };

    /**
     * Resolves the active user locale or falls back to English.
     */
    function getLocale() {
        try {
            const raw = Spicetify.Locale?.getLocale?.() || navigator.language || "en";
            const lang = raw.toLowerCase().slice(0, 2);
            return TRANSLATIONS[lang] ? lang : "en";
        } catch {
            return "en";
        }
    }

    const i18n = TRANSLATIONS[getLocale()];

    /**
     * Retrieves currently queued track URIs from Spotify's PlayerAPI.
     */
    function getQueuedTracks() {
        try {
            const playerQueue = Spicetify.Platform?.PlayerAPI?._queue;
            if (playerQueue?._queueState?.queued && Array.isArray(playerQueue._queueState.queued)) {
                return playerQueue._queueState.queued.map((t) => t.uri).filter(Boolean);
            }
            if (Spicetify.Queue?.nextTracks && Array.isArray(Spicetify.Queue.nextTracks)) {
                return Spicetify.Queue.nextTracks
                    .filter((t) => t.provider === "queue" || t.contextTrack?.metadata?.is_queued === "true")
                    .map((t) => t.contextTrack?.uri || t.uri)
                    .filter(Boolean);
            }
        } catch (err) {
            console.error("[ShuffleQueue] Error reading queue state:", err);
        }
        return [];
    }

    /**
     * Main action: shuffles user-enqueued tracks in place.
     */
    async function shuffleUserQueue() {
        const uris = getQueuedTracks();
        if (uris.length === 0) {
            Spicetify.showNotification(i18n.emptyQueue, true);
            return;
        }
        if (uris.length === 1) {
            Spicetify.showNotification(i18n.singleTrack, true);
            return;
        }

        // Fisher-Yates shuffle algorithm for unbiased random permutation
        const shuffled = [...uris];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        try {
            // Clear only user-enqueued tracks (context tracks & active song remain untouched)
            if (typeof Spicetify.Platform?.PlayerAPI?.clearQueue === "function") {
                await Spicetify.Platform.PlayerAPI.clearQueue();
            }

            // Small cooldown allowing Spotify internal state to settle
            await new Promise((res) => setTimeout(res, 120));

            // Re-inject tracks in shuffled order silently
            const trackObjects = shuffled.map((uri) => ({ uri }));
            if (typeof Spicetify.addToQueue === "function") {
                await Spicetify.addToQueue(trackObjects);
            } else if (typeof Spicetify.Platform?.PlayerAPI?.addToQueue === "function") {
                await Spicetify.Platform.PlayerAPI.addToQueue(trackObjects);
            }

            Spicetify.showNotification(i18n.successNotification(shuffled.length));
        } catch (e) {
            console.error("[ShuffleQueue] Error shuffling queue:", e);
            Spicetify.showNotification(i18n.errorNotification(e.message || String(e)), true);
        }
    }

    // 1. Topbar Button
    try {
        if (Spicetify.Topbar?.Button) {
            new Spicetify.Topbar.Button(i18n.topbarTooltip, "shuffle", shuffleUserQueue);
        }
    } catch (e) {
        console.warn("[ShuffleQueue] Could not register topbar button:", e);
    }

    // 2. Global Hotkeys (Ctrl+Alt+Q or Ctrl+Shift+S)
    try {
        if (Spicetify.Mousetrap?.bind) {
            Spicetify.Mousetrap.bind(["ctrl+alt+q", "ctrl+shift+s"], (e) => {
                if (e) e.preventDefault();
                shuffleUserQueue();
            });
        }
    } catch (e) {
        console.warn("[ShuffleQueue] Could not register keyboard shortcut:", e);
    }

    // 3. Dynamic UI Injection: Button next to "Clear queue"
    function injectButtonInQueueView() {
        if (document.getElementById("spicetify-shuffle-queue-btn")) return;

        const buttons = Array.from(document.querySelectorAll("button"));
        const clearBtn = buttons.find((b) => {
            const text = (b.textContent || "").trim().toLowerCase();
            return (
                /^(clear|limpar|borrar|vider|leeren|cancella)\s+(queue|fila|cola|la file|warteschlange|coda)$/i.test(
                    text
                ) ||
                text === "clear queue" ||
                text === "limpar fila"
            );
        });

        if (clearBtn && clearBtn.parentNode) {
            const shuffleBtn = document.createElement("button");
            shuffleBtn.id = "spicetify-shuffle-queue-btn";
            shuffleBtn.className = clearBtn.className;
            shuffleBtn.textContent = i18n.btnLabel;
            shuffleBtn.setAttribute("aria-label", i18n.btnLabel);
            shuffleBtn.style.marginRight = "12px";
            shuffleBtn.style.cursor = "pointer";
            shuffleBtn.style.fontWeight = "bold";
            shuffleBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                shuffleUserQueue();
            };
            clearBtn.parentNode.insertBefore(shuffleBtn, clearBtn);
        }
    }

    const observer = new MutationObserver(() => {
        injectButtonInQueueView();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    injectButtonInQueueView();
})();
