import { isDeepStrictEqual } from 'node:util';

function incompatible(detail) {
  throw new Error(`Cannot consolidate Snyk SARIF: ${detail}`);
}

function mergeRule(left, right) {
  if (isDeepStrictEqual(left, right)) return left;
  const merged = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (!Object.hasOwn(left, key)) {
      merged[key] = value;
    } else if (!isDeepStrictEqual(left[key], value)) {
      if (['shortDescription', 'fullDescription', 'help'].includes(key)) {
        const description = { ...left[key] };
        for (const [format, text] of Object.entries(value)) {
          if (!Object.hasOwn(description, format)) description[format] = text;
          else if (description[format] !== text) {
            if (!['text', 'markdown'].includes(format)) incompatible(`conflicting rule ${left.id} ${key}.${format}`);
            description[format] = [description[format], text].filter(Boolean).join('\n\n');
          }
        }
        merged[key] = description;
      } else if (key === 'properties') {
        const properties = { ...left.properties };
        for (const [name, property] of Object.entries(value)) {
          if (!Object.hasOwn(properties, name)) properties[name] = property;
          else if (!isDeepStrictEqual(properties[name], property)) {
            if (name === 'tags') properties[name] = [...new Set([...properties[name], ...property])];
            else incompatible(`conflicting rule ${left.id} property ${name}`);
          }
        }
        merged.properties = properties;
      } else {
        incompatible(`conflicting rule ${left.id} ${key}`);
      }
    }
  }
  return merged;
}

// Snyk emits one run per dependency project. GitHub no longer combines runs
// sharing a category, and also limits uploads to 20 runs per file.
export function mergeSnykSarif(sarif) {
  if (sarif?.version !== '2.1.0' || !Array.isArray(sarif.runs) || sarif.runs.length === 0) {
    incompatible('expected a SARIF 2.1.0 report with at least one run');
  }
  const rules = [];
  const ruleIndexes = new Map();
  const results = [];
  let context;
  let toolContext;
  let driverContext;
  let artifactsScanned = 0;
  let hasArtifactsScanned = false;
  for (const run of sarif.runs) {
    const { tool, results: runResults, automationDetails, ...runContext } = run;
    if (tool?.driver?.name !== 'Snyk Open Source' || !Array.isArray(tool.driver.rules)
        || !Array.isArray(runResults)) incompatible('expected Snyk Open Source rules and results');
    const { driver, ...otherTool } = tool;
    const { rules: runRules, properties = {}, ...otherDriver } = driver;
    if (sarif.runs.length > 1 && (run.invocations || tool.extensions?.length
        || runRules.some((rule) => rule.relationships?.length))) {
      incompatible('unsupported run-local rule references outside results');
    }
    const { artifactsScanned: count, ...otherProperties } = properties;
    const metadata = { ...otherDriver, properties: otherProperties };
    if (context !== undefined && (!isDeepStrictEqual(context, runContext)
        || !isDeepStrictEqual(toolContext, otherTool) || !isDeepStrictEqual(driverContext, metadata))) {
      // Differing artifacts, URI bases, extensions, etc. require their own
      // reference remapping. Never flatten them using the first run's values.
      incompatible('incompatible run or tool metadata');
    }
    context = runContext;
    toolContext = otherTool;
    driverContext = metadata;
    if (count !== undefined) {
      if (!Number.isFinite(count) || count < 0) incompatible('invalid artifactsScanned count');
      artifactsScanned += count;
      hasArtifactsScanned = true;
    }
    const indexes = runRules.map((rule) => {
      if (typeof rule?.id !== 'string' || !rule.id) incompatible('missing rule id');
      if (!ruleIndexes.has(rule.id)) {
        ruleIndexes.set(rule.id, rules.length);
        rules.push(rule);
      } else {
        const index = ruleIndexes.get(rule.id);
        rules[index] = mergeRule(rules[index], rule);
      }
      return ruleIndexes.get(rule.id);
    });
    const remap = (index) => {
      if (index === -1) return index;
      if (!Number.isInteger(index) || index < 0 || index >= indexes.length) incompatible('invalid rule index');
      return indexes[index];
    };
    for (const result of runResults) {
      const merged = { ...result };
      if (Object.hasOwn(result, 'ruleIndex')) merged.ruleIndex = remap(result.ruleIndex);
      if (result.rule && (!result.rule.toolComponent || result.rule.toolComponent.index === -1)) {
        merged.rule = { ...result.rule };
        if (Object.hasOwn(result.rule, 'index')) merged.rule.index = remap(result.rule.index);
      } else if (result.rule?.toolComponent && sarif.runs.length > 1) {
        incompatible('unsupported result rule toolComponent');
      }
      results.push(merged);
    }
  }
  const properties = { ...driverContext.properties };
  if (hasArtifactsScanned) properties.artifactsScanned = artifactsScanned;
  return { ...sarif, runs: [{
    ...context,
    tool: { ...toolContext, driver: { ...driverContext, properties, rules } },
    automationDetails: { id: 'snyk-open-source/' },
    results,
  }] };
}
