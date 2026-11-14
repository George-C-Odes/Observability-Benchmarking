"""Synchronize native Maven and dashboard limits from the shared coverage policy."""

import argparse
import json
import re
from decimal import Decimal

from coverage_gate import CONFIG, ROOT, load_modules

ORCHESTRATOR_PATH = "utils/orchestrator"


def jacoco_check(module, indent):
    lines = Decimal(str(module["thresholds"]["lines"])) / 100
    branches = Decimal(str(module["thresholds"]["branches"])) / 100
    data_file = (
        "\n    <dataFile>${project.build.directory}/jacoco-quarkus.exec</dataFile>"
        if module["path"] == ORCHESTRATOR_PATH
        else ""
    )
    text = f"""<execution>
  <id>coverage-check</id>
  <phase>verify</phase>
  <goals>
    <goal>check</goal>
  </goals>
  <configuration>{data_file}
    <haltOnFailure>true</haltOnFailure>
    <rules>
      <rule>
        <element>BUNDLE</element>
        <limits>
          <limit>
            <counter>LINE</counter>
            <value>COVEREDRATIO</value>
            <minimum>{lines}</minimum>
          </limit>
          <limit>
            <counter>BRANCH</counter>
            <value>COVEREDRATIO</value>
            <minimum>{branches}</minimum>
          </limit>
        </limits>
      </rule>
    </rules>
  </configuration>
</execution>"""
    # Service POMs use four-space nesting; the orchestrator uses two.
    width = 2 if module["path"] == ORCHESTRATOR_PATH else 4
    if width == 2:
        text = text.replace("  <phase>verify</phase>\n", "").replace(
            "  </goals>\n", "  </goals>\n  <phase>verify</phase>\n"
        )
    return (
        "\n".join(
            indent
            + " " * ((len(line) - len(line.lstrip())) // 2 * width)
            + line.lstrip()
            for line in text.splitlines()
        )
        + "\n"
    )


def render_pom(source, module):
    match = re.search(
        r"<plugin>\s*<groupId>org.jacoco</groupId>(?:(?!</plugin>).)*</plugin>",
        source,
        re.DOTALL,
    )
    if not match:
        raise ValueError(f"Missing JaCoCo plugin: {module['path']}")
    plugin = match[0]
    plugin = re.sub(
        r"(?m)^[ \t]*<execution>\s*<id>coverage-check</id>(?:(?!</execution>).)*</execution>\n",
        "",
        plugin,
        flags=re.DOTALL,
    )
    end = re.search(r"(?m)^([ \t]*)</executions>", plugin)
    if not end:
        raise ValueError("Missing JaCoCo executions")
    indent = end[1] + ("  " if module["path"] == ORCHESTRATOR_PATH else "    ")
    plugin = (
        plugin[: end.start()] + jacoco_check(module, indent) + plugin[end.start() :]
    )
    return source[: match.start()] + plugin + source[match.end() :]


def synchronize(root=ROOT, config=CONFIG, check=False):
    changes = []
    modules = load_modules(config)
    for module in modules.values():
        if module["format"] != "java":
            continue
        path = root / module["path"] / "pom.xml"
        source = path.read_text(encoding="utf-8")
        rendered = render_pom(source, module)
        if source != rendered:
            changes.append((path, rendered))
    dashboard = root / modules["nextjs-dash"]["path"] / "coverage-policy.json"
    rendered = (
        json.dumps(
            {
                "_generated": (
                    "scripts/sync_coverage_thresholds.py; "
                    "edit scripts/coverage-thresholds.json"
                ),
                "thresholds": modules["nextjs-dash"]["thresholds"],
            },
            indent=2,
        )
        + "\n"
    )
    if not dashboard.is_file() or dashboard.read_text(encoding="utf-8") != rendered:
        changes.append((dashboard, rendered))
    # Validate every input before writing any POM.
    for path, rendered in changes:
        print(f"{'Outdated' if check else 'Updated'} coverage check: {path}")
        if not check:
            path.write_text(rendered, encoding="utf-8", newline="\n")
    return int(check and bool(changes))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    return synchronize(check=args.check)


if __name__ == "__main__":
    raise SystemExit(main())
