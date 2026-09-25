import test from "node:test";
import assert from "node:assert/strict";
import { computeInvoiceTax, financialYear, formatInvoiceNumber, GSTIN_PATTERN, stateByCode } from "./gst";

test("a GST-inclusive price is split into taxable value and tax that add back up", () => {
  const tax = computeInvoiceTax({ totalPaise: 49900, ratePercent: 18, gstRegistered: true, sellerStateCode: "27", buyerStateCode: "27" });
  assert.equal(tax.taxablePaise, 42288); // Rs 422.88
  assert.equal(tax.cgstPaise + tax.sgstPaise, 7612); // Rs 76.12
  assert.equal(tax.taxablePaise + tax.cgstPaise + tax.sgstPaise + tax.igstPaise, 49900);
  assert.equal(tax.igstPaise, 0);
});

test("same state is CGST + SGST, another state is IGST", () => {
  const same = computeInvoiceTax({ totalPaise: 49900, ratePercent: 18, gstRegistered: true, sellerStateCode: "27", buyerStateCode: "27" });
  assert.ok(same.cgstPaise > 0 && same.sgstPaise > 0 && same.igstPaise === 0);
  const other = computeInvoiceTax({ totalPaise: 49900, ratePercent: 18, gstRegistered: true, sellerStateCode: "27", buyerStateCode: "29" });
  assert.equal(other.igstPaise, 7612);
  assert.equal(other.cgstPaise + other.sgstPaise, 0);
});

test("an odd tax amount never loses a paisa between CGST and SGST", () => {
  for (const total of [10001, 12345, 49901, 99999]) {
    const t = computeInvoiceTax({ totalPaise: total, ratePercent: 18, gstRegistered: true, sellerStateCode: "07", buyerStateCode: "07" });
    assert.equal(t.taxablePaise + t.cgstPaise + t.sgstPaise, total);
  }
});

test("without a GST registration no tax is charged", () => {
  const t = computeInvoiceTax({ totalPaise: 49900, ratePercent: 18, gstRegistered: false, sellerStateCode: null, buyerStateCode: "27" });
  assert.deepEqual(t, { taxablePaise: 49900, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 49900 });
});

test("the financial year runs April to March in IST", () => {
  assert.equal(financialYear(new Date("2026-09-25T10:00:00Z")), "2627");
  assert.equal(financialYear(new Date("2027-03-31T10:00:00Z")), "2627");
  // 20:00 UTC on 31 March is already 1 April in IST.
  assert.equal(financialYear(new Date("2027-03-31T20:00:00Z")), "2728");
  assert.equal(financialYear(new Date("2026-01-15T10:00:00Z")), "2526");
});

test("invoice numbers are zero padded per year", () => {
  assert.equal(formatInvoiceNumber("2627", 1), "EW/2627/000001");
  assert.equal(formatInvoiceNumber("2627", 123456), "EW/2627/123456");
});

test("GSTIN format and state lookup", () => {
  assert.ok(GSTIN_PATTERN.test("27AAPFU0939F1ZV"));
  assert.equal(GSTIN_PATTERN.test("27AAPFU0939F1Z"), false);
  assert.equal(GSTIN_PATTERN.test("not-a-gstin"), false);
  assert.equal(stateByCode("27")?.name, "Maharashtra");
  assert.equal(stateByCode("99"), null);
});
