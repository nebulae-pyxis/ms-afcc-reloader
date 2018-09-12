import { DataBlockResponse } from "../../data-block-resp";


export class DeviceUiidResp extends DataBlockResponse {
  constructor(responseList) {
    super(responseList, false);
  }
}
