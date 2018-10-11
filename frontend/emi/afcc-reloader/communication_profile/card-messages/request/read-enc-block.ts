import { ApduCommandReq } from "../../messages/request/apdu-command-req";
import { Commons } from "../../../utils/commons";

export class ReadEncBlock extends ApduCommandReq {

  constructor(bNr, extm, cardAuthObj, cypherAes) {
    const readCounterByte = new Uint8Array(
      Commons.toBytesInt16(cardAuthObj.readCounter).buffer
    );
    const blockByte = new Uint8Array(Commons.toBytesInt16(bNr).buffer);
    const tiByte = new Uint8Array(cardAuthObj.ti);
    const adpuReadCommand = new Uint8Array([0x31]);
    const extByte = new Uint8Array([extm]);
    const cmacReadData = Commons.concatenate(
      adpuReadCommand,
      readCounterByte,
      tiByte,
      blockByte,
      extByte
    );
    const requestCmac = Array.from(
      cypherAes.aesCmac(new Uint8Array(cardAuthObj.keyMac), cmacReadData)
    );
    const pairDataCmac = [];
    for (let i = 0; i < requestCmac.length; i++) {
      if (i % 2 !== 0) {
        pairDataCmac.push(requestCmac[i]);
      }
    }
    const apduCommandData = Commons.concatenate(adpuReadCommand, blockByte, extByte, new Uint8Array(pairDataCmac));
    super(apduCommandData);
  }


}

