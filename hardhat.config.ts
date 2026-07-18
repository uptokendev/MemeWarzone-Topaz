import "@nomicfoundation/hardhat-toolbox";
import "hardhat-contract-sizer";
import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";

dotenv.config();

const bscTestnetRpcUrl = process.env.BSC_TESTNET_RPC_URL || process.env.BSC_TESTNET_RPC || "";
const privateKey = process.env.PRIVATE_KEY_DEPLOY || process.env.DEPLOYER_PK || "";
const normalizedPrivateKey = privateKey && privateKey.startsWith("0x") ? privateKey : privateKey ? `0x${privateKey}` : "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    bscTestnet: {
      url: bscTestnetRpcUrl,
      chainId: 97,
      accounts: normalizedPrivateKey ? [normalizedPrivateKey] : []
    }
  },
  etherscan: {
    apiKey: {
      bscTestnet: process.env.BSCSCAN_API_KEY || ""
    },
    customChains: [
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com"
        }
      }
    ]
  },
  contractSizer: {
    runOnCompile: false,
    strict: false
  }
};

export default config;
