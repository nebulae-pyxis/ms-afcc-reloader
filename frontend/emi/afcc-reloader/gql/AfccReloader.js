import gql from 'graphql-tag';

// We use the gql tag to parse our query string into a query document

//Hello world sample, please remove
export const reloadAfcc = gql`
  mutation getVoltageInRangeOfTime($input: AfccReloadInput) {
    reloadAfcc(input: $input) {
      code
      message
    }
  }
`;
