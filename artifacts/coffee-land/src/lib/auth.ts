export function parseJwt(token: string) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
}

export function getToken() {
  return localStorage.getItem('coffee_land_token');
}

export function setToken(token: string) {
  localStorage.setItem('coffee_land_token', token);
}

export function clearToken() {
  localStorage.removeItem('coffee_land_token');
}

export function getUserFromToken() {
  const token = getToken();
  if (!token) return null;
  return parseJwt(token);
}
