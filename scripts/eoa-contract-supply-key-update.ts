import { ethers } from "hardhat";
import {
    Client,
    TokenCreateTransaction,
    TokenInfoQuery,
    TokenUpdateTransaction,
    PrivateKey,
    AccountId,
    TokenSupplyType,
    ContractId,
    TokenId,
} from "@hashgraph/sdk";
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

async function getContractIdFromEvmAddress(evmAddress: string): Promise<string> {
    const address = evmAddress.toLowerCase().replace('0x', '');
    const response = await axios.get(
        `https://testnet.mirrornode.hedera.com/api/v1/contracts/${address}`
    );
    return response.data.contract_id;
}

async function main() {
    console.log("\n🚀 Starting initial deployment...");

    // Initialize Hedera SDK client
    const operatorKey = PrivateKey.fromStringECDSA(process.env.OPERATOR_KEY!);
    const operatorId = AccountId.fromString(process.env.OPERATOR_ID!);

    const client = Client.forTestnet()
        .setOperator(operatorId, operatorKey);

    // Deploy KeyManager contract first
    console.log("\n📄 Deploying KeyManager contract...");
    const KeyManager = await ethers.getContractFactory("KeyManager");
    const keyManager = await KeyManager.deploy();
    await keyManager.waitForDeployment();
    const keyManagerAddress = await keyManager.getAddress();
    console.log(`✅ KeyManager deployed to: ${keyManagerAddress}`);

    // Create token using Hedera SDK
    console.log("\n💎 Creating new token...");
    const transaction = new TokenCreateTransaction()
        .setTokenName("Test Token")
        .setTokenSymbol("TST")
        .setDecimals(8)
        .setInitialSupply(1000000)
        .setTreasuryAccountId(operatorId)
        .setSupplyType(TokenSupplyType.Infinite)
        .setAdminKey(operatorKey.publicKey)
        .setSupplyKey(operatorKey.publicKey)
        .freezeWith(client);

    const signedTx = await transaction.sign(operatorKey);
    const response = await signedTx.execute(client);
    const receipt = await response.getReceipt(client);
    const tokenId = receipt.tokenId!;
    console.log(`✅ Token created with ID: ${tokenId.toString()}`);

    // Query initial token info
    console.log("\n📊 Querying initial token info...");
    let tokenInfo = await new TokenInfoQuery()
        .setTokenId(tokenId)
        .execute(client);

    console.log(`Initial supply key: ${tokenInfo.supplyKey?.toString()}`);
    console.log(`Initial total supply: ${tokenInfo.totalSupply.toString()}`);

    // Wait for mirror node to index the contract
    console.log("\n⏳ Waiting for mirror node to index contract...");
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Get contract ID from mirror node
    console.log("\n🔍 Querying mirror node for contract ID...");
    const contractIdStr = await getContractIdFromEvmAddress(keyManagerAddress);
    console.log(`Retrieved ContractId: ${contractIdStr}`);

    // Convert the "0.0.xxxx" format to ContractId
    const [shard, realm, num] = contractIdStr.split('.').map(Number);
    const contractId = new ContractId(shard, realm, num);

    // Update token's supply key to the KeyManager contract
    console.log("\n📝 Updating token supply key...");

    try {
        const updateKeyTx = new TokenUpdateTransaction()
            .setTokenId(tokenId)
            .setSupplyKey(contractId)
            .freezeWith(client);

        console.log("Update transaction created...");

        const signedUpdateTx = await updateKeyTx.sign(operatorKey);
        console.log("Transaction signed...");

        const updateResponse = await signedUpdateTx.execute(client);
        console.log("Transaction submitted...");

        const updateReceipt = await updateResponse.getReceipt(client);
        console.log(`Update status: ${updateReceipt.status.toString()}`);

    } catch (error) {
        console.error("Error during token update:", error);
        throw error;
    }

    // Wait for mirror node to index the changes
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Test minting with the KeyManager contract
    console.log("\n💰 Testing mint functionality with KeyManager contract...");
    const [signer] = await ethers.getSigners();
    const keyManagerContract = new ethers.Contract(
        keyManagerAddress,
        KeyManager.interface,
        signer
    );

    try {
        const mintAmount = 5000n;
        console.log(`Attempting to mint ${mintAmount} tokens...`);

        const tokenAddress = tokenId.toSolidityAddress();
        const formattedTokenAddress = ethers.getAddress(
            tokenAddress.startsWith('0x') ? tokenAddress : '0x' + tokenAddress.padStart(40, '0')
        );

        const mintTx = await keyManagerContract.mintTokens(
            formattedTokenAddress,
            mintAmount,
            { gasLimit: 1000000 }
        );

        console.log("Mint transaction submitted, waiting for confirmation...");
        const mintReceipt = await mintTx.wait();

        const mintEvent = mintReceipt.logs
            .map(log => {
                try {
                    return KeyManager.interface.parseLog({
                        topics: [...log.topics],
                        data: log.data
                    });
                } catch (e) {
                    return null;
                }
            })
            .find(event => event?.name === "TokenMintComplete");

        if (mintEvent) {
            const responseCode = Number(mintEvent.args.responseCode);
            if (responseCode === 22) {
                console.log(`✅ Successfully minted ${mintAmount} tokens!`);
            } else {
                console.log(`❌ Minting failed with response code: ${responseCode}`);
            }
        }
    } catch (error) {
        console.error("Error during minting:", error);
    }

    // Query final token info
    console.log("\n📊 Querying final token info...");
    const finalTokenInfo = await new TokenInfoQuery()
        .setTokenId(tokenId)
        .execute(client);

    console.log("\n✅ Deployment complete!");
    console.log("📊 Final Configuration:");
    console.log(`Token ID: ${tokenId.toString()}`);
    console.log(`Token Address (EVM): ${tokenId.toSolidityAddress()}`);
    console.log(`KeyManager Address: ${keyManagerAddress}`);
    console.log(`KeyManager ContractId: ${contractIdStr}`);
    console.log(`Final supply key: ${finalTokenInfo.supplyKey?.toString()}`);
    console.log(`Initial supply: ${tokenInfo.totalSupply.toString()}`);
    console.log(`Final supply: ${finalTokenInfo.totalSupply.toString()}`);

    // Save to .env for next script
    console.log("\n💾 Add these values to your .env file:");
    console.log(`TOKEN_ID=${tokenId.toString()}`);
    console.log(`KEY_MANAGER_1_ADDRESS=${keyManagerAddress}`);

    await client.close();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });