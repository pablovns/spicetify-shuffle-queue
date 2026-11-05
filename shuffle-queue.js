// NAME: Shuffle Queue
// AUTHOR: pablovns
// DESCRIPTION: Shuffles only user-added tracks in 'Next in queue' atomically without altering playback context or playing track.

/// <reference path="../globals.d.ts" />

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
function resolveLocale(rawLocale) {
    try {
        const lang = (rawLocale || "en").toLowerCase().slice(0, 2);
        return TRANSLATIONS[lang] ? lang : "en";
    } catch {
        return "en";
    }
}

/**
 * Fisher-Yates shuffle algorithm for unbiased random permutation.
 */
function fisherYatesShuffle(array, randomFn = Math.random) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(randomFn() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

/**
 * Extracts queued track items with their unique UIDs and URIs.
 */
function getQueuedItems(playerApiQueue) {
    if (!playerApiQueue?._queue?.nextTracks) return [];
    const isQueued =
        typeof playerApiQueue.isQueued === "function"
            ? (t) => playerApiQueue.isQueued(t)
            : (t) => t.provider === "queue" || t.contextTrack?.metadata?.is_queued === "true";

    return playerApiQueue._queue.nextTracks
        .filter(isQueued)
        .map((t) => ({
            uid: t.contextTrack?.uid || t.uid,
            uri: t.contextTrack?.uri || t.uri,
            name: t.contextTrack?.metadata?.title || t.name,
        }))
        .filter((t) => Boolean(t.uid || t.uri));
}

/**
 * Reorders user queue atomically using Spotify's native reorderQueue API.
 * @param {Object} spicetifyInstance Spicetify global or mock
 * @param {Function} shuffleAlgorithm Custom shuffle algorithm (items: Array) => Array
 */
async function shuffleUserQueue(
    spicetifyInstance = typeof Spicetify !== "undefined" ? Spicetify : null,
    shuffleAlgorithm = (arr) => fisherYatesShuffle(arr, Math.random)
) {
    if (!spicetifyInstance) return { success: false, reason: "NO_SPICETIFY" };

    const localeKey = resolveLocale(
        spicetifyInstance.Locale?.getLocale?.() ||
            (typeof navigator !== "undefined" ? navigator.language : "en")
    );
    const i18n = TRANSLATIONS[localeKey];

    const playerQueue = spicetifyInstance.Platform?.PlayerAPI?._queue;
    if (!playerQueue) {
        spicetifyInstance.showNotification?.(i18n.errorNotification("Player queue unavailable"), true);
        return { success: false, reason: "QUEUE_UNAVAILABLE" };
    }

    const items = getQueuedItems(playerQueue);

    if (items.length === 0) {
        spicetifyInstance.showNotification?.(i18n.emptyQueue, true);
        return { success: false, reason: "EMPTY_QUEUE", count: 0 };
    }

    if (items.length === 1) {
        spicetifyInstance.showNotification?.(i18n.singleTrack, true);
        return { success: false, reason: "SINGLE_TRACK", count: 1 };
    }

    // Shuffle the items
    const shuffled =
        typeof shuffleAlgorithm === "function"
            ? shuffleAlgorithm(items)
            : fisherYatesShuffle(items);

    try {
        // Atomic reorder: place [shuffled[1], ..., shuffled[n-1]] after shuffled[0]
        if (typeof playerQueue.reorderQueue === "function") {
            const firstItem = { uid: shuffled[0].uid, uri: shuffled[0].uri };
            const restItems = shuffled.slice(1).map((t) => ({ uid: t.uid, uri: t.uri }));
            await playerQueue.reorderQueue(restItems, { after: firstItem });
        } else {
            // Fallback for environments where reorderQueue is not exposed
            await playerQueue.clearQueue?.();
            await new Promise((r) => setTimeout(r, 100));
            await spicetifyInstance.addToQueue?.(shuffled.map((t) => ({ uri: t.uri })));
        }

        spicetifyInstance.showNotification?.(i18n.successNotification(shuffled.length));
        return { success: true, count: shuffled.length, permutation: shuffled.map((t) => t.uid) };
    } catch (err) {
        console.error("[ShuffleQueue] Error during reorder:", err);
        spicetifyInstance.showNotification?.(i18n.errorNotification(err.message || String(err)), true);
        return { success: false, error: err.message || String(err) };
    }
}

/**
 * Injects the "Shuffle queue" button in the Queue header next to "Clear queue".
 */
function injectButtonInQueueView(
    doc = typeof document !== "undefined" ? document : null,
    onShuffle = shuffleUserQueue,
    i18n = TRANSLATIONS.en
) {
    if (!doc || doc.getElementById("spicetify-shuffle-queue-btn")) return false;

    const buttons = Array.from(doc.querySelectorAll("button"));
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
        const shuffleBtn = doc.createElement("button");
        shuffleBtn.id = "spicetify-shuffle-queue-btn";
        shuffleBtn.className = clearBtn.className;
        shuffleBtn.textContent = i18n.btnLabel;
        if (typeof shuffleBtn.setAttribute === "function") {
            shuffleBtn.setAttribute("aria-label", i18n.btnLabel);
        }
        shuffleBtn.style.marginRight = "12px";
        shuffleBtn.style.cursor = "pointer";
        shuffleBtn.style.fontWeight = "bold";
        shuffleBtn.onclick = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            onShuffle();
        };
        clearBtn.parentNode.insertBefore(shuffleBtn, clearBtn);
        return true;
    }
    return false;
}

// Browser Spicetify initialization
if (typeof window !== "undefined" && typeof Spicetify !== "undefined") {
    (function init() {
        if (!Spicetify.Platform?.PlayerAPI || !Spicetify.showNotification) {
            setTimeout(init, 500);
            return;
        }

        const localeKey = resolveLocale(Spicetify.Locale?.getLocale?.() || navigator.language);
        const i18n = TRANSLATIONS[localeKey];

        // 1. Topbar Button
        try {
            if (Spicetify.Topbar?.Button) {
                new Spicetify.Topbar.Button(i18n.topbarTooltip, "shuffle", () =>
                    shuffleUserQueue(Spicetify)
                );
            }
        } catch (e) {
            console.warn("[ShuffleQueue] Could not register topbar button:", e);
        }

        // 2. Global Hotkeys
        try {
            if (Spicetify.Mousetrap?.bind) {
                Spicetify.Mousetrap.bind(["ctrl+alt+q", "ctrl+shift+s"], (e) => {
                    if (e) e.preventDefault();
                    shuffleUserQueue(Spicetify);
                });
            }
        } catch (e) {
            console.warn("[ShuffleQueue] Could not register keyboard shortcut:", e);
        }

        // 3. Dynamic UI Injection
        const observer = new MutationObserver(() => {
            injectButtonInQueueView(document, () => shuffleUserQueue(Spicetify), i18n);
        });

        observer.observe(document.body, { childList: true, subtree: true });
        injectButtonInQueueView(document, () => shuffleUserQueue(Spicetify), i18n);
    })();
}

// CommonJS export for automated unit tests
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        TRANSLATIONS,
        resolveLocale,
        fisherYatesShuffle,
        getQueuedItems,
        shuffleUserQueue,
        injectButtonInQueueView,
    };
}
