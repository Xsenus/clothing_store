import publicOfferText from "../../../seed/legal/public-offer.txt?raw";
import { normalizeLegalText } from "./normalize";

export const PUBLIC_OFFER = normalizeLegalText(publicOfferText);
