
/* Autogenerated file, do not edit! */

/* eslint-disable */
import {
  AztecAddress,
  AztecAddressLike,
  CompleteAddress,
  Contract,
  ContractArtifact,
  ContractBase,
  ContractFunctionInteraction,
  ContractMethod,
  DeployMethod,
  EthAddress,
  EthAddressLike,
  FieldLike,
  Fr,
  Point,
  PublicKey,
  Wallet,
} from '@aztec/aztec.js';
import TokenContractArtifactJson from './Token.json' assert { type: 'json' };
export const TokenContractArtifact = TokenContractArtifactJson as ContractArtifact;

/**
 * Type-safe interface for contract Token;
 */
export class TokenContract extends ContractBase {
  
  private constructor(
    completeAddress: CompleteAddress,
    wallet: Wallet,
    portalContract = EthAddress.ZERO
  ) {
    super(completeAddress, TokenContractArtifact, wallet, portalContract);
  }
  

  
  /**
   * Creates a contract instance.
   * @param address - The deployed contract's address.
   * @param wallet - The wallet to use when interacting with the contract.
   * @returns A promise that resolves to a new Contract instance.
   */
  public static async at(
    address: AztecAddress,
    wallet: Wallet,
  ) {
    return Contract.at(address, TokenContract.artifact, wallet) as Promise<TokenContract>;
  }

  
  /**
   * Creates a tx to deploy a new instance of this contract.
   */
  public static deploy(wallet: Wallet, admin: AztecAddressLike) {
    return new DeployMethod<TokenContract>(Point.ZERO, wallet, TokenContractArtifact, Array.from(arguments).slice(1));
  }

  /**
   * Creates a tx to deploy a new instance of this contract using the specified public key to derive the address.
   */
  public static deployWithPublicKey(publicKey: PublicKey, wallet: Wallet, admin: AztecAddressLike) {
    return new DeployMethod<TokenContract>(publicKey, wallet, TokenContractArtifact, Array.from(arguments).slice(2));
  }
  

  
  /**
   * Returns this contract's artifact.
   */
  public static get artifact(): ContractArtifact {
    return TokenContractArtifact;
  }
  

  /** Type-safe wrappers for the public methods exposed by the contract. */
  public methods!: {
    
    /** _increase_public_balance(to: struct, amount: field) */
    _increase_public_balance: ((to: AztecAddressLike, amount: FieldLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** _increment_num_shields() */
    _increment_num_shields: (() => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** _initialize(new_admin: struct) */
    _initialize: ((new_admin: AztecAddressLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** _reduce_total_supply(amount: field) */
    _reduce_total_supply: ((amount: FieldLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** admin() */
    admin: (() => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** balance_of_private(owner: struct) */
    balance_of_private: ((owner: AztecAddressLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** balance_of_public(owner: struct) */
    balance_of_public: ((owner: AztecAddressLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** burn(from: struct, amount: field, nonce: field) */
    burn: ((from: AztecAddressLike, amount: FieldLike, nonce: FieldLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** burn_public(from: struct, amount: field, nonce: field) */
    burn_public: ((from: AztecAddressLike, amount: FieldLike, nonce: FieldLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** compute_note_hash_and_nullifier(contract_address: field, nonce: field, storage_slot: field, serialized_note: array) */
    compute_note_hash_and_nullifier: ((contract_address: FieldLike, nonce: FieldLike, storage_slot: FieldLike, serialized_note: FieldLike[]) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** is_minter(minter: struct) */
    is_minter: ((minter: AztecAddressLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** mint_private(amount: field, secret_hash: field) */
    mint_private: ((amount: FieldLike, secret_hash: FieldLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** mint_public(to: struct, amount: field) */
    mint_public: ((to: AztecAddressLike, amount: FieldLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** num_shields() */
    num_shields: (() => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** redeem_shield(to: struct, amount: field, secret: field) */
    redeem_shield: ((to: AztecAddressLike, amount: FieldLike, secret: FieldLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** set_admin(new_admin: struct) */
    set_admin: ((new_admin: AztecAddressLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** set_minter(minter: struct, approve: boolean) */
    set_minter: ((minter: AztecAddressLike, approve: boolean) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** shield(from: struct, amount: field, secret_hash: field, nonce: field) */
    shield: ((from: AztecAddressLike, amount: FieldLike, secret_hash: FieldLike, nonce: FieldLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** total_supply() */
    total_supply: (() => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** transfer(from: struct, to: struct, amount: field, nonce: field) */
    transfer: ((from: AztecAddressLike, to: AztecAddressLike, amount: FieldLike, nonce: FieldLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** transfer_public(from: struct, to: struct, amount: field, nonce: field) */
    transfer_public: ((from: AztecAddressLike, to: AztecAddressLike, amount: FieldLike, nonce: FieldLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** unshield(from: struct, to: struct, amount: field, nonce: field) */
    unshield: ((from: AztecAddressLike, to: AztecAddressLike, amount: FieldLike, nonce: FieldLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;
  };
}
