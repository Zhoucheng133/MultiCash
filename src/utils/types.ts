export interface RequestResponse {
  ok: boolean;
  data: any;
}

export function toRequestResponse(ok: boolean, data: any): RequestResponse {
  return {
    ok,
    data,
  };
}