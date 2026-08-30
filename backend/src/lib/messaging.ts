import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

export interface MessageProvider {
  send(channel: "sms" | "email" | "whatsapp", to: string, body: string): Promise<{ success: boolean; providerId?: string; error?: string }>;
}

class StubMessageProvider implements MessageProvider {
  async send(channel: "sms" | "email" | "whatsapp", to: string, body: string) {
    console.warn(`[stub messaging] would send ${channel} to ${to}: ${body}`);
    return { success: true, providerId: `stub-${Date.now()}` };
  }
}

export class TwilioMessageProvider implements MessageProvider {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string
  ) {}

  async send(channel: "sms" | "email" | "whatsapp", to: string, body: string) {
    if (channel !== "sms" && channel !== "whatsapp") {
      return { success: false, error: "TwilioMessageProvider only handles sms and whatsapp" };
    }

    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: channel === "whatsapp" ? `whatsapp:${to}` : to, From: channel === "whatsapp" ? `whatsapp:${this.fromNumber}` : this.fromNumber, Body: body }).toString(),
    });
    const result = (await response.json()) as { message?: string; sid?: string };

    if (!response.ok) {
      return { success: false, error: typeof result.message === "string" ? result.message : "Twilio request failed" };
    }
    return { success: true, providerId: result.sid };
  }
}

export class SesEmailProvider implements MessageProvider {
  private readonly client: SESClient;

  constructor(private readonly fromEmail: string, region = "ap-south-1") {
    this.client = new SESClient({ region });
  }

  async send(channel: "sms" | "email" | "whatsapp", to: string, body: string) {
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

export function renderTemplate(body: string, data: Record<string, string | null | undefined>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    const value = data[key];
    return value === null || value === undefined ? match : value;
  });
}
