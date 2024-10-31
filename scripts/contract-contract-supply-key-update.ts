import { ethers } from "hardhat";
import {
    Client,
    TokenInfoQuery,
    PrivateKey,
    AccountId,
    TokenId,
} from "@hashgraph/sdk";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    console.log("\n🚀 Starting Key Manager update process...");

    if (!process.env.OPERATOR_KEY || !process.env.OPERATOR_ID || !process.env.TOKEN_ID || !process.env.KEY_MANAGER_1_ADDRESS) {
        throw new Error("Please check .env file for required variables");
    }

    const keyManager1Address = process.env.KEY_MANAGER_1_ADDRESS;
    console.log(`Using KeyManager1 address: ${keyManager1Address}`);

    // Initialize Hedera SDK client
    const operatorKey = PrivateKey.fromStringECDSA(process.env.OPERATOR_KEY);
    const operatorId = AccountId.fromString(process.env.OPERATOR_ID);
    const tokenId = TokenId.fromString(process.env.TOKEN_ID);

    const client = Client.forTestnet()
        .setOperator(operatorId, operatorKey);

    // Query initial token info
    console.log("\n📊 Querying initial token info...");
    let initialTokenInfo = await new TokenInfoQuery()
        .setTokenId(tokenId)
        .execute(client);

    console.log(`Current supply key: ${initialTokenInfo.supplyKey?.toString()}`);
    console.log(`Current total supply: ${initialTokenInfo.totalSupply.toString()}`);

    // Deploy KeyManagerV2 contract
    console.log("\n📄 Deploying KeyManagerV2 contract...");
    const KeyManager = await ethers.getContractFactory("KeyManager");
    const keyManagerV2 = await KeyManager.deploy();
    await keyManagerV2.waitForDeployment();
    const keyManagerV2Address = await keyManagerV2.getAddress();
    console.log(`✅ KeyManagerV2 deployed to: ${keyManagerV2Address}`);

    // Get the token address in the correct format
    const tokenAddress = tokenId.toSolidityAddress();
    const formattedTokenAddress = ethers.getAddress(
        tokenAddress.startsWith('0x') ? tokenAddress : '0x' + tokenAddress
    );

    // Connect to KeyManager1 contract
    console.log("\n🔗 Connecting to KeyManager1 contract...");
    const [signer] = await ethers.getSigners();
    const keyManager1 = KeyManager.attach(keyManager1Address).connect(signer);

    console.log("\n📝 Preparing transaction...");
    console.log(`Token Address: ${formattedTokenAddress}`);
    console.log(`New Key Manager Address: ${keyManagerV2Address}`);

    try {
        // Create the key structure exactly like the working test
        const updateKey = [
            false, // inheritAccountKey
            '0x0000000000000000000000000000000000000000', // contractId
            '0x', // ed25519
            keyManagerV2Address, // ECDSA_secp256k1
            '0x0000000000000000000000000000000000000000', // delegatableContractId
        ];

        console.log("\n🔄 Calling updateTokenKeysPublic...");
        console.log("Key structure:", updateKey);

        const tx = await keyManager1.updateTokenKeysPublic(
            formattedTokenAddress,
            [[4, updateKey]], // Note: using array of [keyType, updateKey]
            { gasLimit: 1000000 }
        );

        console.log(`Transaction sent! Hash: ${tx.hash}`);
        const receipt = await tx.wait();

        // Parse logs to find response code
        const responseCodeEvent = receipt.logs
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
            .find(event => event?.name === "ResponseCode");

        if (responseCodeEvent) {
            const responseCode = responseCodeEvent.args.responseCode;
            if (responseCode === 22n) {
                console.log("✅ Key update successful!");
            } else {
                console.log(`❌ Key update failed with response code: ${responseCode}`);
            }
        }

        // Test minting with KeyManagerV2
        console.log("\n💰 Testing mint functionality with KeyManagerV2...");
        try {
            const mintAmount = 5000n;
            console.log(`Attempting to mint ${mintAmount} tokens...`);

            const mintTx = await keyManagerV2.connect(signer).mintTokens(
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
                const mintResponseCode = mintEvent.args.responseCode;
                if (mintResponseCode === 22n) {
                    console.log(`✅ Successfully minted ${mintAmount} tokens!`);
                } else {
                    console.log(`❌ Minting failed with response code: ${mintResponseCode}`);
                }
            }
        } catch (error: any) {
            console.error("Error during minting:", error);
        }

        // Query final token info
        console.log("\n📊 Querying final token info...");
        const finalTokenInfo = await new TokenInfoQuery()
            .setTokenId(tokenId)
            .execute(client);

        console.log("\n📊 Final Configuration:");
        console.log(`Token ID: ${tokenId.toString()}`);
        console.log(`Token Address (EVM): ${tokenId.toSolidityAddress()}`);
        console.log(`KeyManager2 Address: ${keyManagerV2Address}`);
        console.log(`Initial supply: ${initialTokenInfo.totalSupply.toString()}`);
        console.log(`Final supply: ${finalTokenInfo.totalSupply.toString()}`);
        console.log(`Final supply key: ${finalTokenInfo.supplyKey?.toString()}`);

    } catch (error: any) {
        console.error("\n❌ Transaction failed!");
        console.error("Error details:", {
            message: error.message,
            code: error.code,
            reason: error.reason
        });
        if (error.transaction) {
            console.log("\nTransaction attempt details:");
            console.log("From:", error.transaction.from);
            console.log("To:", error.transaction.to);
            console.log("Data:", error.transaction.data || "No data");
        }
        throw error;
    }

    await client.close();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });