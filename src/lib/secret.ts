import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "@/db";

let cached: string | undefined;

/** 64-hex-char secret persisted in the config dir; generated on first boot. */
export function appSecret(): string {
  if (cached) return cached;
  if (process.env.KITSUNE_SECRET) return (cached = process.env.KITSUNE_SECRET);
  const file = path.join(CONFIG_DIR, "secret.key");
  try {
    cached = fs.readFileSync(file, "utf8").trim();
  } catch {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    cached = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(file, cached, { mode: 0o600 });
  }
  return cached;
}

function key() {
  return crypto.createHash("sha256").update(appSecret()).update("token-encryption").digest();
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(blob: string): string {
  const [iv, tag, data] = blob.split(".").map((s) => Buffer.from(s, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
