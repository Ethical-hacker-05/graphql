const storageKey = "graphql-profile-auth";

function looksLikeJwt(value) {
  if (typeof value !== "string") return false;
  const token = value.trim();
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  // base64url charset check
  return parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part));
}

function extractJwt(rawBody) {
  if (!rawBody) return "";

  const body = rawBody.trim();
  if (looksLikeJwt(body)) return body;

  // Some endpoints return a JSON string: "eyJ..."
  if (
    (body.startsWith("\"") && body.endsWith("\"")) ||
    (body.startsWith("'") && body.endsWith("'"))
  ) {
    const unwrapped = body.slice(1, -1).trim();
    if (looksLikeJwt(unwrapped)) return unwrapped;
  }

  // Try structured JSON payloads
  try {
    const parsed = JSON.parse(body);
    const candidates = [parsed, parsed?.jwt, parsed?.token, parsed?.accessToken];
    const found = candidates.find((item) => looksLikeJwt(item));
    return found || "";
  } catch {
    return "";
  }
}

export function saveSession(session) {
  localStorage.setItem(storageKey, JSON.stringify(session));
}

export function getSession() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(storageKey);
}

export async function signIn({ domain, identifier, password }) {
  const token = btoa(`${identifier}:${password}`);
  const response = await fetch(`https://${domain}/api/auth/signin`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Invalid credentials. Please check username/email and password.");
  }

  const rawBody = await response.text();
  const jwt = extractJwt(rawBody);
  if (!jwt) {
    throw new Error("Signin succeeded but no valid JWT was returned.");
  }

  return jwt;
}

export async function gqlRequest({ domain, jwt, query, variables = {} }) {
  const response = await fetch(`https://${domain}/api/graphql-engine/v1/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error("GraphQL request failed. Please login again.");
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message || "GraphQL returned an error.");
  }
  return payload.data;
}
