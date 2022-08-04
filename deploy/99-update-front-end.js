const { ethers, network } = require("hardhat");
const fs = require("fs");
const { id } = require("ethers/lib/utils");
const FRONT_END_ADDRESSES_FILE =
  "../nextjs-smartcontract-lottery/nextjs-blog/constants/contractAddress.json";
const FRONT_END_ABI_FILE =
  "../nextjs-smartcontract-lottery/nextjs-blog/constants/abi.json";

module.exports = async function () {
  if (process.env.UPDATE_FRONT_END) {
    console.log("Updating Front end");
    updateContractAdress();
    updateAbi();
  }
};
async function updateAbi() {
  const raffle = await ethers.getContract("Raffle");
  fs.writeFileSync(
    FRONT_END_ABI_FILE,
    raffle.interface.format(ethers.utils.FormatTypes.json)
  );
}
async function updateContractAdress() {
  const raffle = ethers.getContract("Raffle");
  const chainId = network.config.chainId.toString();
  const contractAdresses = JSON.parse(
    fs.readFileSync(FRONT_END_ADDRESSES_FILE, "utf8")
  );
  if (chainId in contractAdresses) {
    if (!contractAdresses[chainId].includes((await raffle).address)) {
      contractAdresses[chainId].push((await raffle).address);
    }
  } else {
    contractAdresses[chainId] = [raffle.address];
  }
  fs.writeFileSync(FRONT_END_ADDRESSES_FILE, JSON.stringify(contractAdresses));
}

module.exports.tags = ["all", "frontend"];
