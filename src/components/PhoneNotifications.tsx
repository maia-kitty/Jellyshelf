"use client";

import { createPortal } from "react-dom";
import { NTFY_SH } from "@/lib/ntfyShared";
import { Modal } from "./Modal";

/** Read-only, selected on click: the clipboard API needs https, and Jellyshelf is often plain http on a LAN or IP. */
function Copyable({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input className="input mt-1 font-mono text-sm" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
    </label>
  );
}

/**
 * How to get your notifications in the ntfy app: subscribed at ntfy itself when it's reachable from anywhere (`server`),
 * else at Jellyshelf's address, which relays your topic from ntfy.
 */
export function PhoneNotifications({ topic, server, admin, onClose }: { topic: string; server: string | null; admin: boolean; onClose: () => void }) {
  // ntfy.sh is the app's own default, so there's no server to enter.
  const appDefault = server === NTFY_SH;
  // Out of the header, whose blur would otherwise pin this "fixed" dialog inside the bar.
  return createPortal(
    <Modal title="Phone notifications" onClose={onClose} className="max-w-lg">
      <div className="space-y-4 p-5 text-sm">
        <p className="text-muted">
          Get a notification when your requests are approved and when they&apos;re ready to watch or read{admin && ", and when someone requests something"}.
        </p>
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            Install the{" "}
            <a href="https://ntfy.sh/#subscribe-phone" target="_blank" rel="noreferrer" className="text-accent hover:underline">
              ntfy app
            </a>
            .
          </li>
          <li>
            {appDefault ? (
              <>
                Tap <b>+</b> and enter this topic (leave <b>Use another server</b> off):
              </>
            ) : (
              <>
                Tap <b>+</b>, turn on <b>Use another server</b>, and enter:
              </>
            )}
            <div className="mt-2 space-y-2">
              <Copyable label="Topic" value={topic} />
              {/* Without a public ntfy, the address you reached Jellyshelf at is the one your phone can reach it at too
                  (this only renders after a click, in the browser). */}
              {!appDefault && <Copyable label="Server" value={server ?? location.origin} />}
            </div>
          </li>
          <li>
            Tap <b>Subscribe</b>. That&apos;s it.
          </li>
        </ol>
        <p className="text-xs text-muted">
          Keep the topic to yourself: anyone who has it can read your notifications.
          {server
            ? " They reach your phone wherever you are; tapping one opens Jellyshelf, which still needs your usual way in."
            : " They arrive while your phone can reach Jellyshelf (at home, or over your VPN)."}
          {!server && (
            <>
              {" "}
              If nothing arrives, set <b>Connection protocol</b> to <b>JSON stream</b> in the app&apos;s settings.
            </>
          )}
        </p>
      </div>
    </Modal>,
    document.body,
  );
}
