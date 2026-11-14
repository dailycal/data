/**
 * Checks public/_redirects the way Cloudflare reads it when it deploys, so the build fails instead
 * of the deploy (or a deploy that silently drops rules). A copy of `parseRedirects` in
 * cloudflare/workers-sdk (packages/workers-shared/utils/configuration/parseRedirects.ts), with its
 * limits, minus what it returns.
 *
 * Cloudflare allows 2,000 static and 100 dynamic rules, but every rule after the first dynamic one
 * (a `*` or `:placeholder` in its source) counts as dynamic, static or not. So dynamic rules go at
 * the end of the file.
 */
import { readFileSync } from "node:fs";

// From workers-shared/utils/configuration/constants.ts
const MAX_STATIC_RULES = 2000;
const MAX_DYNAMIC_RULES = 100;
const MAX_LINE_LENGTH = 2000;
const PERMITTED_STATUS_CODES = new Set([200, 301, 302, 303, 307, 308]);
const SPLAT_REGEX = /\*/;
const PLACEHOLDER_REGEX = /:[A-Za-z]\w*/;

// From workers-shared/utils/configuration/validateURL.ts
const URL_REGEX = /^https:\/\/+(?<host>[^/]+)\/?(?<path>.*)/;
const HOST_WITH_PORT_REGEX = /.*:\d+$/;

function extractPathname(path, includeSearch, includeHash) {
  if (!path.startsWith("/")) path = `/${path}`;
  const url = new URL(`//${path}`, "relative://");
  return `${url.pathname}${includeSearch ? url.search : ""}${includeHash ? url.hash : ""}`;
}

/** [url] if it's valid, or [undefined, why not]. */
function validateUrl(token, onlyRelative, disallowPorts, includeSearch, includeHash) {
  const host = URL_REGEX.exec(token)?.groups?.host;
  if (host) {
    if (onlyRelative) return [undefined, `Only relative URLs are allowed. Got ${token}.`];
    if (disallowPorts && HOST_WITH_PORT_REGEX.test(host)) {
      return [undefined, `Specifying ports is not supported. Got ${token}.`];
    }
    const path = URL_REGEX.exec(token).groups.path;
    return [`https://${host}${extractPathname(path, includeSearch, includeHash)}`];
  }
  if (!token.startsWith("/") && onlyRelative) token = `/${token}`;
  if (token.startsWith("/")) {
    try {
      return [extractPathname(token, includeSearch, includeHash)];
    } catch {
      return [undefined, `Error parsing URL segment ${token}.`];
    }
  }
  return [
    undefined,
    onlyRelative
      ? "URLs should begin with a forward-slash."
      : 'URLs should either be relative (begin with a forward-slash) or use HTTPS (begin with "https://").',
  ];
}

const hasHost = (url) => Boolean(URL_REGEX.exec(url)?.groups?.host);

/**
 * Every line of a _redirects file that Cloudflare would ignore or that would stop it reading the
 * rest, as messages starting with the line number. Empty if it's all good.
 */
export function checkRedirects(text) {
  const lines = text.split("\n");
  const problems = [];
  const seen = new Set();
  let staticRules = 0;
  let dynamicRules = 0;
  let firstDynamicLine;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const at = `line ${i + 1}`;
    if (line.length === 0 || line.startsWith("#")) continue;

    if (line.length > MAX_LINE_LENGTH) {
      problems.push(`${at}: longer than ${MAX_LINE_LENGTH} characters.`);
      continue;
    }

    // Strips a comment after the rule, but not a URL's #fragment
    const tokens = line.replace(/\s+#.*$/, "").split(/\s+/);
    if (tokens.length < 2 || tokens.length > 3) {
      problems.push(`${at}: expected a source, a destination and a status, got "${line}".`);
      continue;
    }
    const [rawFrom, rawTo, rawStatus = "302"] = tokens;

    const [from, fromProblem] = validateUrl(rawFrom, true, true, false, false);
    if (from === undefined) {
      problems.push(`${at}: ${fromProblem}`);
      continue;
    }

    if (
      firstDynamicLine === undefined &&
      !SPLAT_REGEX.test(from) &&
      !PLACEHOLDER_REGEX.test(from)
    ) {
      staticRules += 1;
      if (staticRules > MAX_STATIC_RULES) {
        problems.push(`${at}: more than ${MAX_STATIC_RULES} static rules; Cloudflare skips it.`);
        continue;
      }
    } else {
      firstDynamicLine ??= i + 1;
      dynamicRules += 1;
      if (dynamicRules > MAX_DYNAMIC_RULES) {
        problems.push(
          `${at}: more than ${MAX_DYNAMIC_RULES} dynamic rules; Cloudflare skips the rest of the file. ` +
            `Every rule after the first dynamic one (line ${firstDynamicLine}) counts as dynamic, ` +
            `so move dynamic rules (with * or :placeholder) to the end.`,
        );
        break;
      }
    }

    const [to, toProblem] = validateUrl(rawTo, false, false, true, true);
    if (to === undefined) {
      problems.push(`${at}: ${toProblem}`);
      continue;
    }

    const status = Number(rawStatus);
    if (!PERMITTED_STATUS_CODES.has(status)) {
      problems.push(`${at}: status must be 200, 301, 302, 303, 307 or 308, got ${rawStatus}.`);
      continue;
    }

    // Loops: the site strips .html and /index, then this rule matches again (wrangler.jsonc's
    // html_handling isn't "none", so `/ /index` loops too)
    if (
      !hasHost(to) &&
      /\/index(\.html)?$/.test(to) &&
      (from.endsWith("/*") || from.endsWith("/"))
    ) {
      problems.push(`${at}: redirects to /index, which loops; Cloudflare ignores it.`);
      continue;
    }

    if (seen.has(from)) {
      problems.push(`${at}: a second rule for ${from}; Cloudflare ignores it.`);
      continue;
    }
    seen.add(from);

    if (status === 200 && hasHost(to)) {
      problems.push(`${at}: a 200 (proxy) rule can only point to a relative path, got ${to}.`);
    }
  }
  return problems;
}

/** Throws, listing every problem, if Cloudflare wouldn't read a _redirects file as written. */
export function assertRedirects(path = "public/_redirects") {
  const problems = checkRedirects(readFileSync(path, "utf8"));
  if (problems.length > 0) {
    throw new Error(`Problems with ${path}:\n  ${problems.join("\n  ")}`);
  }
}
