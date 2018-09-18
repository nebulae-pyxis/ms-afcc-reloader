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
