// GST maths and invoice numbering for plan invoices. Prices are GST-inclusive,
// so the taxable value is worked back from the total. All amounts are paise.

// GST state / UT codes (25 was merged into 26).
export const GST_STATES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
];

export function stateByCode(code: string | null | undefined): { code: string; name: string } | null {
  return GST_STATES.find((s) => s.code === code) ?? null;
}

export interface InvoiceTax {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

// Splits a GST-inclusive total into taxable value + tax. Tax in the same state
// as the seller is CGST + SGST (half each); any other state is IGST. Without a
// GST registration no tax is charged: the total is the taxable value.
export function computeInvoiceTax(params: {
  totalPaise: number;
  ratePercent: number;
  gstRegistered: boolean;
  sellerStateCode: string | null;
  buyerStateCode: string | null;
}): InvoiceTax {
  const { totalPaise, ratePercent, gstRegistered, sellerStateCode, buyerStateCode } = params;
  if (!gstRegistered || ratePercent <= 0) {
    return { taxablePaise: totalPaise, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise };
  }

  const taxablePaise = Math.round((totalPaise * 100) / (100 + ratePercent));
  const taxPaise = totalPaise - taxablePaise;

  if (sellerStateCode && buyerStateCode && sellerStateCode === buyerStateCode) {
    const cgstPaise = Math.floor(taxPaise / 2);
    return { taxablePaise, cgstPaise, sgstPaise: taxPaise - cgstPaise, igstPaise: 0, totalPaise };
  }
  return { taxablePaise, cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise, totalPaise };
}

// Indian financial year (April - March) as "2526". Uses IST so an evening
// payment on 31 March is still in the closing year.
export function financialYear(date: Date): string {
  const ist = new Date(date.getTime() + 330 * 60_000);
  const year = ist.getUTCFullYear();
  const startYear = ist.getUTCMonth() >= 3 ? year : year - 1;
  return `${String(startYear % 100).padStart(2, "0")}${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function formatInvoiceNumber(fy: string, sequence: number): string {
  return `EW/${fy}/${String(sequence).padStart(6, "0")}`;
}

export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

export const formatRupees = (paise: number): string => `Rs ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
