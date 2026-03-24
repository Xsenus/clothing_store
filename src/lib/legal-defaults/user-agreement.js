import userAgreementText from "../../../seed/legal/user-agreement.txt?raw";
import { normalizeLegalText } from "./normalize";

export const USER_AGREEMENT = normalizeLegalText(userAgreementText);
