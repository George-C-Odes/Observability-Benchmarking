"""Regression tests without a running stack: python -m unittest discover -s integration-tests -v."""

import base64
import importlib.util
import json
import os
import shlex
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("results", ROOT / "results.py")
RESULTS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RESULTS)


def find_bash():
    """Select a literal installation path, never execute environment/PATH input."""
    candidates = (
        ("C:/Program Files/Git/usr/bin/bash.exe",)
        if sys.platform == "win32"
        else ("/bin/bash", "/usr/bin/bash")
    )
    requested = os.environ.get("BASH_TEST_BINARY")
    if requested and requested not in candidates:
        raise ValueError("BASH_TEST_BINARY must be one of: " + ", ".join(candidates))
    for candidate in candidates:
        if (not requested or requested == candidate) and Path(candidate).is_file():
            # Return the allowlist entry, not the environment-derived value.
            return candidate
    return None


class PayloadTests(unittest.TestCase):
    def test_metric_names_can_differ_with_identical_other_labels(self):
        payload = {
            "status": "success",
            "data": {
                "resultType": "matrix",
                "result": [
                    {
                        "metric": {"__name__": "count_a", "service_name": "go"},
                        "values": [[99, "2"]],
                    },
                    {
                        "metric": {"__name__": "count_b", "service_name": "go"},
                        "values": [[99, "NaN"], [101, "3"]],
                    },
                ],
            },
        }
        RESULTS.check_payload("mimir", payload, "go", 100)
        with self.assertRaises(ValueError):
            RESULTS.check_payload("mimir", payload, "go", 102)

    def test_instant_query_evaluation_time_is_not_sample_freshness(self):
        payload = {
            "status": "success",
            "data": {
                "result": [
                    {"metric": {"service_name": "go"}, "value": [101, "3"]},
                ]
            },
        }
        with self.assertRaises(ValueError):
            RESULTS.check_payload("mimir", payload, "go", 100)

    def test_metrics_require_service_freshness_and_finite_value(self):
        for service, timestamp, value, passes in [
            ("go", 100, "2", True),
            ("other", 100, "2", False),
            ("go", 99, "2", False),
            ("go", 100, "NaN", False),
        ]:
            with self.subTest(service=service, timestamp=timestamp, value=value):
                payload = {
                    "status": "success",
                    "data": {
                        "result": [
                            {
                                "metric": {"service_name": service},
                                "values": [[timestamp, value]],
                            },
                        ]
                    },
                }
                if passes:
                    RESULTS.check_payload("mimir", payload, "go", 100)
                else:
                    with self.assertRaises(ValueError):
                        RESULTS.check_payload("mimir", payload, "go", 100)

    def test_logs_require_fresh_service_entries(self):
        payload = {
            "status": "success",
            "data": {
                "result": [
                    {
                        "stream": {"service_name": "go"},
                        "values": [[str(100 * 10**9), "goroutine"]],
                    },
                ]
            },
        }
        RESULTS.check_payload("loki", payload, "go", 100)
        for service, since in [("other", 100), ("go", 101)]:
            with self.assertRaises(ValueError):
                RESULTS.check_payload("loki", payload, service, since)

    def test_trace_requires_exact_id_service_and_fresh_span(self):
        trace = "ab" * 16
        for envelope in ["batches", "resourceSpans"]:
            for encoded_id in [trace, base64.b64encode(bytes.fromhex(trace)).decode()]:
                span = {"traceId": encoded_id, "startTimeUnixNano": str(100 * 10**9)}
                payload = {
                    envelope: [
                        {
                            "resource": {
                                "attributes": [
                                    {
                                        "key": "service.name",
                                        "value": {"stringValue": "go"},
                                    }
                                ]
                            },
                            "scopeSpans": [{"spans": [span]}],
                        }
                    ]
                }
                RESULTS.check_payload("tempo", payload, "go", 100, trace)
                for service, since, wanted in [
                    ("other", 100, trace),
                    ("go", 101, trace),
                    ("go", 100, "cd" * 16),
                ]:
                    with self.assertRaises(ValueError):
                        RESULTS.check_payload("tempo", payload, service, since, wanted)

    def test_empty_or_error_payloads_fail(self):
        for backend in ["mimir", "loki", "tempo"]:
            for payload in [
                {},
                {"status": "error"},
                {"status": "success", "data": {"result": []}},
            ]:
                with (
                    self.subTest(backend=backend, payload=payload),
                    self.assertRaises(ValueError),
                ):
                    RESULTS.check_payload(backend, payload, "go", 100)

    def test_wrk_requires_requests_and_no_errors(self):
        good = "  20 requests in 3.00s, 1KB read\nTransfer/sec: 100B\n"
        RESULTS.check_wrk(good)
        RESULTS.check_wrk(
            good + "Socket errors: connect 0, read 0, write 0, timeout 0\n"
        )
        for output in [
            "Transfer/sec: 0B\n",
            good.replace("20 requests", "0 requests"),
            good + "Non-2xx or 3xx responses: 20\n",
            good + "Socket errors: connect 0, read 1, write 0, timeout 0\n",
        ]:
            with self.subTest(output=output), self.assertRaises(ValueError):
                RESULTS.check_wrk(output)

    def test_report_round_trips_diagnostics_and_exit_status(self):
        with tempfile.TemporaryDirectory() as directory:
            events = Path(directory) / "events.jsonl"
            report = Path(directory) / "report.json"
            message = 'quote " backslash \\ newline\ncontrol\t Unicode: λ'
            rows = []
            for status in ["passed", "failed", "skipped"]:
                result = subprocess.run(
                    [
                        sys.executable,
                        str(ROOT / "results.py"),
                        "record",
                        "test",
                        "logs",
                        "go",
                        status,
                        "1",
                    ],
                    input=message,
                    text=True,
                    capture_output=True,
                    check=True,
                    encoding="utf-8",
                )
                rows.append(result.stdout)
            events.write_text("".join(rows), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "results.py"),
                    "report",
                    str(events),
                    str(report),
                    "start",
                    "143",
                    "log",
                ],
                check=True,
            )
            payload = json.loads(report.read_text(encoding="utf-8"))
            self.assertEqual(
                (payload["passed"], payload["failed"], payload["skipped"]), (1, 1, 1)
            )
            self.assertEqual(payload["exit_code"], 143)
            self.assertEqual(payload["tests"][1]["message"], message)


class BashSelectionTests(unittest.TestCase):
    def test_defaults_use_fixed_platform_paths(self):
        for platform, expected in [
            ("win32", "C:/Program Files/Git/usr/bin/bash.exe"),
            ("linux", "/bin/bash"),
            ("darwin", "/bin/bash"),
        ]:
            with (
                self.subTest(platform=platform),
                mock.patch.object(sys, "platform", platform),
                mock.patch.dict(os.environ, {"PATH": "/untrusted"}, clear=True),
                mock.patch.object(Path, "is_file", return_value=True),
            ):
                self.assertEqual(find_bash(), expected)

    def test_unix_fallback_uses_second_fixed_path(self):
        with (
            mock.patch.object(sys, "platform", "linux"),
            mock.patch.dict(os.environ, {}, clear=True),
            mock.patch.object(Path, "is_file", side_effect=[False, True]),
        ):
            self.assertEqual(find_bash(), "/usr/bin/bash")

    def test_allowlisted_override_selects_literal_entry(self):
        with (
            mock.patch.object(sys, "platform", "linux"),
            mock.patch.dict(os.environ, {"BASH_TEST_BINARY": "/usr/bin/bash"}),
            mock.patch.object(Path, "is_file", return_value=True),
        ):
            self.assertEqual(find_bash(), "/usr/bin/bash")

    def test_untrusted_overrides_are_rejected_before_launch(self):
        for requested in [
            "bash",
            "/tmp/bash",
            "/bin/bash -c command",
            "/bin/bash; command",
            "/bin/../tmp/bash",
            "C:/untrusted/bash.exe",
        ]:
            with (
                self.subTest(requested=requested),
                mock.patch.dict(os.environ, {"BASH_TEST_BINARY": requested}),
                mock.patch.object(Path, "is_file", return_value=True) as is_file,
                mock.patch.object(subprocess, "run") as run,
                self.assertRaisesRegex(ValueError, "BASH_TEST_BINARY must be one of"),
            ):
                try:
                    BashTests.setUpClass()
                finally:
                    is_file.assert_not_called()
                    run.assert_not_called()

    def test_missing_bash_does_not_fall_back_to_path(self):
        with (
            mock.patch.dict(os.environ, {}, clear=True),
            mock.patch.object(Path, "is_file", return_value=False),
        ):
            self.assertIsNone(find_bash())

    def test_missing_override_does_not_select_another_installation(self):
        with (
            mock.patch.object(sys, "platform", "linux"),
            mock.patch.dict(os.environ, {"BASH_TEST_BINARY": "/usr/bin/bash"}),
            mock.patch.object(Path, "is_file", return_value=False),
        ):
            self.assertIsNone(find_bash())


class BashTests(unittest.TestCase):
    # unittest discovers this lifecycle hook by its exact name.
    # noinspection PyPep8Naming
    @classmethod
    def setUpClass(cls):
        cls.bash = find_bash()
        if not cls.bash:
            raise unittest.SkipTest("Bash is unavailable")
        cls.functions = (
            f"source {shlex.quote((ROOT / 'run-integration-tests.sh').as_posix())}\n"
        )

    def shell(self, body, expected=0, real_records=False):
        with tempfile.TemporaryDirectory() as directory:
            # Git Bash recognizes C:/ paths; Linux uses the native absolute path.
            prelude = "\n".join(
                [
                    "export LC_ALL=C PATH=/usr/bin:/bin:$PATH",
                    "REQUEST_TIMEOUT=2 CONNECT_TIMEOUT=2 DOCKER_TIMEOUT=10 LOG_TIMEOUT=1 POLL_INTERVAL=0.01",
                    "TESTS_PASSED=0 TESTS_FAILED=0 TESTS_SKIPPED=0 CONTENT=GO",
                    "DOCKER_AVAILABLE=true DOCKER_ERROR='' FAIL_REASON='' BLUE='' NC=''",
                    f"TEMP_DIR={shlex.quote(Path(directory).as_posix())}",
                    f"SCRIPT_DIR={shlex.quote(ROOT.as_posix())}",
                    f"PYTHON={shlex.quote(Path(sys.executable).as_posix())}",
                    'EVENTS_FILE="$TEMP_DIR/events.jsonl"',
                    'OUTPUT_DIR="$TEMP_DIR/output"',
                    "" if real_records else "record_result() { :; }",
                ]
            )
            completed = subprocess.run(
                [self.bash, "--noprofile", "--norc", "-s"],
                check=False,
                input=self.functions + prelude + "\n" + body + "\n",
                text=True,
                capture_output=True,
                timeout=45,
                encoding="utf-8",
            )
            self.assertEqual(
                completed.returncode, expected, completed.stdout + completed.stderr
            )
            completed.reports = [
                json.loads(path.read_text(encoding="utf-8"))
                for path in Path(directory).glob("output/*.json")
            ]
        return completed

    def test_temporary_path_with_apostrophe_is_literal(self):
        temporary_directory = tempfile.TemporaryDirectory
        with mock.patch.object(
            tempfile,
            "TemporaryDirectory",
            side_effect=lambda: temporary_directory(prefix="shell's path "),
        ):
            self.shell('[[ $TEMP_DIR == *"shell\'s path "* ]]')

    def test_fallback_is_one_pass_without_failures(self):
        self.shell("""
curl() { if [[ ${*: -1} == */metrics ]]; then printf 404; else printf 200; fi; }
run_test fallback health go probe_any_health http://mock 200 '/metrics;/ready'
[[ $TESTS_PASSED == 1 && $TESTS_FAILED == 0 && $LAST_TEST_OK == true && -z $FAIL_REASON ]]
""")

    def test_unexpected_nonzero_is_counted_and_suite_continues(self):
        self.shell("""
run_test broken health go false
run_test working health go true
[[ $TESTS_PASSED == 1 && $TESTS_FAILED == 1 ]]
""")

    def test_curl_failure_preserves_diagnostics(self):
        self.shell("""
curl() { printf 'Connection refused' >&2; printf 000; return 7; }
if http_probe http://mock 200 ''; then exit 9; fi
[[ $FAIL_REASON == *'curl exit 7'* && $FAIL_REASON == *'Connection refused'* ]]
""")

    def test_content_is_literal_and_204_is_accepted(self):
        self.shell("""
curl() { printf 204; }
http_probe http://mock 200,204 ''
curl() { printf 'a.b' > "$TEMP_DIR/body"; printf 200; }
http_probe http://mock 200 'a.b'
if http_probe http://mock 200 'a.*b'; then exit 9; fi
""")

    def test_failed_request_cannot_pass_with_stale_logs(self):
        self.shell("""
docker_capture() { DOCKER_OUTPUT='2026-10-25T00:00:00.123456789Z'; }
curl() { return 7; }
probe_log() { exit 9; }
run_test request logs go test_runtime_log http://mock go goroutine
[[ $TESTS_FAILED == 1 && $TESTS_PASSED == 0 ]]
""")

    def test_log_poll_uses_boundary_and_one_capture(self):
        self.shell("""
captures=0
docker_capture() {
    captures=$((captures + 1))
    [[ $* == 'logs --since boundary --tail 200 go' ]]
    DOCKER_OUTPUT='normal stderr: goroutine thread'
}
probe_log go boundary goroutine
[[ $captures == 1 && -z $FAIL_REASON ]]
""")

    def test_docker_error_and_timeout_are_preserved(self):
        self.shell("""
timeout() { printf 'permission denied'; return 124; }
if docker_capture logs --since boundary go; then exit 9; fi
[[ $FAIL_REASON == *'exit 124'* && $FAIL_REASON == *'permission denied'* ]]
""")

    def test_docker_budget_is_independent_of_http_budget(self):
        self.shell("""
timeout() { printf '%s' "$*" > "$TEMP_DIR/timeout-args"; }
PROBE_TIMEOUT=1 POLL_DEADLINE=$((SECONDS + 20))
docker_capture version --format server
[[ $(<"$TEMP_DIR/timeout-args") == *'10s docker version'* ]]
""")

    def test_wsl_missing_socket_selects_local_windows_desktop(self):
        self.shell("""
DOCKER_AVAILABLE=false WSL_DISTRO_NAME=Ubuntu DOCKER_CLI=docker DOCKER_BIN='' DOCKER_HOST='' DOCKER_CONTEXT=''
command() { if [[ $* == '-v docker.exe' ]]; then printf '/windows path/docker.exe'; else builtin command "$@"; fi; }
docker_capture() {
    if [[ $DOCKER_CLI == docker ]]; then
        FAIL_REASON='dial unix:///var/run/docker.sock: no such file or directory'; return 1
    fi
    if [[ $1 == context ]]; then DOCKER_OUTPUT='npipe:////./pipe/dockerDesktopLinuxEngine'
    else
        [[ $DOCKER_FALLBACK_CONTEXT == desktop-linux ]] || return 9
        DOCKER_OUTPUT=29.9.2
    fi
}
probe_docker
[[ $DOCKER_AVAILABLE == true && $DOCKER_CLI == '/windows path/docker.exe' && $DOCKER_FALLBACK_CONTEXT == desktop-linux ]]
""")

    def test_wsl_fallback_respects_explicit_connection_choices(self):
        for setting in [
            "DOCKER_BIN=docker",
            "DOCKER_HOST=unix:///custom.sock",
            "DOCKER_CONTEXT=remote",
        ]:
            with self.subTest(setting=setting):
                self.shell(f"""
DOCKER_AVAILABLE=false WSL_DISTRO_NAME=Ubuntu DOCKER_CLI=docker DOCKER_BIN='' DOCKER_HOST='' DOCKER_CONTEXT=''
{setting}
docker_capture() {{ FAIL_REASON='unix:///var/run/docker.sock: no such file or directory'; return 1; }}
if probe_docker; then exit 9; fi
[[ $DOCKER_CLI == docker && $DOCKER_AVAILABLE == false ]]
""")

    def test_wsl_fallback_rejects_remote_windows_context(self):
        self.shell("""
DOCKER_AVAILABLE=false WSL_DISTRO_NAME=Ubuntu DOCKER_CLI=docker DOCKER_BIN='' DOCKER_HOST='' DOCKER_CONTEXT=''
command() { if [[ $* == '-v docker.exe' ]]; then printf docker.exe; else builtin command "$@"; fi; }
docker_capture() {
    if [[ $DOCKER_CLI == docker ]]; then FAIL_REASON='unix:///var/run/docker.sock: no such file or directory'; return 1; fi
    [[ $1 == context ]] || return 9
    DOCKER_OUTPUT='ssh://remote-engine'
}
if probe_docker; then exit 9; fi
[[ $DOCKER_CLI == docker && -z $DOCKER_FALLBACK_CONTEXT && $FAIL_REASON == *'not a local named pipe'* ]]
""")

    def test_wsl_without_windows_cli_explains_integration_fix(self):
        self.shell("""
DOCKER_AVAILABLE=false WSL_DISTRO_NAME=Ubuntu DOCKER_CLI=docker DOCKER_BIN='' DOCKER_HOST='' DOCKER_CONTEXT=''
command() { if [[ $* == '-v docker.exe' ]]; then return 1; else builtin command "$@"; fi; }
docker_capture() { FAIL_REASON='unix:///var/run/docker.sock: no such file or directory'; return 1; }
if probe_docker; then exit 9; fi
[[ $PROBE_FATAL == true && $FAIL_REASON == *'WSL Integration for Ubuntu'* ]]
""")

    def test_windows_client_context_and_crlf_are_handled(self):
        self.shell("""
DOCKER_CLI='/windows path/docker.exe' DOCKER_FALLBACK_CONTEXT=desktop-linux
timeout() {
    [[ $3 == '/windows path/docker.exe' && $4 == --context && $5 == desktop-linux ]] || return 9
    printf '2026-10-28T00:00:00Z\\r\\n'
}
docker_capture info --format '{{.SystemTime}}'
[[ $DOCKER_OUTPUT == 2026-10-28T00:00:00Z ]]
""")

    def test_permanent_query_errors_fail_without_retries(self):
        self.shell("""
curl() { printf 422; }
run_test invalid telemetry go poll_until 90 http_probe http://mock 200 ''
[[ $TEST_ATTEMPTS == 1 && $FAIL_REASON == 'Non-retryable failure:'* && $TESTS_FAILED == 1 ]]
""")

    def test_all_telemetry_requests_are_seeded_before_polling(self):
        self.shell("""
mapfile -t SERVICES < "$SCRIPT_DIR/services.txt"
SERVICE_FILTER=go,django-platform GROUP_FILTER=telemetry seed_count=0 STARTUP_TIMEOUT=2 TELEMETRY_TIMEOUT=2
probe_any_health() { return 0; }
seed_telemetry() { seed_count=$((seed_count + 1)); TRACE_ID=$seed_count; TELEMETRY_SINCE=100; }
probe_telemetry() {
    [[ $seed_count == 2 ]] || return 9
    if [[ $2 == go ]]; then [[ $4 == 1 ]]; else [[ $4 == 2 ]]; fi
}
run_services
[[ $TESTS_PASSED == 10 && $TESTS_FAILED == 0 ]]
""")

    def test_delayed_log_is_polled(self):
        self.shell("""
attempts=0
docker_capture() {
    attempts=$((attempts + 1)); DOCKER_OUTPUT='unrelated background message'
    if ((attempts > 1)); then DOCKER_OUTPUT='goroutine thread'; fi
}
poll_until 2 probe_log go boundary goroutine
[[ $attempts == 2 ]]
""")

    def test_slow_first_health_path_does_not_starve_fallback(self):
        self.shell("""
REQUEST_TIMEOUT=1
curl() {
    if [[ ${*: -1} == */metrics ]]; then sleep 1; return 28; fi
    printf 200
}
run_test fallback health go poll_until 4 probe_any_health http://mock 200 '/metrics;/ready'
[[ $TESTS_PASSED == 1 && $TESTS_FAILED == 0 ]]
""")

    def test_poll_sleep_is_capped_by_deadline(self):
        self.shell("""
POLL_INTERVAL=60
started=$SECONDS
if poll_until 1 false; then exit 9; fi
((SECONDS - started <= 2))
""")

    def test_exact_filters_and_invalid_options(self):
        self.shell("""
SERVICE_FILTER=go,quarkus-jvm GROUP_FILTER=logs
service_selected go
if service_selected go-simple; then exit 9; fi
if group_selected telemetry; then exit 9; fi
""")
        self.shell("main --groups invalid", expected=2)
        self.shell("main --services unknown", expected=2)
        self.shell("main --groups logs,", expected=2)
        self.shell("main --services", expected=2)

    def test_service_table_covers_all_benchmark_endpoints(self):
        rows = [
            line.split("|")
            for line in (ROOT / "services.txt").read_text().splitlines()
            if line and not line.startswith("#")
        ]
        targets = (ROOT.parent / "config/benchmark-targets.txt").read_text(
            encoding="utf-8"
        )
        # Compare local Compose HTTP targets; these URL strings are never fetched.
        # noinspection HttpUrlsUsage
        actual = {
            f"http://{row[0]}:8080{spec.split('~')[0]}"
            for row in rows
            for spec in row[6].split(";")
            if spec.startswith("/hello/")
        }
        # noinspection HttpUrlsUsage
        expected = {line for line in targets.splitlines() if line.startswith("http://")}
        self.assertEqual(actual, expected)
        self.assertEqual(len(rows), 25)

    def test_main_filters_services_and_writes_report(self):
        result = self.shell(
            """
curl() {
    [[ ${*: -1} == http://localhost:9080/* ]] || return 9
    printf 'Hello from GO' > "$TEMP_DIR/body"; printf 200
}
main --services go --groups deployment
""",
            real_records=True,
        )
        self.assertEqual(len(result.reports), 1)
        report = result.reports[0]
        self.assertEqual(
            (
                report["passed"],
                report["failed"],
                report["skipped"],
                report["exit_code"],
            ),
            (2, 0, 0, 0),
        )
        self.assertEqual({test["service"] for test in report["tests"]}, {"go"})
        self.assertEqual(report["configuration"]["DOCKER_TIMEOUT"], "10")
        self.assertTrue(all(test["attempts"] >= 1 for test in report["tests"]))

    def test_one_docker_failure_skips_dependent_checks(self):
        result = self.shell(
            """
curl() { printf GO > "$TEMP_DIR/body"; printf 200; }
probe_docker() { FAIL_REASON='permission denied'; PROBE_FATAL=true; return 1; }
main --services go --groups logs,wrk2
""",
            expected=1,
            real_records=True,
        )
        report = result.reports[0]
        self.assertEqual(
            (report["passed"], report["failed"], report["skipped"]), (2, 1, 2)
        )
        failures = [test for test in report["tests"] if test["status"] == "failed"]
        self.assertEqual(failures[0]["group"], "preflight")
        self.assertEqual(failures[0]["attempts"], 1)
        self.assertTrue(
            all(
                test["attempts"] == 0
                for test in report["tests"]
                if test["status"] == "skipped"
            )
        )

    def test_wrk_timeout_cannot_be_shorter_than_workload(self):
        self.shell("DOCKER_TIMEOUT=2; main --groups wrk2", expected=2)

    def test_main_failure_reports_skipped_dependents(self):
        result = self.shell(
            """
STARTUP_TIMEOUT=1
curl() { printf 'connection refused' >&2; return 7; }
main --services go --groups deployment,telemetry
""",
            expected=1,
            real_records=True,
        )
        report = result.reports[0]
        self.assertEqual(
            (
                report["passed"],
                report["failed"],
                report["skipped"],
                report["exit_code"],
            ),
            (0, 1, 5, 1),
        )

    def test_main_interruption_still_writes_report(self):
        result = self.shell(
            """
run_services() { kill -TERM $$; }
main --services go --groups health
""",
            expected=143,
            real_records=True,
        )
        self.assertEqual(result.reports[0]["exit_code"], 143)

    def test_logging_failure_is_reflected_in_report_and_exit_code(self):
        result = self.shell(
            """
curl() { printf 'GO' > "$TEMP_DIR/body"; printf 200; }
tee() { cat > /dev/null; return 1; }
main --services go --groups deployment
""",
            expected=2,
            real_records=True,
        )
        self.assertEqual(result.reports[0]["exit_code"], 2)

    def test_all_groups_with_mocked_stack(self):
        result = self.shell(
            """
curl() {
    local url=${*: -1} body='GO'
    case $url in
        */prometheus/api/v1/query)
            [[ $* != *'timestamp('* && $* == *'query={service_name='* && $* == *'X-Scope-OrgID: anonymous'* ]] || return 9
            body='{"status":"success","data":{"result":[{"metric":{"service_name":"go"},"values":[['"$TELEMETRY_SINCE"',"1"]]}]}}'
            ;;
        */loki/api/v1/query_range)
            [[ $* == *'start='* && $* == *'goroutine'* ]] || return 9
            body='{"status":"success","data":{"result":[{"stream":{"service_name":"go"},"values":[["'"$TELEMETRY_SINCE"'000000000","goroutine"]]}]}}'
            ;;
        */api/traces/*)
            [[ $url == */"$TRACE_ID" ]] || return 9
            body='{"batches":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"go"}}]},"scopeSpans":[{"spans":[{"traceId":"'"$TRACE_ID"'","startTimeUnixNano":"'"$TELEMETRY_SINCE"'000000000"}]}]}]}'
            ;;
    esac
    printf '%s' "$body" > "$TEMP_DIR/body"; printf 200
}
docker_capture() {
    case $1 in
        version|info)
            if [[ $* == *SystemTime* ]]; then DOCKER_OUTPUT='2026-10-25T00:00:00.123456789Z'
            else DOCKER_OUTPUT=mock; fi
            ;;
        logs) [[ $* == *'--since 2026-10-25T'* ]] || return 9; DOCKER_OUTPUT='goroutine thread' ;;
        exec) DOCKER_OUTPUT=$'20 requests in 3.00s, 1KB read\\nTransfer/sec: 100B' ;;
    esac
}
main --services go
""",
            real_records=True,
        )
        report = result.reports[0]
        self.assertEqual(
            (report["passed"], report["failed"], report["skipped"]), (19, 0, 0)
        )
        self.assertEqual(
            {test["group"] for test in report["tests"]},
            {"stack", "health", "deployment", "logs", "telemetry", "wrk2", "preflight"},
        )


if __name__ == "__main__":
    unittest.main()
