import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { activateContract, createContract, directValue, getContract, sendContractForSignature, updateContract } from "@/server/commercial/contracts";
import { renderContractPdf } from "@/server/pdf/contract";
import { createClient } from "@/server/crm/clients";
import { ctxFor, makeUser, resetDb, setupOrg } from "./helpers";

let orgId: string;
beforeEach(async () => {
  await resetDb();
  orgId = (await setupOrg()).id;
});

const users = async () => ({
  manager: await ctxFor((await makeUser(orgId, "mgr@x.test", ["sales_manager"])).id),
  rep: await ctxFor((await makeUser(orgId, "rep@x.test", ["sales_rep"])).id),
  rep2: await ctxFor((await makeUser(orgId, "rep2@x.test", ["sales_rep"])).id),
  employee: await ctxFor((await makeUser(orgId, "emp@x.test", ["employee"])).id)
});

describe("contracts written directly (no quotation)", () => {
  it("value is computed on the server: (subtotal − discount) + VAT", () => {
    expect(directValue("10000", "1000", 15)).toEqual({ subtotal: "10000.00", discountTotal: "1000.00", taxTotal: "1350.00", contractValue: "10350.00" });
    expect(directValue("99.99", null, 15).taxTotal).toBe("15.00");
    expect(() => directValue("100", "200", 15)).toThrow(/DISCOUNT_EXCEEDS_SUBTOTAL/);
  });

  it("creates a full draft — parties, value, terms, milestones — that follows the normal path to activation and PDF", async () => {
    const u = await users();
    const client = await createClient(u.rep, { displayName: "Nakheel Trading", type: "COMPANY" });
    const c = await createContract(u.rep, {
      clientId: client.id,
      title: "Annual marketing retainer",
      startDate: "2026-11-01",
      endDate: "2027-10-31",
      subtotal: "24,000",
      discountTotal: "2000",
      vatRate: "15",
      scopeOfWork: "• Monthly content plan\n• Ads management",
      paymentTerms: "Monthly in advance",
      terms: "Saudi law applies.",
      milestones: [{ title: "Kickoff", percentage: 25 }, { title: "Quarter 2", amount: "6325" }],
      // the browser cannot choose the totals
      contractValue: "1",
      taxTotal: "0"
    });
    expect(c.number).toMatch(/^CTR-\d{4}-000001$/);
    const row = await getContract(u.rep, c.id);
    expect(row).toMatchObject({ status: "DRAFT", quotationId: null, title: "Annual marketing retainer", ownerId: u.rep.userId, currency: "SAR" });
    expect([row.subtotal.toFixed(2), row.discountTotal.toFixed(2), row.taxTotal.toFixed(2), row.contractValue.toFixed(2)]).toEqual(["24000.00", "2000.00", "3300.00", "25300.00"]);
    expect(row.milestones.map((m) => m.title)).toEqual(["Kickoff", "Quarter 2"]);
    expect(await prisma.auditLog.count({ where: { action: "contract.created", entityId: c.id } })).toBe(1);

    // a direct contract's value can change while it is a draft (VAT rate kept)
    await updateContract(u.rep, c.id, { title: "Annual marketing retainer", startDate: "2026-11-01", endDate: "2027-10-31", subtotal: "30000", milestones: [] });
    expect((await getContract(u.rep, c.id)).contractValue.toFixed(2)).toBe("34500.00");

    await sendContractForSignature(u.rep, c.id);
    await activateContract(u.manager, c.id, { signedAt: "2026-10-20", confirm: true });
    expect((await getContract(u.manager, c.id)).status).toBe("ACTIVE");
    const pdf = await renderContractPdf(orgId, c.id);
    expect(pdf.data.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("guards: permission, client scope, contact of the client, discount and milestones within the value", async () => {
    const u = await users();
    const client = await createClient(u.rep, { displayName: "Rep One Client", type: "COMPANY" });
    const other = await createClient(u.rep2, { displayName: "Rep Two Client", type: "COMPANY" });
    const otherContact = await prisma.contact.create({ data: { organizationId: orgId, clientId: other.id, firstName: "Sara" } });
    const base = { clientId: client.id, title: "Website build", subtotal: "5000" };
    await expect(createContract(u.employee, base)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createContract(u.rep, { ...base, clientId: other.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createContract(u.rep, { ...base, contactId: otherContact.id })).rejects.toMatchObject({ message: "CONTACT_NOT_OF_CLIENT" });
    await expect(createContract(u.rep, { ...base, discountTotal: "6000" })).rejects.toMatchObject({ message: "DISCOUNT_EXCEEDS_SUBTOTAL" });
    await expect(createContract(u.rep, { ...base, milestones: [{ title: "Too much", amount: "9000" }] })).rejects.toMatchObject({ message: "MILESTONES_EXCEED_VALUE" });
    await expect(createContract(u.rep, { ...base, startDate: "2026-12-01", endDate: "2026-11-01" })).rejects.toMatchObject({ message: "END_BEFORE_START" });
    await expect(createContract(u.rep, { ...base, subtotal: "" })).rejects.toThrow();
    expect(await prisma.contract.count()).toBe(0);
  });
});
