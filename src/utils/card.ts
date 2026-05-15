import { toRequestResponse } from "./types";
import { lookupBin } from "card-bin-db";

export class Card{
  
  async cardBinCheck(bin: string | undefined) {
    if (bin) {
      const info=await lookupBin(bin);
      return toRequestResponse(true, info)
    }else{
      return toRequestResponse(false, "Please provide a valid bin")
    }
  }
}