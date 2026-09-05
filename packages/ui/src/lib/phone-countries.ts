// ABOUTME: Country dial-code list for the phone field's country-code selector.
// ABOUTME: name + ISO code + international dial code + flag emoji, plus helpers.

export interface PhoneCountry {
  iso: string; // ISO 3166-1 alpha-2
  name: string;
  dial: string; // international dial code WITHOUT the leading '+'
  flag: string; // emoji
}

// Broad list covering every region. Not exhaustive of every territory, but the
// number field still accepts free text so any code can be typed manually.
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'FR', name: 'France', dial: '33', flag: '🇫🇷' },
  { iso: 'GB', name: 'United Kingdom', dial: '44', flag: '🇬🇧' },
  { iso: 'US', name: 'United States', dial: '1', flag: '🇺🇸' },
  { iso: 'CA', name: 'Canada', dial: '1', flag: '🇨🇦' },
  { iso: 'DE', name: 'Germany', dial: '49', flag: '🇩🇪' },
  { iso: 'ES', name: 'Spain', dial: '34', flag: '🇪🇸' },
  { iso: 'IT', name: 'Italy', dial: '39', flag: '🇮🇹' },
  { iso: 'PT', name: 'Portugal', dial: '351', flag: '🇵🇹' },
  { iso: 'IE', name: 'Ireland', dial: '353', flag: '🇮🇪' },
  { iso: 'NL', name: 'Netherlands', dial: '31', flag: '🇳🇱' },
  { iso: 'BE', name: 'Belgium', dial: '32', flag: '🇧🇪' },
  { iso: 'LU', name: 'Luxembourg', dial: '352', flag: '🇱🇺' },
  { iso: 'CH', name: 'Switzerland', dial: '41', flag: '🇨🇭' },
  { iso: 'AT', name: 'Austria', dial: '43', flag: '🇦🇹' },
  { iso: 'DK', name: 'Denmark', dial: '45', flag: '🇩🇰' },
  { iso: 'SE', name: 'Sweden', dial: '46', flag: '🇸🇪' },
  { iso: 'NO', name: 'Norway', dial: '47', flag: '🇳🇴' },
  { iso: 'FI', name: 'Finland', dial: '358', flag: '🇫🇮' },
  { iso: 'IS', name: 'Iceland', dial: '354', flag: '🇮🇸' },
  { iso: 'PL', name: 'Poland', dial: '48', flag: '🇵🇱' },
  { iso: 'CZ', name: 'Czechia', dial: '420', flag: '🇨🇿' },
  { iso: 'SK', name: 'Slovakia', dial: '421', flag: '🇸🇰' },
  { iso: 'HU', name: 'Hungary', dial: '36', flag: '🇭🇺' },
  { iso: 'RO', name: 'Romania', dial: '40', flag: '🇷🇴' },
  { iso: 'BG', name: 'Bulgaria', dial: '359', flag: '🇧🇬' },
  { iso: 'GR', name: 'Greece', dial: '30', flag: '🇬🇷' },
  { iso: 'HR', name: 'Croatia', dial: '385', flag: '🇭🇷' },
  { iso: 'SI', name: 'Slovenia', dial: '386', flag: '🇸🇮' },
  { iso: 'RS', name: 'Serbia', dial: '381', flag: '🇷🇸' },
  { iso: 'UA', name: 'Ukraine', dial: '380', flag: '🇺🇦' },
  { iso: 'RU', name: 'Russia', dial: '7', flag: '🇷🇺' },
  { iso: 'TR', name: 'Türkiye', dial: '90', flag: '🇹🇷' },
  { iso: 'EE', name: 'Estonia', dial: '372', flag: '🇪🇪' },
  { iso: 'LV', name: 'Latvia', dial: '371', flag: '🇱🇻' },
  { iso: 'LT', name: 'Lithuania', dial: '370', flag: '🇱🇹' },
  { iso: 'MT', name: 'Malta', dial: '356', flag: '🇲🇹' },
  { iso: 'CY', name: 'Cyprus', dial: '357', flag: '🇨🇾' },
  { iso: 'MX', name: 'Mexico', dial: '52', flag: '🇲🇽' },
  { iso: 'BR', name: 'Brazil', dial: '55', flag: '🇧🇷' },
  { iso: 'AR', name: 'Argentina', dial: '54', flag: '🇦🇷' },
  { iso: 'CL', name: 'Chile', dial: '56', flag: '🇨🇱' },
  { iso: 'CO', name: 'Colombia', dial: '57', flag: '🇨🇴' },
  { iso: 'PE', name: 'Peru', dial: '51', flag: '🇵🇪' },
  { iso: 'VE', name: 'Venezuela', dial: '58', flag: '🇻🇪' },
  { iso: 'EC', name: 'Ecuador', dial: '593', flag: '🇪🇨' },
  { iso: 'BO', name: 'Bolivia', dial: '591', flag: '🇧🇴' },
  { iso: 'UY', name: 'Uruguay', dial: '598', flag: '🇺🇾' },
  { iso: 'PY', name: 'Paraguay', dial: '595', flag: '🇵🇾' },
  { iso: 'CR', name: 'Costa Rica', dial: '506', flag: '🇨🇷' },
  { iso: 'PA', name: 'Panama', dial: '507', flag: '🇵🇦' },
  { iso: 'GT', name: 'Guatemala', dial: '502', flag: '🇬🇹' },
  { iso: 'CU', name: 'Cuba', dial: '53', flag: '🇨🇺' },
  { iso: 'MA', name: 'Morocco', dial: '212', flag: '🇲🇦' },
  { iso: 'DZ', name: 'Algeria', dial: '213', flag: '🇩🇿' },
  { iso: 'TN', name: 'Tunisia', dial: '216', flag: '🇹🇳' },
  { iso: 'LY', name: 'Libya', dial: '218', flag: '🇱🇾' },
  { iso: 'EG', name: 'Egypt', dial: '20', flag: '🇪🇬' },
  { iso: 'SN', name: 'Senegal', dial: '221', flag: '🇸🇳' },
  { iso: 'CI', name: "Côte d'Ivoire", dial: '225', flag: '🇨🇮' },
  { iso: 'GH', name: 'Ghana', dial: '233', flag: '🇬🇭' },
  { iso: 'NG', name: 'Nigeria', dial: '234', flag: '🇳🇬' },
  { iso: 'CM', name: 'Cameroon', dial: '237', flag: '🇨🇲' },
  { iso: 'GA', name: 'Gabon', dial: '241', flag: '🇬🇦' },
  { iso: 'CG', name: 'Congo', dial: '242', flag: '🇨🇬' },
  { iso: 'CD', name: 'DR Congo', dial: '243', flag: '🇨🇩' },
  { iso: 'KE', name: 'Kenya', dial: '254', flag: '🇰🇪' },
  { iso: 'TZ', name: 'Tanzania', dial: '255', flag: '🇹🇿' },
  { iso: 'UG', name: 'Uganda', dial: '256', flag: '🇺🇬' },
  { iso: 'RW', name: 'Rwanda', dial: '250', flag: '🇷🇼' },
  { iso: 'ET', name: 'Ethiopia', dial: '251', flag: '🇪🇹' },
  { iso: 'MG', name: 'Madagascar', dial: '261', flag: '🇲🇬' },
  { iso: 'MZ', name: 'Mozambique', dial: '258', flag: '🇲🇿' },
  { iso: 'ZM', name: 'Zambia', dial: '260', flag: '🇿🇲' },
  { iso: 'ZW', name: 'Zimbabwe', dial: '263', flag: '🇿🇼' },
  { iso: 'BW', name: 'Botswana', dial: '267', flag: '🇧🇼' },
  { iso: 'NA', name: 'Namibia', dial: '264', flag: '🇳🇦' },
  { iso: 'ZA', name: 'South Africa', dial: '27', flag: '🇿🇦' },
  { iso: 'SC', name: 'Seychelles', dial: '248', flag: '🇸🇨' },
  { iso: 'MU', name: 'Mauritius', dial: '230', flag: '🇲🇺' },
  { iso: 'CV', name: 'Cabo Verde', dial: '238', flag: '🇨🇻' },
  { iso: 'AE', name: 'United Arab Emirates', dial: '971', flag: '🇦🇪' },
  { iso: 'SA', name: 'Saudi Arabia', dial: '966', flag: '🇸🇦' },
  { iso: 'QA', name: 'Qatar', dial: '974', flag: '🇶🇦' },
  { iso: 'KW', name: 'Kuwait', dial: '965', flag: '🇰🇼' },
  { iso: 'IL', name: 'Israel', dial: '972', flag: '🇮🇱' },
  { iso: 'JO', name: 'Jordan', dial: '962', flag: '🇯🇴' },
  { iso: 'LB', name: 'Lebanon', dial: '961', flag: '🇱🇧' },
  { iso: 'IR', name: 'Iran', dial: '98', flag: '🇮🇷' },
  { iso: 'IQ', name: 'Iraq', dial: '964', flag: '🇮🇶' },
  { iso: 'IN', name: 'India', dial: '91', flag: '🇮🇳' },
  { iso: 'PK', name: 'Pakistan', dial: '92', flag: '🇵🇰' },
  { iso: 'BD', name: 'Bangladesh', dial: '880', flag: '🇧🇩' },
  { iso: 'LK', name: 'Sri Lanka', dial: '94', flag: '🇱🇰' },
  { iso: 'NP', name: 'Nepal', dial: '977', flag: '🇳🇵' },
  { iso: 'CN', name: 'China', dial: '86', flag: '🇨🇳' },
  { iso: 'HK', name: 'Hong Kong', dial: '852', flag: '🇭🇰' },
  { iso: 'TW', name: 'Taiwan', dial: '886', flag: '🇹🇼' },
  { iso: 'JP', name: 'Japan', dial: '81', flag: '🇯🇵' },
  { iso: 'KR', name: 'South Korea', dial: '82', flag: '🇰🇷' },
  { iso: 'TH', name: 'Thailand', dial: '66', flag: '🇹🇭' },
  { iso: 'VN', name: 'Vietnam', dial: '84', flag: '🇻🇳' },
  { iso: 'PH', name: 'Philippines', dial: '63', flag: '🇵🇭' },
  { iso: 'ID', name: 'Indonesia', dial: '62', flag: '🇮🇩' },
  { iso: 'MY', name: 'Malaysia', dial: '60', flag: '🇲🇾' },
  { iso: 'SG', name: 'Singapore', dial: '65', flag: '🇸🇬' },
  { iso: 'AU', name: 'Australia', dial: '61', flag: '🇦🇺' },
  { iso: 'NZ', name: 'New Zealand', dial: '64', flag: '🇳🇿' },
  { iso: 'FJ', name: 'Fiji', dial: '679', flag: '🇫🇯' },
  { iso: 'PG', name: 'Papua New Guinea', dial: '675', flag: '🇵🇬' },
];

// Longest-dial-prefix match on an E.164-ish string (e.g. "+33612..." -> FR).
export const findCountryByDial = (
  value: string
): PhoneCountry | null => {
  const digits = value.trim().replace(/^\+/, '').replace(/\D/g, '');
  if (digits.length === 0) {
    return null;
  }
  let best: PhoneCountry | null = null;
  for (const country of PHONE_COUNTRIES) {
    if (digits.startsWith(country.dial)) {
      if (!best || country.dial.length > best.dial.length) {
        best = country;
      }
    }
  }
  return best;
};

// A phone value is "valid enough" when, ignoring separators, it is a sensible
// run of digits (optionally +-prefixed). Per-country length rules are out of
// scope; this catches obvious garbage without rejecting real formats.
export const isValidPhone = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return true;
  }
  if (!/^\+?[0-9\s().-]+$/.test(trimmed)) {
    return false;
  }
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 15;
};
