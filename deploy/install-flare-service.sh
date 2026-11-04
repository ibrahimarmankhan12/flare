#!/usr/bin/env bash
# Install and start the `flare` systemd service. Requires sudo.
#
# What it does:
#   1. Copies deploy/flare.service → /etc/systemd/system/flare.service
#   2. systemctl daemon-reload
#   3. systemctl enable --now flare
#   4. Prints status + verifies port 3000 is listening
#
# Idempotent: re-running will just reload + restart.
set -euo pipefail

SERVICE_SRC="/home/flare/zip-main/deploy/flare.service"
SERVICE_DST="/etc/systemd/system/flare.service"

if [[ ! -f "$SERVICE_SRC" ]]; then
  echo "ERROR: $SERVICE_SRC not found." >&2
  exit 1
fi

echo "→ Installing unit to $SERVICE_DST"
sudo install -m 0644 -o root -g root "$SERVICE_SRC" "$SERVICE_DST"

echo "→ Reloading systemd"
sudo systemctl daemon-reload

echo "→ Stopping any existing flare processes"
sudo systemctl stop flare 2>/dev/null || true

echo "→ Enabling and starting flare"
sudo systemctl enable flare
sudo systemctl start flare

echo
echo "→ Service status:"
sudo systemctl --no-pager --full status flare | head -25 || true
echo
echo "→ Port 3000:"
ss -tlnp 2>/dev/null | grep ":3000" || echo "  (NOT LISTENING — check journalctl -u flare -n 100)"
echo
echo "→ Recent logs:"
sudo journalctl -u flare -n 30 --no-pager || true
