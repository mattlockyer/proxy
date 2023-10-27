import anyTest, { TestFn } from "ava";
import { NEAR, NearAccount, Worker } from "near-workspaces";
import { CONTRACT_METADATA, LARGE_GAS, WALLET_GAS, claimWithRequiredGas, doesDropExist, doesKeyExist, functionCall, generateKeyPairs } from "../utils/general";
const { readFileSync } = require('fs')
import { oneGtNear, sendFTs, totalSupply } from "../utils/ft-utils";
import { ExtDrop } from "../utils/types";

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
    await root.deploy(`./__tests__/ext-wasm/linkdrop.wasm`);
    
    // Init the 3 contracts
    await root.call(root, 'new', {});
    await keypom.call(keypom, 'new', { root_account: 'test.near', owner_id: keypom, contract_metadata: CONTRACT_METADATA });

    // Test users
    const ali = await root.createSubAccount('ali');
    const funder = await root.createSubAccount('funder');
    const bob = await root.createSubAccount('bob');
    
    let keypomBalance = await keypom.balance();
    console.log('keypom available INITIAL: ', keypomBalance.available.toString())
    console.log('keypom staked INITIAL: ', keypomBalance.staked.toString())
    console.log('keypom stateStaked INITIAL: ', keypomBalance.stateStaked.toString())
    console.log('keypom total INITIAL: ', keypomBalance.total.toString())

    // Save state for test runs
    t.context.worker = worker;
    t.context.accounts = { root, keypom, funder, ali, bob };
});

// If the environment is reused, use test.after to replace test.afterEach
test.afterEach(async t => {
    await t.context.worker.tearDown().catch(error => {
        console.log('Failed to tear down the worker:', error);
    });
});

const TERA_GAS = 1000000000000;

test('Modifying Allowlist', async t => {
    const { keypom, nftContract, funder, ali, bob } = t.context.accounts;
    

    const dropId = "drop-id";

    let {keys, publicKeys} = await generateKeyPairs(2);
    await functionCall({
        signer: funder,
        receiver: keypom,
        methodName: 'create_drop',
        args: {
            drop_id: dropId,
            asset_data: [{
                assets: [null],
                uses: 1
            }],
            key_data: [
                {
                    public_key: publicKeys[0]
                }
            ],
        },
        attachedDeposit: NEAR.parse("1").toString()
    })

    let keysForDrop = await keypom.view('get_key_supply_for_drop', {drop_id: dropId});
    console.log('keysForDrop: ', keysForDrop)
    t.is(keysForDrop, 1)
    t.is(await doesKeyExist(keypom, publicKeys[0]), true)

    let dropInfo: ExtDrop = await keypom.view('get_drop_information', {drop_id: dropId});
    console.log('dropInfo: ', dropInfo)
    t.is(dropInfo.drop_config?.add_key_allowlist, undefined);

    await functionCall({
        signer: funder,
        receiver: keypom,
        methodName: "add_to_sale_allowlist",
        args:{
            drop_id: dropId,
            account_ids: [ali.accountId]
        },
        attachedDeposit: NEAR.parse("1").toString()
    })

    dropInfo = await keypom.view('get_drop_information', {drop_id: dropId});
    console.log('dropInfo: ', dropInfo)
    t.deepEqual(dropInfo.drop_config?.add_key_allowlist, ["ali.test.near"])

    await functionCall({
        signer: funder,
        receiver: keypom,
        methodName: "add_to_sale_allowlist",
        args:{
            drop_id: dropId,
            account_ids: [bob.accountId]
        },
        attachedDeposit: NEAR.parse("1").toString()
    })

    dropInfo = await keypom.view('get_drop_information', {drop_id: dropId});
    console.log('dropInfo: ', dropInfo)
    t.deepEqual(dropInfo.drop_config?.add_key_allowlist, ["ali.test.near", "bob.test.near"])

    console.log("NOW REMOVING")

    await functionCall({
        signer: funder,
        receiver: keypom,
        methodName: "remove_from_sale_allowlist",
        args:{
            drop_id: dropId,
            account_ids: [bob.accountId]
        },
    })

    dropInfo = await keypom.view('get_drop_information', {drop_id: dropId});
    console.log('dropInfo: ', dropInfo)
    t.deepEqual(dropInfo.drop_config?.add_key_allowlist, ["ali.test.near"])

    // // This should pass and none of the user provided args should be used.
    // let result: {response: string | undefined, actualReceiverId: string | undefined} = await claimWithRequiredGas({
    //     keypom,
    //     root: keypom,
    //     keyPair: keys[0],
    //     receiverId: bob.accountId,
    //     fcArgs: [[JSON.stringify({receiver_id: funder.accountId})]]
    // });
    // t.is(result.response == "true", true)
    
});

