const { assert, expect } = require("chai");
const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config");

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle", () => {
      let raffle,
        vrfCoordinatorV2Mock,
        raffleEnteranceFee,
        contract_deployer,
        interval;
      const chainId = network.config.chainId;

      beforeEach(async () => {
        const { deployer } = await getNamedAccounts();
        contract_deployer = deployer;
        await deployments.fixture(["all"]);
        raffle = await ethers.getContract("Raffle", deployer);
        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        );
        raffleEnteranceFee = await raffle.getEntranceFee();
        interval = await raffle.getInterval();
      });

      describe("constructor", () => {
        it("should initialize raffle contract", async () => {
          const raffleState = await raffle.getRaffleState();
          assert.equal(raffleState.toString(), "0");

          const interval = await raffle.getInterval();
          const required_interval = networkConfig[chainId].interval;
          assert.equal(interval.toString(), required_interval);
        });
      });

      describe("enterRaffle", () => {
        it("should revert if enterence fee is less than minimum amount", async () => {
          await expect(raffle.enterRaffle()).to.be.revertedWith(
            "Raffle__notEnoughEth"
          );
        });

        it("records player when they enter", async () => {
          await raffle.enterRaffle({ value: raffleEnteranceFee });
          //As the deployer is enterin the raffle
          //so the players array should only contain deployer
          //at 0th index
          const player = await raffle.getPlayer(0);
          assert.equal(contract_deployer, player);
        });

        it("emits an event on enter", async () => {
          //To check emit of an event we need name of the contract
          // and the event name
          await expect(
            raffle.enterRaffle({ value: raffleEnteranceFee })
          ).to.emit(raffle, "RaffleEnter");
        });

        //For this test we need to make the state of our raffle close
        //For that we will trigger performUpkeep method
        //For performer keep to work we need to make checkUpkeep return true
        it("doesnt allow user to enter if the raffle is calculating", async () => {
          await raffle.enterRaffle({ value: raffleEnteranceFee });
          //evm_increaseTime allow us to increase time block time
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          await raffle.performUpkeep([]);
          await expect(
            raffle.enterRaffle({ value: raffleEnteranceFee })
          ).to.be.revertedWith("Raffle__Notopen");
        });
      });

      describe("checkUpkeep", () => {
        it("returns false if people haven't send enough ETH", async () => {
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          //callStatic simulate this function without making any transaction
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
          assert(!upkeepNeeded);
        });

        it("returns fasle if state of raffle is not open", async () => {
          await raffle.enterRaffle({ value: raffleEnteranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          await raffle.performUpkeep([]);
          const raffleState = await raffle.getRaffleState();
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
          assert.equal(raffleState.toString() == "1", upkeepNeeded == false);
        });

        it("return false if time passed is less than interval", async () => {
          await raffle.enterRaffle({ value: raffleEnteranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() - 5,
          ]); // use a higher number here if this test fails
          await network.provider.send("evm_mine", []);
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
          assert(!upkeepNeeded);
        });

        it("returns true is time has passed,enough player,eth and is open", async () => {
          await raffle.enterRaffle({ value: raffleEnteranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
          assert(upkeepNeeded);
        });
      });

      describe("performUpkeep", () => {
        it("can only run if checkUpkeep is true", async () => {
          await raffle.enterRaffle({ value: raffleEnteranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const res = await raffle.performUpkeep([]);
          assert(res);
        });

        it("reverts if checkUpkeep is false", async () => {
          await expect(raffle.performUpkeep([])).to.be.revertedWith(
            "Raffle__UpkeepNotNeeded"
          );
        });
        it("updates the state of raffle,requestId and emits an event", async () => {
          await raffle.enterRaffle({ value: raffleEnteranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const res = await raffle.performUpkeep([]);
          const recipt = await res.wait(1);
          const state = await raffle.getRaffleState();
          const requestId = recipt.events[1].args.requestId;
          assert(requestId.toNumber() > 0);
          assert(state == 1);
        });
      });

      describe("fulfillRandomWords", () => {
        beforeEach(async () => {
          await raffle.enterRaffle({ value: raffleEnteranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
        });
        it("can only be called after performUpkeep", async () => {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
          ).to.be.revertedWith("nonexistent request");
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
          ).to.be.revertedWith("nonexistent request");
        });
        it.only("should pick a winner,reset and send money", async () => {
          const additionalEntrance = 3;
          const startingEnterance = 1; //0 is deployer;
          const accounts = await ethers.getSigners();
          for (
            let i = startingEnterance;
            i < additionalEntrance + startingEnterance;
            i++
          ) {
            const connectedAccounts = raffle.connect(accounts[i]);
            await connectedAccounts.enterRaffle({ value: raffleEnteranceFee });
          }
          const startingTimestamp = await raffle.getLatestTimeStamp();
          await new Promise(async (resolve, reject) => {
            raffle.once("WinnerPicked", async () => {
              console.log("--------------------------------");
              try {
                const recentWinner = await raffle.getRecentWinner();
                const raffleState = await raffle.getRaffleState();
                const endingTimeStamp = await raffle.getLatestTimeStamp();
                const numPlayers = await raffle.getNumberOfPlayers();
                assert.equal(numPlayers.toString(), "0");
                assert.equal(raffleState.toString(), "0");
                console.log(endingTimeStamp, startingTimestamp);
                assert.equal(
                  winnerBalance.toString(),
                  startingBalance // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                    .add(
                      raffleEnteranceFee
                        .mul(additionalEntrance)
                        .add(raffleEnteranceFee)
                    )
                    .toString()
                );
                assert(endingTimeStamp > startingTimestamp);
                resolve();
              } catch (error) {
                reject(error);
              }
            });
            const tx = await raffle.performUpkeep([]);
            const txRecipt = await tx.wait(1);
            await vrfCoordinatorV2Mock.fulfillRandomWords(
              txRecipt.events[1].args.requestId,
              raffle.address
            );
          });
        });
      });
    });
