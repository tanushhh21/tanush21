/** Model costs are billed in dollars; customers think in rupees. */
export const USD_INR = Number(process.env.WINNOW_USD_INR) || 88;

export function rupeesFromUsd(usd: number) {
  const r = usd * USD_INR;
  if (r === 0) return "₹0";
  if (r < 1) return `₹${r.toFixed(2)}`;
  if (r < 100) return `₹${r.toFixed(1)}`;
  return `₹${Math.round(r).toLocaleString("en-IN")}`;
}

export const usd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
