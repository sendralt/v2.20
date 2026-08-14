# Agent Zero Message Misformat Investigation Report

**Date:** 2026-08-14  
**Component:** Agent Zero message loop - tool request extraction  
**Error:** Agent 0: Message misformat, no valid tool request found.  
**Status:** Root cause identified; agent-side mitigation active; framework patch proposed

## 1. Executive Summary

During the FishSmartPro UI restyling session, roughly eight tool-call messages were rejected with 'Message misformat, no valid tool request found', including two consecutive rejections, which halts the agent loop until the user intervenes. Investigation in a branched chat replayed synthetic replicas of the failed payloads through the production parser and isolated the root cause: the framework requires the recovered JSON tool-request root to be **byte-for-byte identical to the entire message**, while model-emitted payloads containing dense double-quote escape sequences, markdown backticks, or truncation can shift string boundaries, desynchronize brace matching, and violate that equality. Malformed outputs are never committed to chat history, which made byte-level forensics impossible and made the failures appear random.

## 2. Error Path (verified in source)

1. Model response text reaches process_tools() at /a0/agent.py line 1413.
2. It calls extract_tool_request() in /a0/helpers/extract_tools.py line 23.
3. The strict equality gate at lines 27-30:

~~~text
content = content.strip()
root = extract_json_root_string(content)
if root != content:
    return None
~~~

4. A ValueError from normalize_tool_request() (structural validation, agent.py line 1429) is also treated as misformat.
5. Either way, the warning prompt fw.msg_misformat.md is injected and the log line is emitted (agent.py lines 1511-1516).

A tool call is accepted only when DirtyJson recovers a JSON object that **exactly spans the whole message** and normalizes into a valid request.

## 3. Empirical Failure Matrix

Synthetic replicas of the failed payloads were replayed through the production parser with the framework runtime. Results:

| # | Payload pattern | Parsed | Verdict |
|---|---|---|---|
| P1 | Heredoc with literal backslash-K invalid escape | yes | tolerated |
| P2 | python3 -c body with escaped quote plus raw newlines | yes | tolerated |
| P3 | Multi-expression sed with backslash-newline continuations | yes | tolerated |
| P4 | Script write with escaped triple-quote docstring | yes | tolerated |
| P5 | Off-by-one quote escape, closing quote unescaped | yes | tolerated and recovered |
| P6 | Payload truncated at 70 percent, token-limit cutoff | no | hard fail |
| P7 | Any text after the final closing brace | no | hard fail |

Trailing whitespace or a single trailing newline is harmless because the parser strips the message first; only non-whitespace trailing content fails.

## 4. Root Cause

Three compounding factors:

1. **Strict byte-equality gate.** extract_tool_request() rejects anything where the recovered root differs from the full message. json_parse_dirty(), the lenient variant used elsewhere in the same module, would accept the same inputs, but the strict path does not.
2. **Dense escape sequences desynchronize recovery.** DirtyJson survives single malformations (P1 through P5 prove this). The real failed messages packed dense runs of escaped double quotes into one code or content value: CSS attribute selectors such as aria-pressed, Python docstrings, heredocs, and sed scripts. The root-start scanner also treats backticks as string delimiters inside braces, so markdown code fences inside a payload add the same hazard. A single miscounted escape or unpaired backtick shifts a string boundary; brace matching desynchronizes from that point on; the recovered root no longer equals the message, and the gate triggers the misformat path. Correlational evidence: every failed payload was dense with literal escaped-quote runs or backticks, while every equally large payload built with chr(34) and chr(92) construction succeeded, including the entire subsequent diagnostic session.
3. **No forensic trail.** Malformed responses are never committed to history (verified: the entry preceding the first warning is absent from chat.json), so the exact corrupt bytes could not be diffed. Only the warning survives, 23 occurrences in the branched chat, which made the failures look random and size-related when they were actually escape-desynchronization-related.

## 5. Fix Applied (agent-side, active)

Four behavior rules were persisted via behaviour_adjustment and are now part of the standing system prompt:

1. In tool_args string values (code, content, old_text, new_text), avoid literal double-quote escape sequences; prefer single-quoted strings in shell and Python code, and construct embedded quotes via chr(34) and chr(92) concatenation inside generated scripts.
2. Keep terminal code single-line; write long scripts to files in chunks instead of heredocs or multiline python3 -c commands.
3. Never emit any text after the closing brace of the JSON tool call.
4. On a misformat rejection, retry with a smaller payload containing no backslash-quote sequences.

Result: zero failures across the remainder of the session after adoption (verified: the full diagnostic session ran clean, including multiple large file writes).

## 6. Framework Hardening (APPLIED 2026-08-14)

json_parse_dirty() already returns the first valid root even when trailing text exists; the strict path rejected the identical case. The naive proposal (a bare startswith() check) was rejected during implementation because tests deliberately assert trailing-text rejection: test_tool_request_normalization.py line 129 and the streaming early-stop fixtures rely on strict snapshots so a mid-stream root plus trailing bytes does not stop early while a second tool call may still be streaming.

What was actually applied is a boundary-scoped variant:

- NEW helper extract_tool_request_final() in /a0/helpers/extract_tools.py - accepts a complete tool request followed by benign non-JSON trailing prose, but still rejects preamble text, concatenated additional roots, and any trailing text containing braces, brackets, or double quotes so those cases keep routing to repair.
- agent.py process_tools (line ~1419) now calls the final variant for completed messages. Streaming snapshots (agent.py line 450, models.py callbacks) keep the strict extract_tool_request boundary unchanged.

Effect: the trailing-junk failure class is eliminated at the execution boundary without weakening streaming early-stop or silently dropping concatenated tool calls. Files changed: helpers/extract_tools.py, helpers/extract_tools.py.dox.md, agent.py, tests/test_tool_request_normalization.py (new test test_extract_tool_request_final_tolerates_trailing_prose).

## 7. Minimal Reproducer

Save as repro_misformat.py and run with the framework runtime (/opt/venv-a0/bin/python):

~~~python
import sys
sys.path.insert(0, '/a0')
from helpers.extract_tools import extract_tool_request

Q = chr(34)   # double quote
NL = chr(10)  # newline

def msg(code):
    return ('{' + NL +
        '    ' + Q + 'tool_name' + Q + ': ' + Q + 'code_execution_tool' + Q + ',' + NL +
        '    ' + Q + 'tool_args' + Q + ': {' + Q + 'code' + Q + ': ' + Q + code + Q + '}' + NL +
        '}')

good = msg('echo ok')
junk = good + ' stray trailing text'
truncated = good[:int(len(good) * 0.7)]

for name, m in [('good', good), ('trailing_junk', junk), ('truncated', truncated)]:
    print(name, '->', extract_tool_request(m) is not None)
~~~

Expected output:

~~~text
good -> True
trailing_junk -> False
truncated -> False
~~~

## 8. Verification Summary

**Verified:** error path lines in source; strict equality gate behavior; failure matrix P1 through P7 via live parser runs; absence of malformed outputs in stored chat history; effectiveness of the behavior rules across the diagnostic session.

**Assumption (unprovable from stored data):** the exact byte-level corruption inside the historical failed payloads. Raw outputs are not persisted, so this rests on the correlation between dense escaped-quote or backtick usage and failure versus chr(34)-constructed success.

