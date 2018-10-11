import gql from 'graphql-tag';

// We use the gql tag to parse our query string into a query document

export const reloadAfcc = gql`
  mutation reloadAfcc($input: AfccReloadInput) {
    reloadAfcc(input: $input) {
      code
      message
    }
  }
`;

export const getMasterKeyReloader = gql`
  query {
    getMasterKeyReloader {
      code
      key
    }
  }
`;

export const getRndAAuthCard = gql`
  query getRndAAuthCard(
    $uid: String
    $postId: String
    $data: String
    $key: Int
  ) {
    getRndAAuthCard(uid: $uid, postId: $postId, data: $data, key: $key) {
      samid
      timestamp
      data
    }
  }
`;

export const getAuthConfirmation = gql`
  query getAuthConfirmation($samId: String, $postId: String, $data: String) {
    getAuthConfirmation(samId: $samId, postId: $postId, data: $data) {
      samid
      timestamp
      data
    }
  }
`;

export const getAfccOperationConfig = gql`
query getAfccOperationConfig($system: String, $type: String){
  getAfccOperationConfig(system: $system, type: $type){
    system
    type
    keys{
      key
      value
    }
    mappingVersion{
      key
      block
      byte
    }
    readFlow{
      key
      instructionSet
    }
    mapping{
       key
      value{
       key
      	value{
          block
          initPos
          endPos
        }
      }
    }
  }
}
`;
