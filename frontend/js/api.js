const api = {
  async request(path, options = {}) {
    const adminToken = typeof localStorage !== "undefined" ? localStorage.getItem("f1_admin_token") : null;
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (adminToken && !headers["X-Admin-Token"]) {
      headers["X-Admin-Token"] = adminToken;
    }
    const res = await fetch(path, {
      ...options,
      headers,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {
      throw new Error("The server did not return JSON.");
    }
    if (!res.ok) {
      if (res.status === 401 && typeof window !== "undefined" && typeof window.prompt === "function") {
        const entered = window.prompt("Admin authentication required for write operations.\nPlease enter the Admin Key:");
        if (entered && entered.trim()) {
          const cleanToken = entered.trim();
          localStorage.setItem("f1_admin_token", cleanToken);
          const retryHeaders = { ...headers, "X-Admin-Token": cleanToken };
          return api.request(path, { ...options, headers: retryHeaders });
        }
      }
      throw new Error((data && data.error) || `Request failed (${res.status})`);
    }
    return data;
  },
  get: (path) => api.request(path),
  send: (path, method, body) => api.request(path, { method, body: JSON.stringify(body) }),
  post: (path, body) => api.send(path, "POST", body),
  put: (path, body) => api.send(path, "PUT", body),
  delete: (path) => api.send(path, "DELETE"),
};
