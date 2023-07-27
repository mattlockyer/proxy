use crate::*;

/// Helper function to loop through events and log them.
pub(crate) fn log_events(events: Vec<EventLog>) {
    for event in events {
        // Log the serialized json.
        env::log_str(&event.to_string());
    }
}


/// Whenever a new key is added on the contract, we should add the logs to both
/// An NFT mint and add key vector so that those events can be fired once the
/// Key additions are finalized.
pub fn add_new_key_logs(
    nft_mint_logs: &mut Vec<NftMintLog>,
    add_key_logs: &mut Vec<AddOrDeleteKeyLog>,
    token_owner: &AccountId,
    drop_id: &String,
    pk: &PublicKey,
    token_id: &TokenId,
    key_metadata: &Option<String>
) {
    nft_mint_logs.push(NftMintLog {
        owner_id: token_owner.to_string(),
        token_ids: vec![token_id.to_string()],
        memo: None,
    });
    add_key_logs.push(AddOrDeleteKeyLog {
        owner_id: token_owner.to_string(),
        drop_id: drop_id.to_string(),
        public_key: pk.into(),
        metadata: key_metadata.clone()
    });
}

/// Whenever a key is deleted on the contract, we should add the logs to both
/// An NFT burn and delete key vector so that those events can be fired once the
/// Key deltions are finalized.
pub fn add_delete_key_logs(
    nft_burn_logs: &mut Vec<NftBurnLog>,
    delete_key_logs: &mut Vec<AddOrDeleteKeyLog>,
    token_owner: &AccountId,
    drop_id: &String,
    pk: &PublicKey,
    token_id: &TokenId,
    key_metadata: &Option<String>
) {
    nft_burn_logs.push(NftBurnLog {
        owner_id: token_owner.to_string(),
        token_ids: vec![token_id.to_string()],
        authorized_id: None,
        memo: None,
    });
    delete_key_logs.push(AddOrDeleteKeyLog {
        owner_id: token_owner.to_string(),
        drop_id: drop_id.to_string(),
        public_key: pk.into(),
        metadata: key_metadata.clone()
    });
}


