import { afterEach, describe, expect, it } from "vitest";
import { websiteLeadSchema } from "@/server/crm/website";
import { buildLeadMail, emailWebsiteLead, rfc822 } from "@/server/notify/lead-mail";

const lead = (over: Record<string, unknown> = {}) =>
  websiteLeadSchema.parse({ name: "أحمد العتيبي", phone: "0550881255", email: "ahmed@example.com", service: "dedicated-tech-team", budget: "10k-30k", message: "نحتاج فريق تقني", source: "quote", locale: "ar", ...over });

describe("website request e-mail", () => {
  afterEach(() => {
    delete process.env.SENDMAIL_PATH;
    delete process.env.SMTP_HOST;
  });

  it("carries every field the visitor filled, with readable Arabic labels", () => {
    const m = buildLeadMail(lead(), { ip: "1.2.3.4", leadNumber: "L-0042", saved: true });
    expect(m.subject.startsWith("طلب جديد من الموقع — أحمد العتيبي (")).toBe(true);
    expect(m.subject).not.toContain("dedicated-tech-team");
    for (const v of ["أحمد العتيبي", "0550881255", "ahmed@example.com", "10,000 – 30,000 ريال", "طلب عرض سعر", "L-0042", "نحتاج فريق تقني", "1.2.3.4"]) expect(m.text).toContain(v);
    expect(m.replyTo).toBe("ahmed@example.com");
  });

  it("warns when the request could not be saved in the dashboard", () => {
    expect(buildLeadMail(lead(), { saved: false }).text).toContain("هذه الرسالة هي النسخة الوحيدة");
  });

  it("blocks header injection through the name or e-mail", () => {
    const m = buildLeadMail(lead({ name: "x\r\nBcc: victim@example.com", email: "a@b.co\r\nBcc: v@example.com" }), { saved: true });
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.replyTo).toBeNull();
    const raw = rfc822("info@dmstech.sa", "info@dmstech.sa", m);
    const headers = raw.split("\r\n\r\n")[0];
    expect(headers).not.toMatch(/^Bcc:/im);
    expect(headers).toMatch(/^Subject: =\?UTF-8\?B\?/m);
  });

  it("is skipped (not failed) when the server has no mail transport", async () => {
    process.env.SENDMAIL_PATH = "/no/such/sendmail";
    expect(await emailWebsiteLead(lead(), { saved: true })).toBe("skipped");
  });
});
