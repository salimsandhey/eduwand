import { messageProvider } from "../messaging";
import type { RenderedEmail } from "./layout";

export interface QueuedEmail {
  to: string;
  email: RenderedEmail;
}

const RETRY_DELAYS_MS = [1_000, 4_000];
// Spread bulk sends out so a 40-student class doesn't burst past SES's
// per-second limit or hurt the sending reputation.
const BULK_GAP_MS = 120;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendEmail(to: string, email: RenderedEmail): Promise<{ success: boolean; error?: string }> {
  const result = await messageProvider.send("email", to, email.text, { subject: email.subject, html: email.html });
  return { success: result.success, error: result.error };
}

// Sends with a couple of retries and never throws - use for anything that is
// a side effect of a request (welcome, notifications) so a slow or failing
// mail provider can't fail or delay the request itself.
async function sendWithRetry(to: string, email: RenderedEmail): Promise<boolean> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const result = await sendEmail(to, email);
      if (result.success) return true;
      console.error(`[email] "${email.subject}" to ${to} failed (attempt ${attempt + 1}): ${result.error}`);
    } catch (err) {
      console.error(`[email] "${email.subject}" to ${to} threw (attempt ${attempt + 1})`, err);
    }
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }
  return false;
}

export function sendEmailInBackground(to: string | null | undefined, email: RenderedEmail): void {
  if (!to) return;
  void sendWithRetry(to, email);
}

export function sendEmailsInBackground(items: QueuedEmail[]): void {
  if (items.length === 0) return;
  void (async () => {
    for (const item of items) {
      await sendWithRetry(item.to, item.email);
      await sleep(BULK_GAP_MS);
    }
  })();
}
