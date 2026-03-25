#!/usr/bin/env python3
"""scripts/pages/inspect-qodana-artifacts.py

Parses the GitHub API artifacts response and prints availability flags
for the Qodana report artifacts expected by the Pages workflow.

Usage:
    python3 inspect-qodana-artifacts.py <response_json_file>

Prints to stdout (caller appends to $GITHUB_OUTPUT):
    services_java_present=true|false
    orchestrator_present=true|false
"""

import json
import sys


def main() -> None:
    with open(sys.argv[1], encoding="utf-8") as fh:
        data = json.load(fh)

    artifact_names = {
        artifact.get("name")
        for artifact in data.get("artifacts", [])
        if not artifact.get("expired", False)
    }

    print(
        "services_java_present="
        + ("true" if "qodana-report-services-java" in artifact_names else "false")
    )
    print(
        "orchestrator_present="
        + ("true" if "qodana-report-orchestrator" in artifact_names else "false")
    )


if __name__ == "__main__":
    main()
