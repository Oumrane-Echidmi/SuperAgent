export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function createApi(token, onExpired = () => {}, transport = fetch) {
  return async (path, { method = "GET", body, signal } = {}) => {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
      throw new Error("Use a relative API path.");
    let response;
    try {
      response = await transport("/v1" + path, {
        method,
        signal: AbortSignal.any([
          AbortSignal.timeout(20000),
          ...(signal ? [signal] : []),
        ]),
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new ApiError(
        0,
        "NETWORK_ERROR",
        "Connection lost. Please retry the same action.",
      );
    }
    if (response.status === 401 && token) onExpired();
    let value;
    try {
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error();
      value = await response.json();
    } catch {
      throw new ApiError(
        503,
        "SERVICE_UNAVAILABLE",
        "The service is unavailable. Please try again.",
      );
    }
    if (!response.ok)
      throw new ApiError(
        response.status,
        value.error?.code ?? "REQUEST_FAILED",
        value.error?.message ?? "The request could not be completed.",
      );
    return value;
  };
}
export function moneyMinor(value) {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value))
    throw new Error("Enter a price with up to two decimal places.");
  const [whole, fraction = ""] = value.split("."),
    amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (amount > 1000000000)
    throw new Error("This price exceeds the supported limit.");
  return amount;
}
export const mad = (value) =>
  value == null
    ? "—"
    : `${(BigInt(value) / 100n).toString()}.${(BigInt(value) % 100n).toString().padStart(2, "0")} MAD`;
