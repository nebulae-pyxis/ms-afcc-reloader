import { DeviceMessageResp } from './device-message-resp';

export class DataBlockResponse extends DeviceMessageResp {
  constructor(dataBytes, messageAuth) {
    super();
    // GENERAL MESSAGE EXTACT
    this.startByte = new Uint8Array([dataBytes[0]]);
    this.len = this.uint8ArrayToInt(dataBytes.slice(1, 3));
    this.check = new Uint8Array([dataBytes[3 + this.len]]);
    this.stopByte = new Uint8Array([dataBytes[dataBytes.length]]);
    // DATABLOCK EXTRACT
    this.cmdMessageType = dataBytes[3].toString(16);
    this.lengh = this.uint8ArrayToInt(dataBytes.slice(4, 6));
    this.slot = new Uint8Array([dataBytes[6]]);
    this.seq = new Uint8Array([dataBytes[7]]);
    this.param = new Uint8Array([dataBytes[8]]);
    this.checkSum = new Uint8Array([dataBytes[9]]);
    if (messageAuth) {
      this.data = new Uint8Array(dataBytes.slice(15, (15 + (this.lengh - 5))));
    }
    else {
      this.data = new Uint8Array(dataBytes.slice(10, (10 + (this.lengh))));
    }
  }

  cmdMessageType: String;
  lengh: number;
  slot: Uint8Array;
  seq: Uint8Array;
  param: Uint8Array;
  checkSum: Uint8Array;
  data: Uint8Array;

  private uint8ArrayToInt(data) {
    // Create a buffer
    const buf = new ArrayBuffer(8);
    // Create a data view of it
    const view = new DataView(buf);

    // set bytes
    data.forEach(function (b, i) {
      view.setUint8(i, b);
    });
    return new DataView(view.buffer).getInt16(0, false);
  }
}
