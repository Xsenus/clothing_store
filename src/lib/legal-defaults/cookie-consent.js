import cookieConsentText from "../../../seed/legal/cookie-consent.txt?raw";
import { normalizeLegalText } from "./normalize";

export const COOKIE_CONSENT_TEXT = normalizeLegalText(cookieConsentText);
