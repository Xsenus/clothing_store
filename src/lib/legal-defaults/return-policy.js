import returnPolicyText from "../../../seed/legal/return-policy.txt?raw";
import { normalizeLegalText } from "./normalize";

export const RETURN_POLICY = normalizeLegalText(returnPolicyText);
