import anyTest, { TestFn } from "ava";
import { NEAR, NearAccount, Worker } from "near-workspaces";
import { CONTRACT_METADATA, LARGE_GAS, WALLET_GAS, claimWithRequiredGas, doesDropExist, doesKeyExist, functionCall, generateKeyPairs } from "../utils/general";
const { readFileSync } = require('fs')
import { oneGtNear, sendFTs, totalSupply } from "../utils/ft-utils";

const test = anyTest as TestFn<{
    worker: Worker;
    accounts: Record<string, NearAccount>;
    keypomInitialBalance: NEAR;
    keypomInitialStateStaked: NEAR;
}>;

test.beforeEach(async (t) => {
    // Comment this if you want to see console logs
    //console.log = function() {}

    // Init the worker and start a Sandbox server
    const worker = await Worker.init();

    // Prepare sandbox for tests, create accounts, deploy contracts, etc.
    const root = worker.rootAccount;

    // Deploy all 3 contracts
    const keypom = await root.devDeploy(`./out/keypom.wasm`);
    const nftContract = await root.devDeploy(`./__tests__/ext-wasm/nft-tutorial.wasm`);
    const nftContractNested = await root.devDeploy(`./__tests__/ext-wasm/nested-fields-nft.wasm`);
    await root.deploy(`./__tests__/ext-wasm/linkdrop.wasm`);
    const ftContract1 = await root.createSubAccount('ft_contract_1');
    await ftContract1.deploy(`./__tests__/ext-wasm/ft.wasm`);
    
    // Init the 3 contracts
    await root.call(root, 'new', {});
    await keypom.call(keypom, 'new', { root_account: 'test.near', owner_id: keypom, contract_metadata: CONTRACT_METADATA });
    await nftContract.call(nftContract, 'new_default_meta', { owner_id: nftContract });
    await nftContractNested.call(nftContractNested, 'new_default_meta', { owner_id: nftContractNested });
    await ftContract1.call(ftContract1, 'new_default_meta', { owner_id: ftContract1, total_supply: totalSupply.toString() });

    // Test users
    const ali = await root.createSubAccount('ali');
    const funder = await root.createSubAccount('funder');
    const bob = await root.createSubAccount('bob');

    await functionCall({signer: ftContract1, receiver: ftContract1, methodName: 'storage_deposit', args: {account_id: keypom.accountId},attachedDeposit: NEAR.parse("1").toString(), shouldLog: false})
    await functionCall({signer: ftContract1, receiver: ftContract1, methodName: 'storage_deposit', args: {account_id: funder.accountId},attachedDeposit: NEAR.parse("1").toString(), shouldLog: false})

    await functionCall({signer: ftContract1, receiver: ftContract1, methodName: 'ft_transfer', args: {receiver_id: funder.accountId, amount: NEAR.parse("1000").toString()},attachedDeposit: "1", shouldLog: false})
    
    let keypomBalance = await keypom.balance();
    console.log('keypom available INITIAL: ', keypomBalance.available.toString())
    console.log('keypom staked INITIAL: ', keypomBalance.staked.toString())
    console.log('keypom stateStaked INITIAL: ', keypomBalance.stateStaked.toString())
    console.log('keypom total INITIAL: ', keypomBalance.total.toString())

    let nftBalance = await nftContract.balance();
    console.log('nftContract available INITIAL: ', nftBalance.available.toString())
    console.log('nftContract staked INITIAL: ', nftBalance.staked.toString())
    console.log('nftContract stateStaked INITIAL: ', nftBalance.stateStaked.toString())
    console.log('nftContract total INITIAL: ', nftBalance.total.toString())

    // Save state for test runs
    t.context.worker = worker;
    t.context.accounts = { root, keypom, nftContract, nftContractNested, funder, ftContract1, ali, bob };
});

// If the environment is reused, use test.after to replace test.afterEach
test.afterEach(async t => {
    await t.context.worker.tearDown().catch(error => {
        console.log('Failed to tear down the worker:', error);
    });
});

const TERA_GAS = 1000000000000;

// test('All Funder Tests', async t => {
//     const { keypom, nftContract, funder, ali, bob } = t.context.accounts;

//     let method1 = {
//         receiver_id: nftContract.accountId,
//         method_name: 'nft_mint',
//         args: JSON.stringify({
//             token_id: '1',
//             metadata: {
//                 title: "foo"
//             }
//         }),
//         attached_deposit: NEAR.parse("1").toString(),
//         attached_gas: (20 * TERA_GAS).toString(),
//         keypom_args: {
//             account_id_field: "receiver_id",
//         },
//     }

//     const fcAsset1 = [method1]
    

//     const dropId = "drop-id";

//     let {keys, publicKeys} = await generateKeyPairs(1);
//     await functionCall({
//         signer: funder,
//         receiver: keypom,
//         methodName: 'create_drop',
//         args: {
//             drop_id: dropId,
//             asset_data: [{
//                 assets: [fcAsset1],
//                 uses: 3
//             }],
//             key_data: [
//                 {
//                     public_key: publicKeys[0]
//                 }
//             ],
//         },
//         attachedDeposit: NEAR.parse("21").toString()
//     })

//     // This should pass and none of the user provided args should be used.
//     let result: {response: string | undefined, actualReceiverId: string | undefined} = await claimWithRequiredGas({
//         keypom,
//         root: keypom,
//         keyPair: keys[0],
//         receiverId: bob.accountId,
//         fcArgs: [[JSON.stringify({receiver_id: funder.accountId})]]
//     });
//     t.is(result.response == "true", true)
//     let bobSupply = await nftContract.view('nft_supply_for_owner', {account_id: bob.accountId});
//     console.log('bobSupply: ', bobSupply)
//     t.is(bobSupply, '1');
// });

test('User Preferred Tests', async t => {
    const { keypom, nftContract, funder, ali, bob } = t.context.accounts;

    let method1 = {
        receiver_id: nftContract.accountId,
        method_name: 'nft_mint',
        args: JSON.stringify({
            token_id: '1',
            metadata: {}
        }),
        attached_deposit: NEAR.parse("1").toString(),
        attached_gas: (20 * TERA_GAS).toString(),
        user_args_rule: "UserPreferred",
        keypom_args: {
            account_id_field: "receiver_id",
        },
    }

    const fcAsset1 = [method1]
    

    const dropId = "drop-id";
    let {keys, publicKeys} = await generateKeyPairs(1);
    await functionCall({
        signer: funder,
        receiver: keypom,
        methodName: 'create_drop',
        args: {
            drop_id: dropId,
            asset_data: [{
                assets: [fcAsset1],
                uses: 4
            }],
            key_data: [
                {
                    public_key: publicKeys[0]
                }
            ],
        },
        attachedDeposit: NEAR.parse("21").toString()
    })

    // Should go through with token ID equal to 1
    await claimWithRequiredGas({
        keypom,
        root: keypom,
        keyPair: keys[0],
        receiverId: bob.accountId
    });
    let bobTokens: Array<{token_id: string, metadata: {title: string}}> = await nftContract.view('nft_tokens_for_owner', {account_id: bob.accountId});
    console.log('bobSupply: ', bobTokens)
    t.is(bobTokens[0].token_id, '1');

    // Token ID should be replaced with 2
    await claimWithRequiredGas({
        keypom,
        root: keypom,
        keyPair: keys[0],
        receiverId: bob.accountId,
        fcArgs: [[JSON.stringify({token_id: "2"})]]
    });
    bobTokens = await nftContract.view('nft_tokens_for_owner', {account_id: bob.accountId});
    console.log('bobSupply: ', bobTokens)
    t.is(bobTokens[1].token_id, '2');

    // Token ID should be replaced with 3 and metadata should now be included
    await claimWithRequiredGas({
        keypom,
        root: keypom,
        keyPair: keys[0],
        receiverId: bob.accountId,
        fcArgs: [[JSON.stringify({token_id: "3", metadata: {title: "i injected this"}})]]
    });
    bobTokens = await nftContract.view('nft_tokens_for_owner', {account_id: bob.accountId});
    console.log('bobSupply: ', bobTokens);
    t.is(bobTokens[2].token_id, '3');
    t.is(bobTokens[2].metadata.title, "i injected this");

    // Method should have skipped the function call because receiver ID already exists due to keypom args
    await claimWithRequiredGas({
        keypom,
        root: keypom,
        keyPair: keys[0],
        receiverId: bob.accountId,
        fcArgs: [[JSON.stringify({token_id: "4", receiver_id: ali.accountId})]],
    });
    bobTokens = await nftContract.view('nft_tokens_for_owner', {account_id: bob.accountId});
    console.log('bobSupply: ', bobTokens);
    console.log(bobTokens[3])
    t.is(bobTokens.length, 3);

    const aliTokens: Array<{token_id: string}> = await nftContract.view('nft_tokens_for_owner', {account_id: ali.accountId});
    console.log('aliTokens: ', aliTokens);
    t.is(aliTokens.length, 0);
});

// test('Funder Preferred Tests', async t => {
//     const { keypom, nftContract, funder, ali, bob } = t.context.accounts;

//     let method1 = {
//         receiver_id: nftContract.accountId,
//         method_name: 'nft_mint',
//         args: JSON.stringify({
//             metadata: {
//                 title: "this was here"
//             }
//         }),
//         attached_deposit: NEAR.parse("1").toString(),
//         attached_gas: (20 * TERA_GAS).toString(),
//         user_args_rule: "FunderPreferred",
//         keypom_args: {
//             account_id_field: "receiver_id",
//         },
//     }

//     const fcAsset1 = [method1]

//     const dropId = "drop-id";
//     let {keys, publicKeys} = await generateKeyPairs(1);
//     await functionCall({
//         signer: funder,
//         receiver: keypom,
//         methodName: 'create_drop',
//         args: {
//             drop_id: dropId,
//             asset_data: [{
//                 assets: [fcAsset1],
//                 uses: 4
//             }],
//             key_data: [
//                 {
//                     public_key: publicKeys[0]
//                 }
//             ],
//         },
//         attachedDeposit: NEAR.parse("21").toString()
//     })

//     // Should go through with token ID equal to 1
//     await claimWithRequiredGas({
//         keypom,
//         root: keypom,
//         keyPair: keys[0],
//         receiverId: bob.accountId,
//         fcArgs: [[JSON.stringify({token_id: "1"})]],
//     });
//     let bobTokens: Array<{token_id: string, metadata: {title: string, description: string}}> = await nftContract.view('nft_tokens_for_owner', {account_id: bob.accountId});
//     console.log('bobSupply: ', bobTokens)
//     t.is(bobTokens[0].token_id, '1');

//     // metadata should not be replaced
//     await claimWithRequiredGas({
//         keypom,
//         root: keypom,
//         keyPair: keys[0],
//         receiverId: bob.accountId,
//         fcArgs: [[JSON.stringify({token_id: "2", metadata: {title: "i injected this"}})]],
//     });
//     bobTokens = await nftContract.view('nft_tokens_for_owner', {account_id: bob.accountId});
//     console.log('bobSupply: ', bobTokens)
//     t.is(bobTokens[1].token_id, '2');
//     t.is(bobTokens[1].metadata.title, "this was here");

//     // metadata should have appended fields
//     await claimWithRequiredGas({
//         keypom,
//         root: keypom,
//         keyPair: keys[0],
//         receiverId: bob.accountId,
//         fcArgs: [[JSON.stringify({token_id: "3", metadata: {title: "i injected this", description: "i injected this"}})]],
//     });
//     bobTokens = await nftContract.view('nft_tokens_for_owner', {account_id: bob.accountId});
//     console.log('bobSupply: ', bobTokens)
//     t.is(bobTokens[2].token_id, '3');
//     t.is(bobTokens[2].metadata.title, "this was here");
//     t.is(bobTokens[2].metadata.description, "i injected this");
// });

// test('User Marker Tests', async t => {
//     const { keypom, nftContractNested: nftContract, funder, ali, bob } = t.context.accounts;

//     // More tests:
//     // https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=ad88d2128047a170d744a09d4d61c2db
    
//     let method1 = {
//         receiver_id: nftContract.accountId,
//         method_name: 'nft_mint',
//         args: JSON.stringify({
//             receiver_id: "INSERT_RECEIVER_ID",
//             token_id: 'lower_case',
//             metadata: {
//                 title: "INSERT_TITLE",
//                 description: "INSERT_DESCRIPTION",
//                 nested: "INSERT_NESTED"
//             },
//             long_args: [...readFileSync(`./__tests__/ext-wasm/nested-fields-nft.wasm`)].slice(0, 5000)
//         }),
//         attached_deposit: NEAR.parse("1").toString(),
//         attached_gas: (20 * TERA_GAS).toString(),
//         user_args_rule: "UserPreferred"
//     }

//     const fcAsset1 = [method1]

//     const dropId = "drop-id";
//     const asset_data = [
//         {
//             assets: [fcAsset1],
//             uses: 1
//         }
//     ]

//     let {keys, publicKeys} = await generateKeyPairs(1);
//     await functionCall({
//         signer: funder,
//         receiver: keypom,
//         methodName: 'create_drop',
//         args: {
//             drop_id: dropId,
//             asset_data,
//             key_data: [
//                 {
//                     public_key: publicKeys[0]
//                 }
//             ],
//         },
//         attachedDeposit: NEAR.parse("21").toString()
//     })

//     let fcArgs = {
//         "lower_case": "inserted token id",
//         "INSERT_RECEIVER_ID": ali.accountId,
//         "INSERT_TITLE": "inserted title",
//         "INSERT_DESCRIPTION": "inserted description",
//         "INSERT_NESTED": {
//             "account_id": bob.accountId,
//             "key_id": "0",
//             "funder_id": ali.accountId,
//             "drop_id": "0"
//         }
//     }
//     // This should pass and none of the user provided args should be used.
//     await claimWithRequiredGas({
//         keypom,
//         root: keypom,
//         keyPair: keys[0],
//         receiverId: bob.accountId,
//         fcArgs: [[JSON.stringify(fcArgs)]],
//     });
//     let aliTokens: Array<{token_id: string, metadata: {title: string, description: string, nested: {account_id: string, funder_id: string, key_id: string, drop_id: string}}}> = await nftContract.view('nft_tokens_for_owner', {account_id: ali.accountId});
//     console.log('aliTokens: ', aliTokens)
//     t.is(aliTokens.length, 1);
//     t.is(aliTokens[0].token_id, "lower_case");
//     t.is(aliTokens[0].metadata.title, "inserted title");
//     t.is(aliTokens[0].metadata.description, "inserted description");
//     t.is(aliTokens[0].metadata.nested.account_id, bob.accountId);
//     t.is(aliTokens[0].metadata.nested.funder_id, ali.accountId);
//     t.is(aliTokens[0].metadata.nested.key_id, "0");
//     t.is(aliTokens[0].metadata.nested.drop_id, "0");
// });

// // Blacklisted Functions: nft_transfer, nft_transfer_call, nft_approve, nft_transfer_payout, ft_transfer, ft_transfer_call
// test('Blacklisted Functions and Receivers', async t => {
//     const { keypom, nftContract, funder, ali, bob, ftContract1 } = t.context.accounts;

//     let bannedMethodNames: string[]= ["nft_transfer", "nft_transfer_call", "nft_approve", "nft_transfer_payout", "ft_transfer", "ft_transfer_call"]
//     let bannedMethods: {receiver_id: string, method_name: string, args: string, attached_deposit: string, attached_gas: string}[]=[]
//     // 6 Banned methods + 1 directed to Keypom
//     for(let i = 0; i < bannedMethodNames.length + 1; i++){
//         bannedMethods.push({
//             receiver_id: i < 2 ? nftContract.accountId : i < bannedMethodNames.length ? ftContract1.accountId : keypom.accountId,
//             method_name: i < bannedMethodNames.length ? bannedMethodNames[i] : "create_drop",
//             args: JSON.stringify({}),
//             attached_deposit: "0",
//             attached_gas: (20 * TERA_GAS).toString(),
//         })
//     }

//     const dropId = "drop-id";
//     for(let i = 0; i < bannedMethods.length; i++){
//         let initialBal = await keypom.balance()
//         console.log(`Attempting create_drop with ${bannedMethods[i].method_name} on ${bannedMethods[i].receiver_id}`)
//         try{
//             let {keys, publicKeys} = await generateKeyPairs(1);
//             await functionCall({
//                 signer: funder,
//                 receiver: keypom,
//                 methodName: 'create_drop',
//                 args: {
//                     drop_id: dropId,
//                     asset_data: [{
//                         assets: [bannedMethods[i]],
//                         uses: 1
//                     }],
//                     key_data: [
//                         {
//                             public_key: publicKeys[0]
//                         }
//                     ],
//                 },
//                 attachedDeposit: NEAR.parse("1").toString()
//             })
//             // If create drop succeeds, fail
//             t.fail()
//         }catch{
//             t.is(await doesDropExist(keypom, dropId), false)
//             let finalBal = await keypom.balance()
//             t.deepEqual(finalBal.stateStaked, initialBal.stateStaked);

//         }
//     }
// });