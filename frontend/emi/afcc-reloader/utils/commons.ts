export class Commons {
  public static concatenate(...arrays) {
    let totalLength = 0;
    for (const arr of arrays) {
      if (arr) {
        totalLength += arr.length;
      }
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      if (arr) {
        result.set(arr, offset);
        offset += arr.length;
      }
    }
    return result;
  }
  public static toBytesInt16(num) {
    const arr = new ArrayBuffer(2); // an Int16 takes 4 bytes
    const view = new DataView(arr);
    view.setUint16(0, num, true); // byteOffset = 0; litteEndian = true
    return view;
  }
}
