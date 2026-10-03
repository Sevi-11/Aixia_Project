"use client";

import { useEffect, useState } from "react";

const HEALTH_URL = "/api/healthz";
const HEALTH_INTERVAL_MS = 60_000;

// The status pill reports the backend, not the frontend, so it has to ask.
// Render's free tier sleeps the service, and the first request after a sleep
// takes ~30s to cold-start — the pill sitting on "connecting" through that
// wait is the honest reading, not a stall.
//
// Returns the setter too: a chat stream learns about reachability first-hand
// and reports it between polls.
export function useBackendStatus() {
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        const response = await fetch(HEALTH_URL, { cache: "no-store" });
        if (!cancelled) setStatus(response.ok ? "online" : "offline");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    }
    ping();
    const interval = setInterval(ping, HEALTH_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return [status, setStatus];
}
