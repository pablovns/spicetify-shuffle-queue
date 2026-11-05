const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
    TRANSLATIONS,
    resolveLocale,
    fisherYatesShuffle,
    getQueuedItems,
    shuffleUserQueue,
    injectButtonInQueueView,
} = require("../shuffle-queue.js");

// Centralized Test Fixtures (Object Mother pattern)
function createMockTrack({ uid, uri, title = "Test Song", isQueued = true, provider = "queue" }) {
    return {
        uid,
        provider,
        contextTrack: {
            uid,
            uri,
            metadata: {
                title,
                is_queued: isQueued ? "true" : "false",
            },
        },
    };
}

function createMockSpicetify({ nextTracks = [], locale = "en", reorderImpl = null } = {}) {
    const reorderCalls = [];
    const notificationCalls = [];

    const isQueued = (t) =>
        t.provider === "queue" || t.contextTrack?.metadata?.is_queued === "true";

    const playerQueue = {
        _queue: {
            nextTracks: [...nextTracks],
            prevTracks: [],
            queueRevision: 1000n,
        },
        isQueued,
        reorderQueue:
            reorderImpl ||
            (async (restItems, target) => {
                reorderCalls.push({ restItems, target });
            }),
    };

    const spicetifyInstance = {
        Locale: {
            getLocale: () => locale,
        },
        Platform: {
            PlayerAPI: {
                _queue: playerQueue,
            },
        },
        showNotification: (msg, isError = false) => {
            notificationCalls.push({ msg, isError });
        },
    };

    return {
        spicetifyInstance,
        reorderCalls,
        notificationCalls,
        playerQueue,
    };
}

describe("Spicetify: Shuffle Next in Queue Test Suite", () => {
    describe("1. Boundary & Negative Side-Effect Verification", () => {
        it("Scenario: Empty queue (0 tracks) -> Zero mutations and informative notification", async () => {
            const { spicetifyInstance, reorderCalls, notificationCalls } = createMockSpicetify({
                nextTracks: [],
                locale: "en",
            });

            const result = await shuffleUserQueue(spicetifyInstance);

            // Assert negative side-effects: reorderQueue must NEVER be called
            assert.equal(result.success, false);
            assert.equal(result.reason, "EMPTY_QUEUE");
            assert.equal(result.count, 0);
            assert.equal(reorderCalls.length, 0);

            // Deep assertion on feedback
            assert.equal(notificationCalls.length, 1);
            assert.equal(notificationCalls[0].msg, TRANSLATIONS.en.emptyQueue);
            assert.equal(notificationCalls[0].isError, true);
        });

        it("Scenario: Single track in queue (1 track) -> Zero mutations and boundary notification", async () => {
            const singleTrack = createMockTrack({
                uid: "q1",
                uri: "spotify:track:rhcp1",
                title: "Can't Stop",
            });
            const { spicetifyInstance, reorderCalls, notificationCalls } = createMockSpicetify({
                nextTracks: [singleTrack],
                locale: "pt",
            });

            const result = await shuffleUserQueue(spicetifyInstance);

            // Zero mutations
            assert.equal(result.success, false);
            assert.equal(result.reason, "SINGLE_TRACK");
            assert.equal(result.count, 1);
            assert.equal(reorderCalls.length, 0);

            // Localized notification assertion
            assert.equal(notificationCalls.length, 1);
            assert.equal(notificationCalls[0].msg, TRANSLATIONS.pt.singleTrack);
            assert.equal(notificationCalls[0].isError, true);
        });
    });

    describe("2. Atomic Permutation & Duplicate Handling", () => {
        it("Scenario: 4 tracks in queue -> Atomically reorders via reorderQueue with exact payload", async () => {
            const tracks = [
                createMockTrack({ uid: "q1", uri: "spotify:track:1", title: "Track 1" }),
                createMockTrack({ uid: "q2", uri: "spotify:track:2", title: "Track 2" }),
                createMockTrack({ uid: "q3", uri: "spotify:track:3", title: "Track 3" }),
                createMockTrack({ uid: "q4", uri: "spotify:track:4", title: "Track 4" }),
            ];

            const { spicetifyInstance, reorderCalls, notificationCalls } = createMockSpicetify({
                nextTracks: tracks,
                locale: "en",
            });

            // Deterministic reverse permutation: [q4, q3, q2, q1]
            const deterministicShuffle = (arr) => [...arr].reverse();
            const result = await shuffleUserQueue(spicetifyInstance, deterministicShuffle);

            assert.equal(result.success, true);
            assert.equal(result.count, 4);

            // Reorder must be called exactly ONCE (atomic operation)
            assert.equal(reorderCalls.length, 1);

            const call = reorderCalls[0];
            // Target is first item of permutation (q4)
            assert.deepEqual(call.target, { after: { uid: "q4", uri: "spotify:track:4" } });

            // Rest items placed after target in order [q3, q2, q1]
            assert.deepEqual(call.restItems, [
                { uid: "q3", uri: "spotify:track:3" },
                { uid: "q2", uri: "spotify:track:2" },
                { uid: "q1", uri: "spotify:track:1" },
            ]);

            assert.equal(notificationCalls.length, 1);
            assert.equal(notificationCalls[0].msg, "🔀 Shuffled 4 tracks in 'Next in queue'!");
        });

        it("Scenario: Queue contains duplicate tracks (Same song URI added multiple times) -> Retains all distinct UIDs", async () => {
            // User enqueued "The Longest Wave" twice and "Bicycle Song" twice
            const tracks = [
                createMockTrack({
                    uid: "q16",
                    uri: "spotify:track:longest_wave",
                    title: "The Longest Wave",
                }),
                createMockTrack({
                    uid: "q17",
                    uri: "spotify:track:bicycle_song",
                    title: "Bicycle Song",
                }),
                createMockTrack({
                    uid: "q18",
                    uri: "spotify:track:longest_wave",
                    title: "The Longest Wave",
                }),
                createMockTrack({
                    uid: "q19",
                    uri: "spotify:track:bicycle_song",
                    title: "Bicycle Song",
                }),
            ];

            const { spicetifyInstance, reorderCalls } = createMockSpicetify({
                nextTracks: tracks,
            });

            // Permutation targeting [q19, q16, q17, q18]
            const customShuffle = (items) => [items[3], items[0], items[1], items[2]];
            const result = await shuffleUserQueue(spicetifyInstance, customShuffle);

            assert.equal(result.success, true);
            assert.equal(result.count, 4);
            assert.deepEqual(result.permutation, ["q19", "q16", "q17", "q18"]);

            // Ensure no duplicate items were dropped or phantom items added
            const call = reorderCalls[0];
            const allTargetUids = [call.target.after.uid, ...call.restItems.map((t) => t.uid)];
            assert.equal(allTargetUids.length, 4);
            assert.deepEqual(allTargetUids, ["q19", "q16", "q17", "q18"]);
        });
    });

    describe("3. Context Isolation (Background Playlist Protection)", () => {
        it("Scenario: Queue has user items + 50 playlist tracks -> Only user queue items are touched", () => {
            const userTracks = [
                createMockTrack({
                    uid: "q1",
                    uri: "spotify:track:u1",
                    isQueued: true,
                    provider: "queue",
                }),
                createMockTrack({
                    uid: "q2",
                    uri: "spotify:track:u2",
                    isQueued: true,
                    provider: "queue",
                }),
            ];

            const playlistTracks = Array.from({ length: 50 }, (_, i) =>
                createMockTrack({
                    uid: `p${i}`,
                    uri: `spotify:track:playlist_${i}`,
                    isQueued: false,
                    provider: "context",
                })
            );

            const mockQueue = {
                _queue: {
                    nextTracks: [...userTracks, ...playlistTracks],
                },
                isQueued: (t) => t.provider === "queue",
            };

            const items = getQueuedItems(mockQueue);

            // Deep assertion: exactly 2 user tracks extracted, 0 playlist tracks
            assert.equal(items.length, 2);
            assert.deepEqual(
                items.map((t) => t.uid),
                ["q1", "q2"]
            );
        });
    });

    describe("4. Fisher-Yates Permutation Correctness", () => {
        it("Scenario: Fisher-Yates preserves all elements without mutation of length, loss or duplication", () => {
            const original = ["A", "B", "C", "D", "E", "F", "G"];
            const shuffled = fisherYatesShuffle(original);

            // Invariant: length must be identical
            assert.equal(shuffled.length, original.length);

            // Invariant: all original elements must exist in shuffled result
            const sortedOriginal = [...original].sort();
            const sortedShuffled = [...shuffled].sort();
            assert.deepEqual(sortedShuffled, sortedOriginal);
        });
    });

    describe("5. Internationalization (i18n) Parameterized Matrix", () => {
        const testCases = [
            { locale: "en-US", expectedKey: "en", label: "Shuffle queue" },
            { locale: "en", expectedKey: "en", label: "Shuffle queue" },
            { locale: "pt-BR", expectedKey: "pt", label: "Randomizar fila" },
            { locale: "pt", expectedKey: "pt", label: "Randomizar fila" },
            { locale: "es-ES", expectedKey: "es", label: "Aleatorizar cola" },
            { locale: "es", expectedKey: "es", label: "Aleatorizar cola" },
            { locale: "fr-FR", expectedKey: "en", label: "Shuffle queue" }, // Fallback to English
            { locale: "de", expectedKey: "en", label: "Shuffle queue" }, // Fallback to English
        ];

        testCases.forEach(({ locale, expectedKey, label }) => {
            it(`Locale '${locale}' resolves to '${expectedKey}' with button label '${label}'`, () => {
                const resolved = resolveLocale(locale);
                assert.equal(resolved, expectedKey);
                assert.equal(TRANSLATIONS[resolved].btnLabel, label);
            });
        });
    });

    describe("6. DOM Button Injection & Idempotency", () => {
        it("Scenario: Injects button next to 'Clear queue' once and remains idempotent on re-runs", () => {
            // Lightweight Mock DOM
            const createdElements = [];
            const clearBtn = {
                textContent: "Clear queue",
                className: "encore-button-tertiary",
                parentNode: {
                    insertBefore: (newChild, refChild) => {
                        createdElements.push({ newChild, refChild });
                    },
                },
            };

            let injectedElement = null;
            const mockDoc = {
                getElementById: (id) => (injectedElement?.id === id ? injectedElement : null),
                querySelectorAll: () => [clearBtn],
                createElement: (tag) => {
                    const el = {
                        tagName: tag,
                        style: {},
                        setAttribute: (k, v) => {
                            el[k] = v;
                        },
                    };
                    injectedElement = el;
                    return el;
                },
            };

            let shuffleCalled = false;
            const onShuffle = () => {
                shuffleCalled = true;
            };

            // 1st run: Should inject button
            const firstResult = injectButtonInQueueView(mockDoc, onShuffle, TRANSLATIONS.en);
            assert.equal(firstResult, true);
            assert.equal(createdElements.length, 1);
            assert.equal(createdElements[0].newChild.id, "spicetify-shuffle-queue-btn");
            assert.equal(createdElements[0].newChild.textContent, "Shuffle queue");

            // Test click interaction
            createdElements[0].newChild.onclick({ preventDefault: () => {}, stopPropagation: () => {} });
            assert.equal(shuffleCalled, true);

            // 2nd run: Idempotency check -> Must NOT duplicate button
            const secondResult = injectButtonInQueueView(mockDoc, onShuffle, TRANSLATIONS.en);
            assert.equal(secondResult, false);
            assert.equal(createdElements.length, 1); // Still exactly 1
        });
    });
});
