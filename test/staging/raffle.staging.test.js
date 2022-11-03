const { expect, assert } = require("chai");
const { getNamedAccounts, ethers, network } = require("hardhat");
const { developmentChains } = require("../../helper-hardhat-config");

developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle staging test", () => {
      let raffle, raffleEnteranceFee, deployer;

      beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer;
        raffle = await ethers.getContract("Raffle", deployer);
        raffleEnteranceFee = await raffle.getEntranceFee();
      });

      describe("fulfillRandomWords", () => {
        it("works with the live ChainLink Keepers VRF, we get a random winner", async () => {
          const startingTimestamp = await raffle.getLatestTimeStamp();
          const accounts = await ethers.getSigners();
          await new Promise(async (resolve, reject) => {
            raffle.once("winnerPicked", async () => {
              console.log("WinnerPicked event fired");
              try {
                const recentWinner = await raffle.getRecentWinner();
                const raffleState = await raffle.getRaffleState();
                const winnerEndingBalance = await accounts[0].getBalence();
                const endingTimeStamp = await raffle.getLatestTimeStamp();
                await expect(raffle.getPlayer(0)).to.be.reverted;
                assert.equal(recentWinner.toString(), accounts[0].address);
                assert.equal(raffleState, 0);
                assert.equal(
                  winnerEndingBalance,
                  winnerStartingBalance.add(raffleEnteranceFee).toString()
                );
                assert(endingTimeStamp > startingTimestamp);
                resolve();
              } catch (error) {
                reject(error);
              }
            });

            await raffle.enterRaffle({ value: raffleEnteranceFee });
            const winnerStartingBalance = await accounts[0].getBalence();
          });
        });
      });
    });
