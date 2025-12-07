#!/bin/bash
set -e

# ========================
# Default Configuration
# ========================
DEFAULT_HOST="quarkus-native"
DEFAULT_PORT=8080
DEFAULT_ENDPOINT="virtual"
DEFAULT_THREADS=4
DEFAULT_CONNECTIONS=200
DEFAULT_DURATION="30s"
DEFAULT_RATE=500
DEFAULT_SLEEP=10

HOST="${WRK_HOST:-$DEFAULT_HOST}"
PORT="${WRK_PORT:-$DEFAULT_PORT}"
ENDPOINT="${WRK_ENDPOINT:-$DEFAULT_ENDPOINT}"
THREADS="${WRK_THREADS:-$DEFAULT_THREADS}"
CONNECTIONS="${WRK_CONNECTIONS:-$DEFAULT_CONNECTIONS}"
DURATION="${WRK_DURATION:-$DEFAULT_DURATION}"
RATE="${WRK_RATE:-$DEFAULT_RATE}"
SLEEP_BETWEEN="${WRK_SLEEP_BETWEEN:-$DEFAULT_SLEEP}"

if [ -n "$1" ]; then HOST="$1"; fi
if [ -n "$2" ]; then PORT="$2"; fi
if [ -n "$3" ]; then ENDPOINT="$3"; fi
if [ -n "$4" ]; then THREADS="$4"; fi
if [ -n "$5" ]; then CONNECTIONS="$5"; fi
if [ -n "$6" ]; then DURATION="$6"; fi
if [ -n "$7" ]; then RATE="$7"; fi

# ========================
# Benchmark Folder Setup
# ========================
BASE_DIR="/usr/local/bin/benchmarks"
DATE_DIR="$(date +'%Y%m%d')"
BENCH_DIR="${BASE_DIR}/${DATE_DIR}"

mkdir -p "$BENCH_DIR"

# ========================
# Helper Function
# ========================
run_wrk() {
  local target_host=$1
  local target_ep=$2
  ts=$(date +"%H%M%S")
  outfile="${BENCH_DIR}/${ts}_${target_host}_${target_ep}_${THREADS}_${CONNECTIONS}_${DURATION}_${RATE}.log"
  echo
  echo "Running wrk2 with:"
  echo "  Host: $target_host"
  echo "  Endpoint: $target_ep"
  echo "  Threads: $THREADS"
  echo "  Connections: $CONNECTIONS"
  echo "  Duration: $DURATION"
  echo "  Rate: $RATE"
  echo "  Output: $outfile"
  /wrk2/wrk -t"$THREADS" -c"$CONNECTIONS" -d"$DURATION" -R"$RATE" --timeout 10s \
    http://"$target_host":"$PORT"/hello/"$target_ep" \
    2>&1 | tee "$outfile"
  echo "Benchmark complete. Results stored at $outfile"
  echo
}
#--timeout 10s
# ========================
# Run Benchmarks
# ========================
echo "Running wrk2 benchmarks..."
echo "  Target Host: $HOST"
echo "  Target Port: $PORT"
echo "  Endpoint:    $ENDPOINT"
echo "  Threads:     $THREADS"
echo "  Connections: $CONNECTIONS"
echo "  Duration:    $DURATION"
echo "  Rate:        $RATE"
echo "  Results Dir: $BENCH_DIR"
echo

# Special case: if HOST is 'combo' then run the 6-step sequence and ignore any provided ENDPOINT
if [ "$HOST" = "combo" ]; then
  # Ensure WRK_ENDPOINT is ignored and treated as combo
  ENDPOINT="combo"
  hosts=(
    "spring-jvm-tomcat-platform"
    "spring-jvm-tomcat-virtual"
    "spring-jvm-netty"
    "spring-native-tomcat-platform"
    "spring-native-tomcat-virtual"
    "spring-native-netty"
    "quarkus-jvm"
    "quarkus-jvm"
    "quarkus-jvm"
    "quarkus-native"
    "quarkus-native"
    "quarkus-native"
  )
  endpoints=(
    "platform"
    "virtual"
    "reactive"
    "platform"
    "virtual"
    "reactive"
    "platform"
    "virtual"
    "reactive"
    "platform"
    "virtual"
    "reactive"
  )
  for i in "${!hosts[@]}"; do
    h="${hosts[$i]}"
    ep="${endpoints[$i]}"
    echo "=== Running combo sequence: $h -> $ep ==="
    run_wrk "$h" "$ep"
    echo "Sleeping for $SLEEP_BETWEEN seconds before next benchmark..."
    sleep "$SLEEP_BETWEEN"
  done

# When ENDPOINT is 'combo' (and HOST is not 'combo')
elif [ "$ENDPOINT" = "combo" ]; then
  if [[ "$HOST" == spring-jvm* || "$HOST" == spring-native* ]]; then
      if [[ "$HOST" == spring-jvm* ]]; then
        combo_label="spring-jvm"
        hosts=(
          "spring-jvm-tomcat-platform"
          "spring-jvm-tomcat-virtual"
          "spring-jvm-netty"
        )
      else
        combo_label="spring-native"
        hosts=(
          "spring-native-tomcat-platform"
          "spring-native-tomcat-virtual"
          "spring-native-netty"
        )
      fi
      endpoints=(
        "platform"
        "virtual"
        "reactive"
      )
      for i in "${!hosts[@]}"; do
        h="${hosts[$i]}"
        ep="${endpoints[$i]}"
        echo "=== Running ${combo_label} benchmark: $h -> $ep ==="
        run_wrk "$h" "$ep"
        echo "Sleeping for $SLEEP_BETWEEN seconds before next benchmark..."
        sleep "$SLEEP_BETWEEN"
      done
    else
    # Normal combo behavior: same host, 3 endpoints
    for combo_ep in platform virtual reactive; do
      echo "=== Running combo benchmark for endpoint: $combo_ep ==="
      run_wrk "$HOST" "$combo_ep"
      echo "Sleeping for $SLEEP_BETWEEN seconds before next benchmark..."
      sleep "$SLEEP_BETWEEN"
    done
  fi
else
  # Single endpoint mode
  run_wrk "$HOST" "$ENDPOINT"
fi

echo "ALL DONE"
echo