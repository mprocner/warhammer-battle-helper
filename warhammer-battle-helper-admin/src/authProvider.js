const TOKEN_KEY = "token";

function parseToken(token) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

const authProvider = {
  login: async ({ username, password }) => {
    const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:8080";
    const res = await fetch(`${apiUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: username, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Login failed");
    }
    const { token } = await res.json();
    const claims = parseToken(token);
    if (!claims?.is_admin) {
      throw new Error("Admin access required");
    }
    localStorage.setItem(TOKEN_KEY, token);
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    return Promise.resolve();
  },

  checkAuth: () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return Promise.reject();
    const claims = parseToken(token);
    if (!claims?.is_admin) return Promise.reject();
    if (claims.exp && Date.now() / 1000 > claims.exp) return Promise.reject();
    return Promise.resolve();
  },

  checkError: (error) => {
    if (error?.status === 401 || error?.status === 403) {
      localStorage.removeItem(TOKEN_KEY);
      return Promise.reject();
    }
    return Promise.resolve();
  },

  getIdentity: () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const claims = parseToken(token);
    return Promise.resolve({
      id: claims?.user_id,
      fullName: claims?.email,
    });
  },

  getPermissions: () => Promise.resolve("admin"),
};

export default authProvider;
