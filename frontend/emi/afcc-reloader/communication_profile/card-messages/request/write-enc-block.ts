import { ApduCommandReq } from "../../messages/request/apdu-command-req";
import { Commons } from "../../../utils/commons";
import { CypherAes } from "../../../utils/cypher-aes-service";

export class WriteEncBlock extends ApduCommandReq {

  constructor(bNr, cardAuthObj, data, cypherAes) {
    // Generate the initial vector to encrypt the data using the ti concatenated with the readcounter
    // and the writeCounter repeated 3 times
    let iv = [];
    iv = iv.concat(cardAuthObj.ti);
    for (let i = 0; i < 3; i++) {
      iv = iv.concat(Array.from(Commons.concatenate(
        new Uint8Array(Commons.toBytesInt16(cardAuthObj.readCounter).buffer),
        new Uint8Array(Commons.toBytesInt16(cardAuthObj.writeCounter).buffer),
      )));
    }
    const cardCypher = new CypherAes();
    cardCypher.config(cardAuthObj.keyEnc, Array.from(iv));
    const encryptedData = cardCypher.encrypt(data);

    // convert the writeCounter to bytes
    const writeCounterByte = new Uint8Array(
      Commons.toBytesInt16(cardAuthObj.writeCounter).buffer
    );
    // convert the block to bytes
    const blockByte = new Uint8Array(Commons.toBytesInt16(bNr).buffer);
    // convert the ti to bytes
    const tiByte = new Uint8Array(cardAuthObj.ti);
    // 0xA1 = write encrypted command in the card
    const adpuWriteCommand = new Uint8Array([0xa1]);
    // build the data to generate the cmac
    const cmacReadData = Commons.concatenate(
      adpuWriteCommand,
      writeCounterByte,
      tiByte,
      blockByte,
      encryptedData
    );
    const requestCmac = Array.from(
      cypherAes.aesCmac(new Uint8Array(cardAuthObj.keyMac), cmacReadData)
    );
    // get on unpair values from the generated cmac
    const pairDataCmac = [];
    for (let i = 0; i < requestCmac.length; i++) {
      if (i % 2 !== 0) {
        pairDataCmac.push(requestCmac[i]);
      }
    }
    // build the data of the apdu command
    const apduCommandData = Commons.concatenate(adpuWriteCommand, blockByte, encryptedData, new Uint8Array(pairDataCmac));
    super(apduCommandData);
  }

}

