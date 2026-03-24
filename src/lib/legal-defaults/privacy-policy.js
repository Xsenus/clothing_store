import privacyPolicyText from "../../../seed/legal/privacy-policy.txt?raw";
import { normalizeLegalText } from "./normalize";

export const PRIVACY_POLICY = normalizeLegalText(privacyPolicyText);
