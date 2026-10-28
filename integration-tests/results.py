#!/usr/bin/env python3
"""Standard-library JSON validation and reporting for the Bash runner."""

import base64
import json
import math
import re
import sys
import uuid
from pathlib import Path


def check_payload(kind, payload, service, since, trace_id=""):
    if kind == "mimir":
        if payload.get("status") == "success":
            for series in payload.get("data", {}).get("result", []):
                if series.get("metric", {}).get("service_name") != service:
                    continue
                for timestamp, value in series.get("values", []):
                    if float(timestamp) >= float(since) and math.isfinite(float(value)):
                        return
        raise ValueError("no fresh metric samples for " + service)
    if kind == "loki":
        if payload.get("status") == "success":
            for stream in payload.get("data", {}).get("result", []):
                if stream.get("stream", {}).get("service_name") == service and any(
                    int(row[0]) >= int(since) * 10**9
                    for row in stream.get("values", [])
                ):
                    return
        raise ValueError("no fresh log entries for " + service)
    if kind == "tempo":
        # Tempo JSON has used both batches and resourceSpans envelopes.
        for batch in payload.get("batches", payload.get("resourceSpans", [])):
            attributes = batch.get("resource", {}).get("attributes", [])
            if not any(
                attr.get("key") == "service.name"
                and attr.get("value", {}).get("stringValue") == service
                for attr in attributes
            ):
                continue
            scopes = batch.get(
                "scopeSpans", batch.get("instrumentationLibrarySpans", [])
            )
            for scope in scopes:
                for span in scope.get("spans", []):
                    candidate = span.get("traceId", "")
                    if not re.fullmatch(r"[0-9a-fA-F]{32}", candidate):
                        candidate = base64.b64decode(candidate, validate=True).hex()
                    if (
                        candidate.lower() == trace_id
                        and int(span.get("startTimeUnixNano", 0)) >= int(since) * 10**9
                    ):
                        return
        raise ValueError("no matching fresh service span for trace " + trace_id)
    raise ValueError("unknown payload type: " + kind)


def check_wrk(output):
    requests = re.search(r"(?m)^\s*(\d+) requests in\s", output)
    if "Transfer/sec" not in output or not requests or int(requests[1]) == 0:
        raise ValueError("wrk2 did not complete any requests")
    non_success = re.search(r"Non-2xx or 3xx responses:\s*(\d+)", output)
    errors = re.search(
        r"Socket errors:\s*connect (\d+), read (\d+), write (\d+), timeout (\d+)",
        output,
    )
    if (non_success and int(non_success[1])) or (
        errors and any(int(n) for n in errors.groups())
    ):
        raise ValueError("wrk2 reported HTTP or socket errors")


def main():
    command, *args = sys.argv[1:]
    if command == "ids":
        print(uuid.uuid4().hex, uuid.uuid4().hex[:16])
    elif command == "record":
        label, group, service, status, duration, *attempts = args
        print(
            json.dumps(
                {
                    "name": label,
                    "group": group,
                    "service": service,
                    "status": status,
                    "duration_seconds": int(duration),
                    "attempts": int(attempts[0]) if attempts else 1,
                    "message": sys.stdin.read(),
                }
            )
        )
    elif command == "report":
        events, destination, started, exit_code, log_file, *configuration = args
        tests = [
            json.loads(line)
            for line in Path(events).read_text(encoding="utf-8").splitlines()
        ]
        result = {
            "started_at": started,
            "exit_code": int(exit_code),
            "log_file": log_file,
            "passed": sum(test["status"] == "passed" for test in tests),
            "failed": sum(test["status"] == "failed" for test in tests),
            "skipped": sum(test["status"] == "skipped" for test in tests),
            "tests": tests,
        }
        if configuration:
            result["configuration"] = json.loads(
                Path(configuration[0]).read_text(encoding="utf-8")
            )
        temporary = Path(destination + ".tmp")
        temporary.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        temporary.replace(destination)
    elif command == "wrk":
        check_wrk(sys.stdin.read())
    elif command == "configuration":
        print(json.dumps(dict(arg.split("=", 1) for arg in args)))
    elif command == "check":
        kind, service, since, *trace = args
        check_payload(kind, json.load(sys.stdin), service, since, *trace)
    else:
        raise ValueError("unknown command: " + command)


if __name__ == "__main__":
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    try:
        main()
    except (
        ValueError,
        TypeError,
        KeyError,
        IndexError,
        AttributeError,
        OSError,
    ) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
