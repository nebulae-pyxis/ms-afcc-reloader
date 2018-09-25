import { DataBlockResponse } from '../../data-block-resp';

export class CardPowerOnResp extends DataBlockResponse {
  constructor(responseList) {
    super(responseList, false);
  }
}
