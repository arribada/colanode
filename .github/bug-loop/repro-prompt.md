You are the reproduction step of an automated bug loop. Issue: {{ISSUE}} (`gh issue view {{ISSUE}} --comments`).
A staging copy of the app (built from current main) is running at http://localhost:55080 with an EMPTY database.

Your job — prove or disprove the reported bug, deterministically:
1. Read the issue. If it references a Clips recording, fetch its diagnostics:
   `curl -s "$CLIPS_BASE/api/agent-context.json?id=<recordingId>" -H "Authorization: Bearer $CLIPS_AGENT_INGEST_TOKEN"`.
2. Invoke the browser-test-v2 skill (quick mode) against http://localhost:55080. Seed in-flow:
   register a fresh account (bt-issue{{ISSUE}}@bt.local / password Bt-{{ISSUE}}-pass1) and create whatever
   workspace/data the scenario needs, then walk the reported flow. Oracle floor is mandatory.
3. Author a v2 manifest that deterministically demonstrates the bug (scenario FAILS on the buggy build),
   including the in-flow seeding steps. Set `base_url: "__BT_BASE_URL__"` (literal placeholder).
   Run it via the Mode 0 runner to confirm it fails for the RIGHT reason.
   IMPORTANT: this exact file gets committed verbatim and re-run by the fix/gate/ship stages to verify the
   FIXED build — assert ONLY conditions that must hold once the bug is fixed. Do NOT add an assertion that
   pins the current buggy behavior (e.g. "the misspelled label is still present") alongside the fix
   assertion — the two are typically mutually exclusive on a single control, which makes the manifest
   permanently unable to pass once the real fix lands.
   PORTABILITY: this same manifest also runs unmodified against staging (http://localhost:55080) AND prod
   (https://chat.kvotaflow.ru) later, with only base_url substituted — nothing else about the target
   differs. Never target an element by a value that is itself environment-config-derived, e.g. the
   server's display `name` (staging config.json says "Colanode Staging", prod says something else) or a
   domain-suffixed test id. Prefer stable, env-independent locators: static test_id, a CSS attribute
   *prefix* match (e.g. `[data-testid^="server-card-"]`) when the suffix is env-specific, role+name for
   copy that's the same everywhere, or visible static text.
4. If reproduced: `gh issue edit {{ISSUE}} --add-label reproduced` and post a comment with
   (a) one paragraph of what fails and why, (b) the full manifest in a ```yaml code block,
   (c) the failing oracle evidence (real console/network counts).
5. If after honest effort it does not reproduce: `gh issue edit {{ISSUE}} --add-label cannot-reproduce`
   + comment with what you tried and the real oracle outputs. NEVER fake a result; if a check can't run, say BLOCKED.
