const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  `${window.location.origin}/api/v1`;

let csrfToken = null;

async function request(path, options = {}) {
  const method = options.method || "GET";
  let token = csrfToken;
  if (
    !["GET", "HEAD", "OPTIONS"].includes(method) &&
    !token &&
    !path.includes("/auth/login") &&
    !path.includes("/setup")
  ) {
    token = await ensureCsrf();
  }
  const headers = {
    ...(options.body !== undefined
      ? { "Content-Type": "application/json" }
      : {}),
    ...(options.headers || {}),
  };
  if (token && !["GET", "HEAD", "OPTIONS"].includes(method))
    headers["X-CSRF-Token"] = token;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  const data = await response
    .json()
    .catch(() => ({
      success: false,
      error: { message: "Invalid server response." },
    }));
  if (!response.ok) {
    const error = new Error(data?.error?.message || "Request failed");
    error.code = data?.error?.code;
    error.fields = data?.error?.fields;
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function ensureCsrf() {
  const data = await request("/auth/csrf");
  csrfToken = data.data.csrfToken;
  return csrfToken;
}

export function clearCsrf() {
  csrfToken = null;
}
export const api = {
  setupStatus: () => request("/setup/status"),
  setup: (body) =>
    request("/setup", { method: "POST", body: JSON.stringify(body) }),
  login: async (body) => {
    const data = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    });
    csrfToken = data.data ? await ensureCsrf() : csrfToken;
    return data;
  },
  logout: async () => {
    try {
      return await request("/auth/logout", { method: "POST" });
    } finally {
      clearCsrf();
    }
  },
  me: () => request("/auth/me"),
  changePassword: (body) =>
    request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  branding: {
    get: () => request('/branding'),
    update: (key, value) => request('/branding', { method: 'PUT', body: JSON.stringify({ key, value }) }),
  },
  assetTypes: {
    list: () => request("/asset-types"),
    create: (body) =>
      request("/asset-types", { method: "POST", body: JSON.stringify(body) }),
    get: (id) => request(`/asset-types/${id}`),
    update: (id, body) =>
      request(`/asset-types/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (id) => request(`/asset-types/${id}`, { method: "DELETE" }),
    form: (id) => request(`/asset-types/${id}/form`),
    saveForm: (id, body) =>
      request(`/asset-types/${id}/form`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
  },
  commonForm: {
    get: () => request('/common-form'),
    save: (body) => request('/common-form', { method: 'PUT', body: JSON.stringify(body) }),
    automations: {
      list: () => request('/common-form/automations'),
      create: (body) => request('/common-form/automations', { method: 'POST', body: JSON.stringify(body) }),
      remove: (id) => request(`/common-form/automations/${id}`, { method: 'DELETE' }),
    },
  },
  fields: {
    list: () => request("/fields"),
    create: (body) =>
      request("/fields", { method: "POST", body: JSON.stringify(body) }),
    update: (id, body) =>
      request(`/fields/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id) => request(`/fields/${id}`, { method: "DELETE" }),
  },
  dropdowns: {
    list: () => request("/dropdowns"),
    get: (id) => request(`/dropdowns/${id}`),
    create: (body) =>
      request("/dropdowns", { method: "POST", body: JSON.stringify(body) }),
    update: (id, body) =>
      request(`/dropdowns/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (id) => request(`/dropdowns/${id}`, { method: "DELETE" }),
    createOption: (id, body) =>
      request(`/dropdowns/${id}/options`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateOption: (id, optionId, body) =>
      request(`/dropdowns/${id}/options/${optionId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    removeOption: (id, optionId) =>
      request(`/dropdowns/${id}/options/${optionId}`, { method: "DELETE" }),
  },
  automations: {
    list: (assetTypeId) => request(`/asset-types/${assetTypeId}/automations`),
    create: (assetTypeId, body) =>
      request(`/asset-types/${assetTypeId}/automations`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    remove: (id) => request(`/automations/${id}`, { method: "DELETE" }),
  },
  assets: {
    form: (typeId) => request(`/asset-types/${typeId}/assets/form`),
    list: (typeId, page = 1) =>
      request(`/asset-types/${typeId}/assets?page=${page}&pageSize=100`),
    create: (typeId, values) =>
      request(`/asset-types/${typeId}/assets`, {
        method: "POST",
        body: JSON.stringify({ values }),
      }),
    bulkUpdate: (typeId, publicIds, values) =>
      request(`/asset-types/${typeId}/assets/bulk`, { method: "PATCH", body: JSON.stringify({ publicIds, values }) }),
    bulkRemove: (typeId, publicIds) =>
      request(`/asset-types/${typeId}/assets/bulk`, { method: "DELETE", body: JSON.stringify({ publicIds }) }),
    get: (publicId) => request(`/assets/${publicId}`),
    update: (publicId, values) =>
      request(`/assets/${publicId}`, {
        method: "PATCH",
        body: JSON.stringify({ values }),
      }),
    remove: (publicId) => request(`/assets/${publicId}`, { method: "DELETE" }),
  },
};
