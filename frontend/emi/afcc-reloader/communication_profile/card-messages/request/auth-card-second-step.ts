
import { ApduCommandReq } from "../../messages/request/apdu-command-req";

export class AuthCardSecondtStep  extends ApduCommandReq {

  constructor(data) {
    super(data);
  }

}
