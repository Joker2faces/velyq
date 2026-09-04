const ADMIN_URL_ENVIRONMENT_VARIABLE = "NEXT_PUBLIC_VELYQ_ADMIN_URL";

/**
 * Returns the explicitly configured admin origin.
 *
 * There is intentionally no staging fallback: an unset or invalid value
 * removes the link instead of sending customers to an unverified host.
 */
export function getConfiguredAdminUrl() {
  const configured = process.env[ADMIN_URL_ENVIRONMENT_VARIABLE]?.trim();
  if (!configured) return null;

  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
