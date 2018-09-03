export class DeviceMessageReq {
  startByte: Uint8Array;
  len: Uint8Array;
  check: Uint8Array;
  stopByte: Uint8Array;

  constructor() {
    this.startByte = new Uint8Array([0x05]);
    this.stopByte = new Uint8Array([0x0A]);
  }
}
