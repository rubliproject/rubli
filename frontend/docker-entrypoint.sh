#!/bin/sh
# Container startup hook for nginx.
#
# The frontend carries NO runtime secrets: mutations authenticate with the
# signed-in user's JWT, never with a server key in the page
# (docs/security/WRITE_KEY_FIX_2026-10-02.md). This script only clears the
# legacy placeholder <!-- __RUBLI_RUNTIME_CONFIG__ --> in index.html.

INDEX=/usr/share/nginx/html/index.html

if grep -q '<!-- __RUBLI_RUNTIME_CONFIG__ -->' "${INDEX}"; then
  sed "s|<!-- __RUBLI_RUNTIME_CONFIG__ -->||" "${INDEX}" > "${INDEX}.tmp"
  mv "${INDEX}.tmp" "${INDEX}"
fi

echo "[docker-entrypoint] runtime config: none"

exec "$@"
