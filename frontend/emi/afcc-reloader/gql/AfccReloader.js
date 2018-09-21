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
query getRndAAuthCard($uid: String, $postId: String, $data: String){
  getRndAAuthCard(uid: $uid, postId: $postId, data: $data){
    samid
    timestamp
    data
  }
}
`;
