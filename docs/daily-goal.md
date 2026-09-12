# Daily practice goal

Practice & history accepts whole minutes from 0 to 120, defaulting to 10. Zero hides the quiet Today label but does not stop progress collection. The setting lives with preferences, separately from the progress ledger; progress-only reset keeps it and full local reset restores the default.

The label reads today's existing local-date activity across all compatible keyboard histories. It floors displayed minutes and checks the actual milliseconds before saying Daily goal met: 599,999 ms remains 9/10, while 600,000 ms meets a 10-minute goal. The drawer gives minutes and whole seconds. Reaching a goal never moves focus, stops practice or adds a celebration.

A one-second presentation refresh notices a new date or timezone while idle; it does not accumulate time or write storage. Accepted-action timing remains the shared ledger's monotonic interval calculation. Its transient action anchor now also remembers the timezone offset at the previous action: if that historical offset changes, an ambiguous interval is assigned to the endpoint's current local date instead of being split using the new timezone. Historical buckets stay unchanged, no offsets or timestamps are persisted, and DST transitions still use their actual historical offsets.

Tests cover the exact completion boundary, off/edit/reset/reload, continued and abandoned practice, duplicate observations, concurrent writer notice, denied settings storage, local midnight, DST and timezone changes. These are synthetic software checks; the default duration is a reversible product choice, with no learning-efficacy claim.
