const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config.js");
const { assert, expect } = require("chai");
const { network, deployments, ethers } = require("hardhat");
!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle Unit test", function () {
      let raffle,
        vrfCoordinatorV2Mock,
        raffleEntranceFee,
        interval,
        player,
        raffleContract;
      beforeEach(async () => {
        accounts = await ethers.getSigners();
        player = accounts[1];
        await deployments.fixture(["mocks", "raffle"]);
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
        raffleContract = await ethers.getContract("Raffle");
        raffle = raffleContract.connect(player);
        interval = await raffle.getInterval();
        raffleEntranceFee = await raffle.getEntranceFee();
      });
      describe("constuctor", function () {
        it("Initializes Raffle correctly", async () => {
          const raffleState = (await raffle.getRaffleState()).toString();
          assert.equal(raffleState, "0");
          assert.equal(
            interval.toString(),
            networkConfig[network.config.chainId]["keepersUpdateInterval"]
          );
        });
      });
      describe("enterRaffle", function () {
        it("reverts if Raffle is not open", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          await raffle.performUpkeep([]);
          await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be
            .reverted;
        });
        it("Reverts if enough ETH is not send", async () => {
          await expect(raffle.enterRaffle()).to.be.reverted;
        });
        it("Updates players array", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          const myPlayer = await raffle.getPlayer(0);
          assert.equal(myPlayer, player.address);
        });
        it("emits a event on enter", async () => {
          await expect(
            raffle.enterRaffle({ value: raffleEntranceFee })
          ).to.emit(raffle, "RaffleEnter");
        });
      });
      describe("cheUpKeep", function () {
        it("returns false if enough time is not passed", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() - 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
          assert(!upkeepNeeded);
        });
        it("returns false if raffle is not open", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          await raffle.performUpkeep([]);
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
          assert(!upkeepNeeded);
        });
        it("returns false if raffle has no players", async () => {
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
          assert(!upkeepNeeded);
        });
        it("returns false if balance is not enough", async () => {
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
          assert(!upkeepNeeded);
        });
        it("returns true if enough time has passed, has players, eth, and is open", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
          assert(upkeepNeeded);
        });
      });
      describe("performUpKeep", function () {
        it("runs only if checkupkeep is true", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const tx = await raffle.performUpkeep([]);
          assert(tx);
        });
        it("reverts if upKeepNeeded is false", async () => {
          await expect(raffle.performUpkeep("0x")).to.be.reverted;
        });
        it("Updates the raffle state", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          await raffle.performUpkeep([]);
          const state = await raffle.getRaffleState();
          assert.equal(state, "1");
        });
        it("Emits a request ID", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const txResponse = await raffle.performUpkeep("0x");
          const txReceipt = await txResponse.wait(1);
          const requestId = txReceipt.events[1].args.requestId;
          assert(requestId.toNumber() > 0);
        });
      });
      describe("fulfillRandomWords", function () {
        beforeEach(async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
        });
        it("only works if performUpKeep is called", async () => {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
          ).to.be.reverted;
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
          ).to.be.reverted;
        });
        it("picks a winner, resets, and sends money", async () => {
          const startingAccountId = 1;
          const extraAccounts = 3;
          for (
            let i = startingAccountId;
            i < startingAccountId + extraAccounts;
            i++
          ) {
            raffle.connect(accounts[i]);
            await raffle.enterRaffle({ value: raffleEntranceFee });
          }
          const txResponse = await raffle.performUpkeep("0x");
          const txReceipt = await txResponse.wait(1);
          const startingBalance = await accounts[1].getBalance();
          await vrfCoordinatorV2Mock.fulfillRandomWords(
            txReceipt.events[1].args.requestId,
            raffle.address
          );
          const startingTimeStamp = await raffle.getLastTimeStamp();
          await new Promise(async (resolve, reject) => {
            raffle.once("WinnerPicked", async () => {
              try {
                const endingWinnerBalance = await accounts[1].getBalance();
                const recentWinner = await raffle.getRecentWinner();
                const raffleState = await raffle.getRaffleState();
                const endingTimeStamp = await raffle.getLastTimeStamp();
                await expect(raffle.getPlayer(0)).to.be.reverted;
                assert.equal(raffleState, 0);
                assert.equal(recentWinner.toString(), accounts[1].address);
                //assert(endingTimeStamp > startingTimeStamp);
                assert.equal(
                  endingWinnerBalance.toString(),
                  startingBalance
                    .add(
                      raffleEntranceFee
                        .mul(extraAccounts)
                        .add(raffleEntranceFee)
                    )
                    .toString()
                );
                resolve();
              } catch (e) {
                reject(e);
              }
            });
          });
        });
      });
    });
