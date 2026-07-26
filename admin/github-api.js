/**
 * GitHub REST API istemcisi.
 *
 * Token hiçbir zaman bu modülde saklanmaz. Her istek öncesinde çağıranın
 * bellekte tuttuğu güncel değer okunur.
 */

const API_ORIGIN = "https://api.github.com";
const API_VERSION = "2022-11-28";

const STATUS_HINTS = {
  401: "Token geçersiz, süresi dolmuş veya GitHub tarafından iptal edilmiş olabilir.",
  403: "Token'ın gerekli izni olmayabilir; repository politikası, SSO veya hız sınırı isteği engelliyor olabilir.",
  404: "Repository, dal veya dosya bulunamadı. Token kaynağı göremediğinde GitHub güvenlik nedeniyle 404 de döndürebilir.",
};

function stringifyDetails(details) {
  if (!details) return "";
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

/**
 * GitHub yanıtındaki teşhis bilgilerini kullanıcıya güvenli biçimde taşır.
 */
export class GitHubApiError extends Error {
  constructor({ status = null, statusText = "", method, path, body = null, requestId = "", cause = null }) {
    const apiMessage = typeof body === "string" ? body : body?.message;
    const details = stringifyDetails(typeof body === "object" ? body?.errors : "");
    const documentationUrl = typeof body === "object" ? body?.documentation_url : "";
    const statusLine = status
      ? `HTTP ${status}${statusText ? ` ${statusText}` : ""}`
      : "HTTP durumu alınamadı";
    const lines = [
      `GitHub REST API: ${statusLine}`,
      `İstek: ${method} ${path}`,
      apiMessage ? `GitHub mesajı: ${apiMessage}` : "",
      details ? `Ayrıntı: ${details}` : "",
      status && STATUS_HINTS[status] ? `Olası neden: ${STATUS_HINTS[status]}` : "",
      documentationUrl ? `Dokümantasyon: ${documentationUrl}` : "",
      requestId ? `GitHub Request ID: ${requestId}` : "",
      cause?.message ? `Bağlantı hatası: ${cause.message}` : "",
    ].filter(Boolean);

    super(lines.join("\n"), cause ? { cause } : undefined);
    this.name = "GitHubApiError";
    this.status = status;
    this.statusText = statusText;
    this.method = method;
    this.path = path;
    this.requestId = requestId;
    this.documentationUrl = documentationUrl;
  }
}

/**
 * Test edilebilir, bağımsız bir GitHub API istemcisi üretir.
 */
export function createGitHubClient(getToken, fetchImplementation = globalThis.fetch) {
  return async function githubRequest(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    let response;

    try {
      response = await fetchImplementation(`${API_ORIGIN}${path}`, {
        ...options,
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${getToken()}`,
          "X-GitHub-Api-Version": API_VERSION,
          ...options.headers,
        },
      });
    } catch (cause) {
      throw new GitHubApiError({ method, path, cause });
    }

    const responseText = await response.text();
    let body = null;
    if (responseText) {
      try {
        body = JSON.parse(responseText);
      } catch {
        body = responseText;
      }
    }

    if (!response.ok) {
      throw new GitHubApiError({
        status: response.status,
        statusText: response.statusText,
        method,
        path,
        body,
        requestId: response.headers.get("x-github-request-id") || "",
      });
    }

    return body;
  };
}
