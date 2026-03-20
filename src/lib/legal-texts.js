import privacyPolicyText from '../../seed/legal/privacy-policy.txt?raw';
import userAgreementText from '../../seed/legal/user-agreement.txt?raw';
import publicOfferText from '../../seed/legal/public-offer.txt?raw';
import cookieConsentText from '../../seed/legal/cookie-consent.txt?raw';

const normalizeLegalText = (text) => String(text || '').replace(/\r\n/g, '\n').trim();

export const PRIVACY_POLICY = normalizeLegalText(privacyPolicyText);
export const USER_AGREEMENT = normalizeLegalText(userAgreementText);
export const PUBLIC_OFFER = normalizeLegalText(publicOfferText);
export const COOKIE_CONSENT_TEXT = normalizeLegalText(cookieConsentText);
