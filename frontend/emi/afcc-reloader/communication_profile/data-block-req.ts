import { DeviceMessageReq } from './device-message-req';
import { MessageType } from './message-type';
import { DataBlockGenerator } from './data-block-generator';
import { Commons } from '../utils/commons';

export abstract class DataBlockRequest extends DeviceMessageReq
  implements DataBlockGenerator {
  messageType: MessageType;
  param: Uint8Array;
  slot: Uint8Array;
  seq: Uint8Array;
  checkSum: Uint8Array;
  dataBlock;
  constructor(messageType, param?) {
    super();
    this.slot = new Uint8Array([0]);
    this.param = param ? param : new Uint8Array([0x00]);
    this.seq = new Uint8Array([0]);
    this.messageType = messageType;
  }

  generateFormat() {
    const message = Commons.concatenate(
      this.startByte,
      this.getDeviceMessageLenght(),
      this.getDataBlock(),
      this.generateDeviceMessageXOR(),
      this.stopByte
    );
    return message;
  }

  getDataBlock() {
    if (!this.dataBlock) {
      const datablock = Commons.concatenate(
        this.messageTypeToBuffer(),
        this.getDataBlockLenght(),
        this.slot,
        this.seq,
        this.param,
        this.generateDatablockXOR(),
        this.generateData()
      );
      this.dataBlock = datablock;
    }
    return this.dataBlock;
  }
  /**
   * Genarate XOR checksum of General Message
   */
  generateDeviceMessageXOR() {
    const lenVsDatablockXOR = Commons.concatenate(this.getDeviceMessageLenght(), this.getDataBlock());
    const xor = lenVsDatablockXOR.reduce((acc, val) => {
      // tslint:disable-next-line:no-bitwise
      return acc ^ val;
    }, 0
    );
    return new Uint8Array([xor]);
  }
  /**
   * Genarate XOR checksum of Data Block
   */
  generateDatablockXOR() {
    if (this.generateData()) {
      const dataXOR = Commons.concatenate(this.messageTypeToBuffer(),
        this.getDataBlockLenght(),
        this.slot,
        this.seq,
        this.param,
        this.generateData());
      const xor = dataXOR.reduce((acc, val) => {
        // tslint:disable-next-line:no-bitwise
        return acc ^ val;
      }, 0
      );
      return new Uint8Array([xor]);
    } else {
      return undefined;
    }
  }
  /**
   * Get lenght message (Datablock)
   */
  getDeviceMessageLenght() {
    let deviceMessageLenght;
    const size = this.getDataBlock().byteLength;
    if (size > 255) {
      deviceMessageLenght = new Uint8Array([size]);
    } else {
      deviceMessageLenght = new Uint8Array(2);
      deviceMessageLenght[1] = size;
    }
    return deviceMessageLenght;
  }
  /**
   * Get lenght message (data of Datablock)
   */
  getDataBlockLenght() {
    let dataBlockLenght = new Uint8Array([0]);
    let data = this.generateData();
    if (data) {
      data = (data as Uint8Array);
      const size = data.byteLength;
      if (size > 255) {
        dataBlockLenght = new Uint8Array([size]);
      } else {
        dataBlockLenght = new Uint8Array(2);
        dataBlockLenght[1] = size;
      }
    }
    return dataBlockLenght;
  }
  /**
   * Converts enum to byte
   */
  messageTypeToBuffer() {
    const test = 107;
    return new Uint8Array([parseInt(this.messageType, 16)]);
  }
  /**
   * Generate data of dataBlock
   */
  public abstract generateData();

  /**
   * Generate data of dataBlock
   */
  public abstract isEncryptedMessage();
}
