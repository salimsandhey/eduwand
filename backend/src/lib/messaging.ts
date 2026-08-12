import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

export interface MessageProvider {
  send(channel: "sms" | "email", to: string, body: string): Promise<{ success: boolean; providerId?: string; error?: string }>;
}

// No SMS gateway (Twilio) or email provider credentials are configured yet
// (see Docs/Dev/EduWand_Environment_Setup.md section 6). This stub logs the
// rendered message and reports success so task status transitions can be
// built and tested end-to-end now. Swap the messageProvider export below for
// TwilioMessageProvider / SesEmailProvider once credentials are available -
// callers only depend on the MessageProvider interface, not this implementation.
class StubMessageProvider implements MessageProvider {
  async send(channel: "sms" | "email", to: string, body: string) {
    console.warn(`[stub messaging] would send ${channel} to ${to}: ${body}`);
    return { success: true, providerId: `stub-${Date.now()}` };
  }
}

// Real SMS via Twilio's plain REST API (Basic Auth + fetch) - no `twilio` SDK
// dependency needed for a single "send an SMS" call. Needs TWILIO_ACCOUNT_SID,
// TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER once this is wired in as the active
// provider - not read from env here, so this class stays testable without them.
export class TwilioMessageProvider implements MessageProvider {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string
  ) {}

  async send(channel: "sms" | "email", to: string, body: string) {
    if (channel !== "sms") {
      return { success: false, error: "TwilioMessageProvider only handles the sms channel" };
    }

    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: this.fromNumber, Body: body }).toString(),
    });
    const result = (await response.json()) as { message?: string; sid?: string };

    if (!response.ok) {
      return { success: false, error: typeof result.message === "string" ? result.message : "Twilio request failed" };
    }
    return { success: true, providerId: result.sid };
  }
}

// Real email via AWS SES. Credentials/region resolve through the standard AWS
// SDK chain (env vars, shared config, instance role) - nothing SES-specific to
// configure here beyond the sender address.
export class SesEmailProvider implements MessageProvider {
  private readonly client: SESClient;

  constructor(private readonly fromEmail: string, region = "ap-south-1") {
    this.client = new SESClient({ region });
  }

  async send(channel: "sms" | "email", to: string, body: string) {
    if (channel !== "email") {
      return { success: false, error: "SesEmailProvider only handles the email channel" };
    }

    try {
      const result = await this.client.send(
        new SendEmailCommand({
          Source: this.fromEmail,
          Destination: { ToAddresses: [to] },
          Message: {
            Subject: { Data: "EduWand" },
            Body: { Text: { Data: body } },
          },
        })
      );
      return { success: true, providerId: result.MessageId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "SES send failed" };
    }
  }
}

export const messageProvider: MessageProvider = new StubMessageProvider();

// Replaces {{fieldName}} placeholders in a template body with values from data.
// Unknown placeholders are left as-is rather than erroring.
export function renderTemplate(body: string, data: Record<string, string | null | undefined>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    const value = data[key];
    return value === null || value === undefined ? match : value;
  });
}
