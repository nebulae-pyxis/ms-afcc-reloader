import { DataBlockResponse } from "../../data-block-resp";


export class DeviceConnectionStatus extends DataBlockResponse {
  constructor(responseList) {
    super(responseList, false);
  }
}
