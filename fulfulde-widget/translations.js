const EXAMPLE_GLOSSARY = new Map([
  ["bonjour", "Jam waali"],
  ["merci", "Jaraama"],
  ["mon compte", "Konto am"],
  ["solde disponible", "Ndeɗɗam ngoodi"],
  ["historique", "Toppitagol"],
  ["transfert d'argent", "Neldugol ceede"],
  ["paiement", "Yoɓugol"],
  ["retrait", "Ɓoggugol ceede"],
  ["bienvenue", "A jaɓɓaama"]
]);

/**
 * Local demo-only phrase glossary. Financial terminology and dialect vary;
 * native Fulfulde review is required before shipping these entries.
 */
export function translateLocally(texts) {
  return texts.map((text) => {
    const trimmed = text.trim();
    const translation = EXAMPLE_GLOSSARY.get(trimmed.toLocaleLowerCase("fr"));
    if (!translation) return text;
    const leading = text.match(/^\s*/)?.[0] ?? "";
    const trailing = text.match(/\s*$/)?.[0] ?? "";
    const first = trimmed[0];
    const translated = /^[A-ZÀ-Þ]/.test(first)
      ? translation.charAt(0).toLocaleUpperCase("ff") + translation.slice(1)
      : translation;
    return `${leading}${translated}${trailing}`;
  });
}
