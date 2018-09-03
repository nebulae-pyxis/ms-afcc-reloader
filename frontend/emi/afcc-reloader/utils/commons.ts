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
}
