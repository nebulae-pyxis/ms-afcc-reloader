import { DataBlockResponse } from "./data-block-resp";

export class DeviceMessageResp {
  startByte: Uint8Array;
  len: number;
  dataBlock: DataBlockResponse;
  check: Uint8Array;
  stopByte: Uint8Array;
}
