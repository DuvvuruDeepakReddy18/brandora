"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LockKeyhole, X } from "lucide-react";
import { CREW_CHANNEL, readCrewAction } from "./brand-crew-protocol.mjs";
import "./brand-crew-landing.css";

export function LandingPage({
  children,
  onExplore,
  demoAvailable,
  busy,
  error,
}: {
  logo: ReactNode;
  children: ReactNode;
  onExplore: () => void;
  demoAvailable: boolean;
  busy: boolean;
  error: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const auth = useRef<HTMLDialogElement>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);

  const sendState = useCallback(() => {
    frame.current?.contentWindow?.postMessage(
      {
        channel: CREW_CHANNEL,
        version: 1,
        type: "ui-state",
        demoAvailable,
        busy,
        error,
        authOpen,
      },
      window.location.origin,
    );
  }, [demoAvailable, busy, error, authOpen]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const action = readCrewAction(
        event,
        frame.current?.contentWindow,
        window.location.origin,
      );
      if (action === "ready") {
        setReady(true);
        sendState();
      } else if (action === "login") {
        if (!busy) setAuthOpen(true);
      } else if (action === "demo" && !busy && !authOpen) {
        if (demoAvailable) onExplore();
        else setAuthOpen(true);
      }
    };
    window.addEventListener("message", receive);
    // Covers a document that completed its handshake before React's effect ran.
    sendState();
    return () => window.removeEventListener("message", receive);
  }, [onExplore, demoAvailable, busy, authOpen, sendState]);

  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!authOpen) return;
    const element = auth.current;
    element?.showModal();
    return () => element?.close();
  }, [authOpen]);

  return (
    <div className="brand-crew-shell">
      <iframe
        ref={frame}
        src="/brand-crew/index.html"
        title="Brandora — The Brand Crew interactive introduction"
        className="brand-crew-frame"
        onLoad={sendState}
        allow="camera 'none'; microphone 'none'; geolocation 'none'"
        referrerPolicy="same-origin"
      />
      {!ready && (
        <div className="brand-crew-loading" role="status">
          {slow
            ? "The visual introduction is taking longer to load."
            : "Meeting your brand crew…"}
          {slow && (
            <div>
              <button onClick={() => setAuthOpen(true)}>Sign in</button>
              <button
                disabled={busy}
                onClick={() =>
                  demoAvailable ? onExplore() : setAuthOpen(true)
                }
              >
                {busy
                  ? "Opening…"
                  : demoAvailable
                    ? "Explore demo"
                    : "Open workspace"}
              </button>
            </div>
          )}
        </div>
      )}
      <dialog
        ref={auth}
        className="brand-crew-auth"
        aria-labelledby="brandora-auth-title"
        onClose={() => setAuthOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setAuthOpen(false);
        }}
      >
        <div className="brand-crew-auth-inner">
          <button
            className="brand-crew-auth-close"
            aria-label="Close sign in"
            onClick={() => setAuthOpen(false)}
          >
            <X size={20} />
          </button>
          {children}
          <div className="brand-crew-auth-note">
            <LockKeyhole size={15} aria-hidden="true" />
            <p>
              Rules-only by default. Your workspace manager controls external AI
              access.
            </p>
          </div>
        </div>
      </dialog>
    </div>
  );
}
