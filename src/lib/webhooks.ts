import crypto from "node:crypto";
import { appSecret } from "./secret";

export function webhookToken() {
  return crypto.createHmac("sha256", appSecret()).update("webhooks").digest("hex").slice(0, 32);
}
