import { isDeepStrictEqual } from 'node:util';

function incompatible(detail) {
  throw new Error(`Cannot consolidate Snyk SARIF: ${detail}`);
}

function mergeDescription(left, right, ruleId, key) {
  const description = { ...left };
  for (const [format, text] of Object.entries(right)) {
    if (!Object.hasOwn(description, format)) description[format] = text;
    else if (description[format] !== text) {
      if (!['text', 'markdown'].includes(format)) incompatible(`conflicting rule ${ruleId} ${key}.${format}`);
      description[format] = [description[format], text].filter(Boolean).join('\n\n');
    }
  }
  return description;
}

function mergeProperties(left, right, ruleId) {
  const properties = { ...left };
  for (const [name, property] of Object.entries(right)) {
    if (!Object.hasOwn(properties, name)) properties[name] = property;
    else if (!isDeepStrictEqual(properties[name], property)) {
      if (name === 'tags') properties[name] = [...new Set([...properties[name], ...property])];
      else incompatible(`conflicting rule ${ruleId} property ${name}`);
    }
  }
  return properties;
}

function mergeRuleValue(left, key, value) {
  if (['shortDescription', 'fullDescription', 'help'].includes(key)) {
    return mergeDescription(left[key], value, left.id, key);
  }
  if (key === 'properties') return mergeProperties(left.properties, value, left.id);
  incompatible(`conflicting rule ${left.id} ${key}`);
}

function mergeRule(left, right) {
  if (isDeepStrictEqual(left, right)) return left;
  const merged = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (!Object.hasOwn(left, key)) merged[key] = value;
    else if (!isDeepStrictEqual(left[key], value)) merged[key] = mergeRuleValue(left, key, value);
  }
  return merged;
}

function readRun(run, multipleRuns) {
  const { tool, results, automationDetails, ...runContext } = run;
  if (tool?.driver?.name !== 'Snyk Open Source' || !Array.isArray(tool.driver.rules)
      || !Array.isArray(results)) incompatible('expected Snyk Open Source rules and results');
  const { driver, ...toolContext } = tool;
  const { rules, properties = {}, ...otherDriver } = driver;
  if (multipleRuns && (run.invocations || tool.extensions?.length
      || rules.some((rule) => rule.relationships?.length))) {
    incompatible('unsupported run-local rule references outside results');
  }
  const { artifactsScanned, ...otherProperties } = properties;
  const driverContext = { ...otherDriver, properties: otherProperties };
  return { rules, results, artifactsScanned, context: { runContext, toolContext, driverContext } };
}

function mergeRules(runRules, rules, ruleIndexes) {
  return runRules.map((rule) => {
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
}

function remapRuleIndex(index, indexes) {
  if (index === -1) return index;
  if (!Number.isInteger(index) || index < 0 || index >= indexes.length) incompatible('invalid rule index');
  return indexes[index];
}

function remapResult(result, indexes, multipleRuns) {
  const merged = { ...result };
  if (Object.hasOwn(result, 'ruleIndex')) merged.ruleIndex = remapRuleIndex(result.ruleIndex, indexes);
  if (result.rule && (!result.rule.toolComponent || result.rule.toolComponent.index === -1)) {
    merged.rule = { ...result.rule };
    if (Object.hasOwn(result.rule, 'index')) merged.rule.index = remapRuleIndex(result.rule.index, indexes);
  } else if (result.rule?.toolComponent && multipleRuns) {
    incompatible('unsupported result rule toolComponent');
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
  let artifactsScanned = 0;
  let hasArtifactsScanned = false;
  const multipleRuns = sarif.runs.length > 1;
  for (const run of sarif.runs) {
    const parsed = readRun(run, multipleRuns);
    if (context !== undefined && !isDeepStrictEqual(context, parsed.context)) {
      // Differing artifacts, URI bases, extensions, etc. require their own
      // reference remapping. Never flatten them using the first run's values.
      incompatible('incompatible run or tool metadata');
    }
    context = parsed.context;
    const count = parsed.artifactsScanned;
    if (count !== undefined) {
      if (!Number.isFinite(count) || count < 0) incompatible('invalid artifactsScanned count');
      artifactsScanned += count;
      hasArtifactsScanned = true;
    }
    const indexes = mergeRules(parsed.rules, rules, ruleIndexes);
    for (const result of parsed.results) {
      results.push(remapResult(result, indexes, multipleRuns));
    }
  }
  const { runContext, toolContext, driverContext } = context;
  const properties = { ...driverContext.properties };
  if (hasArtifactsScanned) properties.artifactsScanned = artifactsScanned;
  return { ...sarif, runs: [{
    ...runContext,
    tool: { ...toolContext, driver: { ...driverContext, properties, rules } },
    automationDetails: { id: 'snyk-open-source/' },
    results,
  }] };
}
