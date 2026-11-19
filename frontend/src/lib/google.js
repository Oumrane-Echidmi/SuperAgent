const KEY = "superagent.google.pending";
const read = () => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
};
const write = (value) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable: the user restarts the connection */
  }
};
export const pendingGoogle = read;
export const rememberConnection = (connectionId) => write({ connectionId });
export const rememberCallback = (code, state) =>
  write({ ...read(), code, state });
export const clearGoogle = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};

// Accepts a pasted Google Sheets URL or a bare spreadsheet ID.
export function spreadsheetIdFrom(input) {
  const text = input.trim();
  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{1,200})/);
  if (match) return match[1];
  return /^[a-zA-Z0-9_-]{1,200}$/.test(text) ? text : null;
}
