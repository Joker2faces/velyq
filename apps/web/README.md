# VELYQ customer web app

## Runtime configuration

`NEXT_PUBLIC_VELYQ_ADMIN_URL` is the explicit absolute URL for the separate
VELYQ admin console. The customer app has no default admin hostname: if this
variable is unset or invalid, the admin-console link is omitted. Configure it
per deployment (for example, the protected staging admin origin) rather than
copying a preview URL into application code.

Customer routes remain protected by the server-side session boundary. Synthetic
data is visibly labelled and is not an anonymous preview mode.
