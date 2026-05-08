const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080";

function authHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
}

async function request(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw { status: res.status, message: text };
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null;
  }
  return res.json();
}

// Maps React Admin resource names to API paths
const RESOURCE_MAP = {
  users: "/admin/users",
  games: "/admin/games",
};

const dataProvider = {
  getList: async (resource, params) => {
    const path = RESOURCE_MAP[resource];
    const data = await request("GET", path);
    const total = data.length;

    // Client-side sort + pagination (data is small for admin use)
    const { field = "id", order = "ASC" } = params.sort || {};
    const sorted = [...data].sort((a, b) => {
      if (a[field] < b[field]) return order === "ASC" ? -1 : 1;
      if (a[field] > b[field]) return order === "ASC" ? 1 : -1;
      return 0;
    });

    const { page = 1, perPage = 25 } = params.pagination || {};
    const start = (page - 1) * perPage;
    const sliced = sorted.slice(start, start + perPage);

    return { data: sliced, total };
  },

  getOne: async (resource, params) => {
    const path = RESOURCE_MAP[resource];
    const data = await request("GET", `${path}/${params.id}`);
    return { data };
  },

  getMany: async (resource, params) => {
    const path = RESOURCE_MAP[resource];
    const results = await Promise.all(
      params.ids.map((id) => request("GET", `${path}/${id}`))
    );
    return { data: results };
  },

  getManyReference: async (resource, params) => {
    const { data, total } = await dataProvider.getList(resource, params);
    return { data, total };
  },

  update: async (resource, params) => {
    const path = RESOURCE_MAP[resource];
    const data = await request("PATCH", `${path}/${params.id}`, params.data);
    return { data: data || { id: params.id, ...params.data } };
  },

  delete: async (resource, params) => {
    const path = RESOURCE_MAP[resource];
    await request("DELETE", `${path}/${params.id}`);
    return { data: { id: params.id } };
  },

  // Admin-only custom requests (not standard RA resources)
  getStorageStats: () => request("GET", "/admin/stats/storage"),
  getSessionStats: () => request("GET", "/admin/stats/sessions"),

  // Stubs to satisfy React Admin interface
  create: async () => Promise.reject(new Error("Not supported")),
  deleteMany: async () => Promise.reject(new Error("Not supported")),
  updateMany: async () => Promise.reject(new Error("Not supported")),
};

export default dataProvider;
