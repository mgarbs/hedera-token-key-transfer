// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IHederaTokenService.sol";
import "./HederaResponseCodes.sol";
import "./HederaTokenService.sol";

contract KeyManager is HederaTokenService {
    event TokenKeyUpdateRequested(address indexed token, address indexed newKeyAddress);
    event TokenKeyUpdateComplete(address indexed token, address indexed newKeyAddress, int64 responseCode);
    event TokenMintComplete(address indexed token, int64 amount, int64 responseCode);
    event ResponseCode(int64 responseCode);

    function updateTokenKeysPublic(address token, IHederaTokenService.TokenKey[] memory keys) public returns (int64 responseCode) {
        (responseCode) = HederaTokenService.updateTokenKeys(token, keys);
        emit ResponseCode(responseCode);
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert();
        }
    }

    function mintTokens(address token, int64 amount) external returns (int64) {
        (int responseCode, ,) = mintToken(token, amount, new bytes[](0));
        
        int64 response = int64(responseCode);
        emit TokenMintComplete(token, amount, response);
        
        if (response != HederaResponseCodes.SUCCESS) {
            revert();
        }
        return response;
    }
}
