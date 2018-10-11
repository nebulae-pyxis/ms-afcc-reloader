import { DataBlockResponse } from "../../data-block-resp";
import { Commons } from "../../../utils/commons";
import { CypherAes } from "../../../utils/cypher-aes";


export class ReadEncBlockResp extends DataBlockResponse {
  constructor(responseList, bNr, extm, cardAuthObj, cypherAes: CypherAes) {
    super(responseList, false);
    cardAuthObj.readCounter++;
    if (this.data[0] !== 0x90) {
      throw new Error('Error reading block card');
    }
    const cmacResp = Array.from(this.data).slice(-8);
    const dataCard = Array.from(this.data).slice(1, -8);
    const cmacReadData = Commons.concatenate(
      new Uint8Array([this.data[0]]),
      new Uint8Array(Commons.toBytesInt16(cardAuthObj.readCounter).buffer),
      new Uint8Array(cardAuthObj.ti),
      new Uint8Array(Commons.toBytesInt16(bNr).buffer),
      new Uint8Array([extm]),
      new Uint8Array(dataCard)
    );
    const responseCmac = Array.from(
      cypherAes.aesCmac(new Uint8Array(cardAuthObj.keyMac), cmacReadData)
    );
    const cmacToCompare = [];
    for (let i = 0; i < responseCmac.length; i++) {
      if (i % 2 !== 0) {
        cmacToCompare.push(responseCmac[i]);
      }
    }
    if (cypherAes.bytesTohex(cmacResp) !== cypherAes.bytesTohex(cmacToCompare)) {
      throw new Error('Invalid cmac resp');
    }

    let iv = [];
    for (let i = 0; i < 3; i++) {
      iv = iv.concat(Array.from(Commons.concatenate(
        new Uint8Array(Commons.toBytesInt16(cardAuthObj.readCounter).buffer),
        new Uint8Array(Commons.toBytesInt16(cardAuthObj.writeCounter).buffer),
      )));
    }
    iv = iv.concat(cardAuthObj.ti);
    const cardCypher = new CypherAes();
    cardCypher.config(cardAuthObj.keyEnc, Array.from(iv));
    this.data = cardCypher.decrypt(new Uint8Array(dataCard));

  }
}
