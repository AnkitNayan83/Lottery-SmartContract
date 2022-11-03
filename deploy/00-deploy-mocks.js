const { network, ethers } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

const BASE_FEE = ethers.utils.parseEther("0.25");
// 0.25eth is the premium it cost 0.25 eth to make a request
const GAS_PRICE_LINK = 1e9;
//calculated value based on the current gas price

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chianId = network.config.chainId;
  const args = [BASE_FEE, GAS_PRICE_LINK];

  if (developmentChains.includes(network.name)) {
    log("Local network detected... !Deploying mocks");
    //deploy our mocks
    await deploy("VRFCoordinatorV2Mock", {
      from: deployer,
      log: true,
      args: args,
    });
    log("mocks deployed!!");
    log("------------------------------------------------");
  }
};

module.exports.tags = ["all", "mocks"];
