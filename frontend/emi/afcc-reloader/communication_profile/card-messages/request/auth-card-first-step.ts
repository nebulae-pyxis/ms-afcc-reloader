import { ApduCommandReq } from "../../messages/request/apdu-command-req";

export class AuthCardFirstStep  extends ApduCommandReq {

  constructor(data) {
    super(data);
  }

}
