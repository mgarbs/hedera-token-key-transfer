// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IHederaTokenService.sol";
import "./HederaResponseCodes.sol";
import "./HederaTokenService.sol";

contract KeyManager is HederaTokenService {
    event TokenKeyUpdateRequested(
        address indexed token,
        address indexed newKeyAddress
    );
    event TokenKeyUpdateComplete(
        address indexed token,
        address indexed newKeyAddress,
        int64 responseCode
    );
    event TokenMintComplete(
        address indexed token,
        int64 amount,
        int64 responseCode
    );
    event ResponseCode(int64 responseCode);

    function updateTokenKey(
        address token,
        string calldata newKeyContractId
    ) external returns (int64) {
        emit TokenKeyUpdateRequested(token, msg.sender);

        // Create the key structure for the new supply key
        IHederaTokenService.KeyValue memory keyValue;
        keyValue.inheritAccountKey = false;
        keyValue.delegatableContractId = address(0); // Not using delegatable
        keyValue.ed25519 = ""; // Not using ed25519
        keyValue.ECDSA_secp256k1 = ""; // Not using ECDSA
        keyValue.contractId = address(uint160(parseInt(newKeyContractId))); // Convert the contract ID to address

        // Create the TokenKey array with supply key
        IHederaTokenService.TokenKey[]
            memory keys = new IHederaTokenService.TokenKey[](1);
        keys[0] = IHederaTokenService.TokenKey(
            4, // SUPPLY key type
            keyValue
        );

        int64 responseCode = updateTokenKeys(token, keys);
        emit TokenKeyUpdateComplete(token, msg.sender, responseCode);

        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert();
        }
        return responseCode;
    }

    function parseInt(string memory _value) internal pure returns (uint) {
        bytes memory bresult = bytes(_value);
        uint mint = 0;
        for (uint i = 0; i < bresult.length; i++) {
            require(
                uint8(bresult[i]) >= 48 && uint8(bresult[i]) <= 57,
                "Invalid contract ID format"
            );
            mint *= 10;
            mint += uint8(bresult[i]) - 48;
        }
        return mint;
    }

    function mintTokens(
        address token,
        int64 amount
    ) external returns (int64) {
        (int responseCode, , ) = mintToken(token, amount, new bytes[](0));

        int64 response = int64(responseCode);
        emit TokenMintComplete(token, amount, response);

        if (response != HederaResponseCodes.SUCCESS) {
            revert();
        }
        return response;
    }
}
