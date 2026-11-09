export type UnsubscribeLang = 'tr' | 'en';

/** Turkish for browsers set to Turkish, English for everyone else. */
export function pickLang(languages: readonly string[] | undefined): UnsubscribeLang {
  return (languages ?? []).some((l) => l.toLowerCase().startsWith('tr')) ? 'tr' : 'en';
}

export interface UnsubscribeText {
  title: string;
  question: (sender: string | null) => string;
  address: (hint: string) => string;
  confirm: string;
  working: string;
  done: string;
  already: string;
  invalid: string;
  error: string;
  retry: string;
  loading: string;
}

export const TEXT: Record<UnsubscribeLang, UnsubscribeText> = {
  tr: {
    title: 'E-posta aboneliği',
    question: (s) => (s ? `${s} e-postalarını almak istemiyor musunuz?` : 'Bu e-postaları almak istemiyor musunuz?'),
    address: (h) => `Adres: ${h}`,
    confirm: 'Abonelikten çık',
    working: 'İşleniyor…',
    done: 'Abonelikten çıktınız. Bu adrese artık e-posta gönderilmeyecek.',
    already: 'Bu adres zaten abonelikten çıkmış.',
    invalid: 'Bu bağlantı geçersiz veya artık kullanılamıyor.',
    error: 'Bir sorun oluştu. Lütfen biraz sonra tekrar deneyin.',
    retry: 'Tekrar dene',
    loading: 'Yükleniyor…',
  },
  en: {
    title: 'Email subscription',
    question: (s) => (s ? `Do you want to stop receiving emails from ${s}?` : 'Do you want to stop receiving these emails?'),
    address: (h) => `Address: ${h}`,
    confirm: 'Unsubscribe',
    working: 'Working…',
    done: 'You are unsubscribed. No more emails will be sent to this address.',
    already: 'This address is already unsubscribed.',
    invalid: 'This link is invalid or no longer available.',
    error: 'Something went wrong. Please try again in a moment.',
    retry: 'Try again',
    loading: 'Loading…',
  },
};
