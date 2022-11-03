//Raffle

//Enter the lottery
// Pick a random winner
// Winner to be selected after a particular amount of time
//Chain Link Oracle -> Randomness,Automated Execution

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";
import "hardhat/console.sol";

error Raffle__notEnoughEth();
error Raffle__failedTransaction();
error Raffle__Notopen();
error Raffle__UpkeepNotNeeded(
    uint256 currentBalance,
    uint256 numPlayers,
    uint256 raffleState
);

/**@title A Sample Lottery Contract
 * @author Ankit Nayan
 * @notice This contract is used to create a lottery contract whiech will  select random winner
 * @dev This implements the chainlink vrf version 2
 */
contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /* Type Declaration */
    enum RaffleState {
        OPEN,
        CALCULATING
    }

    //State variables
    uint256 private immutable i_entranceFee;
    address payable[] private s_players;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private i_keyHash;
    uint64 private immutable i_subscriptionId;
    uint32 private immutable i_callbackGasLimit;
    uint16 private constant requestConfirmations = 3;
    uint32 private constant numWords = 1;

    //lottery variables
    address private s_recentWinner;
    RaffleState private s_raffleState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;

    // Events
    event RaffleEnter(address indexed player);
    event RequestedRaffleWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed previousWinner);

    /**Functions */
    constructor(
        uint256 entranceFee,
        address vrfCoordinatorV2, //contract address
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_keyHash = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    /**@dev This function allows user to enter the contest
     * To enter the contest they have to pay some fee
     * If the fee is less than required then we will revert
     * To enter raffle state of raffle should be open
     */
    function enterRaffle() public payable {
        if (msg.value < i_entranceFee) {
            revert Raffle__notEnoughEth();
        }
        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle__Notopen();
        }
        s_players.push(payable(msg.sender));
        emit RaffleEnter(msg.sender);
    }

    /**
     * @dev This function that chainlink keepers call to
     * check whether they need to perform upkeep or not
     * This function will return true ony if thease conditions are specified
     * 1. The state of the lottery should be open
     * 2. Amount of time passed should be greater than interval
     * 3. There should be atleast one player
     * 4. Implicity, your subscription is funded with LINK.
     */
    function checkUpkeep(
        bytes memory /*checkData*/
    )
        public
        view
        override
        returns (
            bool upkeepNeeded,
            bytes memory /*performData*/
        )
    {
        bool isOpen = (RaffleState.OPEN == s_raffleState);
        bool timePassed = (block.timestamp - s_lastTimeStamp) > i_interval;
        bool hasPlyers = (s_players.length > 0);
        bool hasBalance = address(this).balance > 0;
        upkeepNeeded = (isOpen && timePassed && hasPlyers && hasBalance);
    }

    /**
     * @dev This function will execute when checkupkeep will return true
     * After that chainLink VRF will get a random number
     */
    function performUpkeep(
        bytes calldata /*data */
    ) external override {
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Raffle__UpkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_keyHash, //gasLane
            i_subscriptionId, //fund to oracle nodes
            requestConfirmations, //Number of blocks to wait
            i_callbackGasLimit, //gas cap
            numWords //number of random words
        );
        emit RequestedRaffleWinner(requestId);
    }

    /**
     * @dev In this function a random winner is selected
     * with the help of random number
     * After that we reset some state
     * Then we pay the Winner
     */
    function fulfillRandomWords(
        uint256, /*requestId*/ //we are not using this parameter
        uint256[] memory randomWords
    ) internal override {
        uint256 indexedOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexedOfWinner];
        s_recentWinner = recentWinner;
        s_raffleState = RaffleState.OPEN;
        s_players = new address payable[](0);
        s_lastTimeStamp = 0;
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if (!success) {
            revert Raffle__failedTransaction();
        }
        emit WinnerPicked(recentWinner);
    }

    /* view || Pure functions*/
    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    function getNumWords() public pure returns (uint256) {
        return numWords;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConfirmation() public pure returns (uint256) {
        return requestConfirmations;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}
