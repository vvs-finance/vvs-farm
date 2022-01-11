require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-truffle5");
require("solidity-coverage");

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

module.exports = {
  // This is a sample solc configuration that specifies which version of solc to use
  solidity: {
    compilers: [
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
      {
        version: "0.8.0",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    ]
  },

  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
    },
    development: {
      url: "http://127.0.0.1:8545",
      network_id: "*"
    },
    test: {
      url: "http://127.0.0.1:7545",
      port: 7545,
      network_id: "*"
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
