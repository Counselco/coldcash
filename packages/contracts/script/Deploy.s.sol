// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {PromiseFactory} from "../src/PromiseFactory.sol";
import {NamedAttestorAdapter} from "../src/oracle/NamedAttestorAdapter.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

/// @dev Minimal mock USDC for rehearsal mode (DEPLOY_MOCK_USDC=true)
contract MockUSDC is IERC20 {
    string public constant name = "Mock USDC";
    uint8  public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external { balanceOf[to] += amt; }

    function approve(address spender, uint256 amt) external returns (bool) {
        allowance[msg.sender][spender] = amt; return true;
    }
    function transfer(address to, uint256 amt) external returns (bool) {
        balanceOf[msg.sender] -= amt; balanceOf[to] += amt; return true;
    }
    function transferFrom(address from, address to, uint256 amt) external returns (bool) {
        allowance[from][msg.sender] -= amt;
        balanceOf[from] -= amt; balanceOf[to] += amt; return true;
    }
}

/// @title Deploy — single-script Sepolia go-live
/// @notice Deploys NamedAttestorAdapter + PromiseFactory with all parameters from env.
/// Rehearsal mode (DEPLOY_MOCK_USDC=true) deploys MockUSDC first and uses its address.
/// Prints machine-readable JSON on completion: {chainId, factory, adapter, usdc}
contract Deploy is Script {
    function run() external {
        // All parameters from env at runtime — no secrets in files
        address attestorAddress = vm.envAddress("ATTESTOR_ADDRESS");
        address usdcAddress     = vm.envOr("USDC_ADDRESS", address(0));
        address feeRecipient    = vm.envAddress("FEE_RECIPIENT");
        bool    deployMockUsdc  = vm.envOr("DEPLOY_MOCK_USDC", false);

        vm.startBroadcast();

        // Rehearsal mode: deploy mock USDC if requested
        if (deployMockUsdc) {
            require(usdcAddress == address(0), "DEPLOY_MOCK_USDC=true but USDC_ADDRESS is set");
            MockUSDC mockUsdc = new MockUSDC();
            usdcAddress = address(mockUsdc);
            console.log("Deployed MockUSDC at:", usdcAddress);
        } else {
            require(usdcAddress != address(0), "USDC_ADDRESS required when DEPLOY_MOCK_USDC=false");
        }

        // Deploy oracle adapter (the labeled beam)
        NamedAttestorAdapter adapter = new NamedAttestorAdapter(attestorAddress);
        console.log("Deployed NamedAttestorAdapter at:", address(adapter));

        // Deploy factory
        PromiseFactory factory = new PromiseFactory(
            usdcAddress,
            feeRecipient,
            address(adapter)
        );
        console.log("Deployed PromiseFactory at:", address(factory));

        vm.stopBroadcast();

        // Machine-readable JSON output for deployments.ts
        console.log("");
        console.log("=== DEPLOYMENT JSON ===");
        console.log("{");
        console.log('  "chainId":', block.chainid, ',');
        console.log('  "factory": "', vm.toString(address(factory)), '",');
        console.log('  "adapter": "', vm.toString(address(adapter)), '",');
        console.log('  "usdc": "', vm.toString(usdcAddress), '"');
        console.log("}");
        console.log("=== END DEPLOYMENT JSON ===");
    }
}
