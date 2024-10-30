import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            },
            viaIR: true
        }
    },
    networks: {
        testnet: {
            url: process.env.TESTNET_ENDPOINT || "https://testnet.hashio.io/api",
            accounts: process.env.OPERATOR_KEY ? [process.env.OPERATOR_KEY] : [],
            chainId: 296
        }
    }
};

export default config;