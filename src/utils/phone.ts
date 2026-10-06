export function formatE164(phone: string): { jid: string; cleanNumber: string; isValid: boolean } {
  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }

  const isValid = cleaned.length >= 10 && cleaned.length <= 15 && cleaned.startsWith('62');
  const jid = `${cleaned}@s.whatsapp.net`;

  return {
    jid,
    cleanNumber: cleaned,
    isValid
  };
}
