// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IHederaTokenService.sol";
import "./HederaResponseCodes.sol";

contract KeyManager {
    // Events for better tracking
    event TokenKeyUpdateRequested(address indexed token, address indexed newKeyAddress);
    event TokenKeyUpdateComplete(address indexed token, address indexed newKeyAddress, int64 responseCode);
    event TokenMintRequested(address indexed token, uint256 amount);
    event TokenMintComplete(address indexed token, uint256 amount, int64 responseCode);
    
    IHederaTokenService constant precompileAddress = IHederaTokenService(0x0000000000000000000000000000000000000167);

    function updateTokenKey(address token, address newKey) external returns (int64) {
        emit TokenKeyUpdateRequested(token, newKey);

        // Create the key structure required by HTS
        IHederaTokenService.KeyValue memory keyValue;
        keyValue.inheritAccountKey = false;
        keyValue.contractId = newKey;  // Set the new key (can be EOA or contract)
        
        IHederaTokenService.TokenKey[] memory keys = new IHederaTokenService.TokenKey[](1);
        keys[0] = IHederaTokenService.TokenKey(
            4, // SUPPLY key type
            keyValue
        );

        // Call the precompile
        (bool success, bytes memory result) = address(precompileAddress).call(
            abi.encodeWithSelector(IHederaTokenService.updateTokenKeys.selector, token, keys)
        );
        
        int64 responseCode = success ? abi.decode(result, (int64)) : int64(HederaResponseCodes.UNKNOWN);
        
        emit TokenKeyUpdateComplete(token, newKey, responseCode);
        return responseCode;
    }

    function mintTokens(address token, uint256 amount) external returns (int64) {
        emit TokenMintRequested(token, amount);

        (bool success, bytes memory result) = address(precompileAddress).call(
            abi.encodeWithSelector(IHederaTokenService.mintToken.selector, token, amount, new bytes[](0))
        );

        int64 responseCode = success ? abi.decode(result, (int64)) : int64(HederaResponseCodes.UNKNOWN);
        
        emit TokenMintComplete(token, amount, responseCode);
        return responseCode;
    }
}