export const LIMITS = {
  /** how many multisigs a public key can be part of. */
  maxMultisigsPerPublicKey: 50,
  /** how many external proposers a multisig can have. */
  maxProposersPerMultisig: 5,
  /** The maximum expiry for signed messages we receive */
  maxSignatureExpiry: 60 * 60 * 1000,
  /** The maximum number of proposals to return per page. */
  maxProposalsPerPage: 100,
};
