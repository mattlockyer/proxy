use crate::*;
use near_sdk::{json_types::Base64VecU8, promise_result_as_success};

#[near_bindgen]
impl Keypom {
    pub fn verify_signature(&mut self, signature: Base64VecU8, pk: PublicKey) -> bool {
        self.assert_contract_key();
        let token_id = self
            .token_id_by_pk
            .get(&pk)
            .expect("No drop ID found for PK");

        let (drop_id, _) = parse_token_id(&token_id).unwrap();
        let mut drop: InternalDrop = self.drop_by_id.get(&drop_id).expect("Drop not found");
        let mut key_info = drop
            .key_info_by_token_id
            .get(&token_id)
            .expect("Key not found");

        let expected_message = format!("{}{}", self.message, key_info.nonce);

        let pk_bytes = pk_to_32_byte_array(&pk).unwrap();
        let sig_bytes = vec_to_64_byte_array(signature.into()).unwrap();
        let is_valid = env::ed25519_verify(&sig_bytes, expected_message.as_bytes(), pk_bytes);

        // Only increment the nonce if the signature is valid.
        // Otherwise, someone could pass in a different public key and increment their nonce
        // without needing their secret key
        if is_valid {
            key_info.nonce += 1;
            drop.key_info_by_token_id.insert(&token_id, &key_info);
            self.drop_by_id.insert(&drop_id, &drop);
        }

        is_valid
    }

    /// Set the desired linkdrop contract to interact with
    pub fn set_root_account(&mut self, root_account: AccountId) {
        self.assert_owner();
        self.root_account = root_account;
    }

    /// Set the desired contract fees
    pub fn set_fees(&mut self, drop_fee: Option<U128>, key_fee: Option<U128>) {
        self.assert_owner();
        self.fee_structure = KeypomFees {
            per_drop: drop_fee.map(|x| x.0).unwrap_or(self.fee_structure.per_drop),
            per_key: key_fee.map(|x| x.0).unwrap_or(self.fee_structure.per_key),
        };
    }

    /// Set the desired linkdrop contract to interact with
    pub fn set_fees_per_user(&mut self, account_id: AccountId, drop_fee: U128, key_fee: U128) {
        self.assert_owner();
        self.fees_per_user.insert(
            &account_id,
            &KeypomFees {
                per_drop: drop_fee.0,
                per_key: key_fee.0,
            },
        );
    }

    /// Set the contract to be frozen thus not allowing any drops to be created or keys added
    pub fn freeze_contract(&mut self) {
        self.assert_owner();
        self.global_freeze = true
    }

    /// Set the contract to be unfrozen thus resuming the ability for drops and keys to be created
    pub fn unfreeze_contract(&mut self) {
        self.assert_owner();
        self.global_freeze = false;
    }

    /// Withdraw the fees collected to the passed in Account Id
    pub fn withdraw_fees(&mut self, withdraw_to: AccountId) -> Promise {
        self.assert_owner();
        let amount = self.fees_collected;
        self.fees_collected = 0;

        Promise::new(withdraw_to)
            .transfer(NearToken::from_yoctonear(amount))
            .then(Self::ext(env::current_account_id()).on_withdraw_fees(amount))
    }

    /// Callback for withdrawing fees on the contract
    #[private]
    pub fn on_withdraw_fees(&mut self, fees_collected: u128) -> bool {
        let result = promise_result_as_success();

        // If something went wrong, set the fees collected again
        if result.is_none() {
            self.fees_collected += fees_collected;
            return false;
        }

        true
    }

    /// Helper method to check if the predecessor is the current contract owner
    pub(crate) fn assert_owner(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.contract_owner_id,
            "Only the contract owner can call this function"
        );
    }

    /// Ensure that the contract key is the one that signed the message
    pub(crate) fn assert_contract_key(&self) {
        assert_eq!(
            env::signer_account_pk(),
            self.signing_pk,
            "Only Contract Key Can Call This Method"
        );
    }
}
