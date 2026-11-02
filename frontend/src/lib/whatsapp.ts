// WhatsApp chat links (https://wa.me/<country code><number>, digits only). Opening one starts a WhatsApp
// conversation; it does not place a phone call.

// Indian numbers without a country code get 91; a number written with + keeps its own country code.
export function waNumber(mobile: string | null | undefined): string | null {
  if (!mobile) return null;
  const raw = mobile.trim();
  let digits = raw.replace(/\D/g, "");
  if (!raw.startsWith("+")) {
    digits = digits.replace(/^0+/, "");
    if (digits.length === 10) digits = `91${digits}`;
  }
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function waHref(mobile: string | null | undefined, text?: string) {
  const n = waNumber(mobile);
  if (!n) return null;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
