export interface MessageProvider {
  send(channel: "sms" | "email", to: string, body: string): Promise<{ success: boolean; providerId?: string; error?: string }>;
}

// No SMS gateway (Twilio) or email provider credentials are configured yet
// (see Docs/Dev/EduWand_Environment_Setup.md section 6). This stub logs the
// rendered message and reports success so task status transitions can be
// built and tested end-to-end now. Swap this for a real TwilioMessageProvider /
// SesMessageProvider once credentials are available - callers only depend on
// the MessageProvider interface, not this implementation.
class StubMessageProvider implements MessageProvider {
  async send(channel: "sms" | "email", to: string, body: string) {
    console.warn(`[stub messaging] would send ${channel} to ${to}: ${body}`);
    return { success: true, providerId: `stub-${Date.now()}` };
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
