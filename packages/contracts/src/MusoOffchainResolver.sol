// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice ENSIP-10 wildcard resolution entry point.
interface IExtendedResolver {
    function resolve(bytes memory name, bytes memory data) external view returns (bytes memory);
}

/// @notice The call the gateway answers (same selector as IExtendedResolver.resolve).
interface IResolverService {
    function resolve(bytes calldata name, bytes calldata data)
        external
        view
        returns (bytes memory result, uint64 expires, bytes memory sig);
}

/// @title MusoOffchainResolver
/// @notice ENS resolver for `*.muso.eth`: every MUSO creator gets a free subname
///         (`<username>.muso.eth`) that resolves to their linked payout wallet and carries their
///         public profile as text records. Records live in MUSO's database and are served by
///         MUSO's CCIP-Read gateway (EIP-3668); this contract only checks the gateway's signature.
/// @dev    Set as the resolver of the parent name. Signature scheme matches
///         ensdomains/offchain-resolver, so standard clients (viem, ethers, the ENS app) work:
///         keccak256(0x1900 ‖ resolver ‖ expires ‖ keccak256(request) ‖ keccak256(result)).
contract MusoOffchainResolver is IExtendedResolver, Ownable {
    /// @notice EIP-3668: tells the client to ask `urls` and call `callbackFunction` with the answer.
    error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData);

    error SignatureExpired(uint64 expires);
    error UntrustedSigner(address signer);

    event UrlChanged(string url);
    event SignerChanged(address indexed signer, bool trusted);

    /// @notice Gateway URL template, e.g. `https://api.muso.app/v1/ens/gateway/{sender}/{data}.json`.
    string public url;
    mapping(address => bool) public signers;

    constructor(address owner_, string memory url_, address[] memory signers_) Ownable(owner_) {
        url = url_;
        emit UrlChanged(url_);
        for (uint256 i = 0; i < signers_.length; i++) {
            signers[signers_[i]] = true;
            emit SignerChanged(signers_[i], true);
        }
    }

    function setUrl(string calldata url_) external onlyOwner {
        url = url_;
        emit UrlChanged(url_);
    }

    /// @notice Add or remove a gateway signing key (rotate by adding the new one, then removing the old).
    function setSigner(address signer, bool trusted) external onlyOwner {
        signers[signer] = trusted;
        emit SignerChanged(signer, trusted);
    }

    /// @notice Always defers to the gateway.
    function resolve(bytes calldata name, bytes calldata data) external view override returns (bytes memory) {
        bytes memory callData = abi.encodeWithSelector(IResolverService.resolve.selector, name, data);
        string[] memory urls = new string[](1);
        urls[0] = url;
        revert OffchainLookup(address(this), urls, callData, this.resolveWithProof.selector, callData);
    }

    /// @notice CCIP-Read callback: returns the gateway's answer if a trusted signer signed it in time.
    /// @param response `abi.encode(bytes result, uint64 expires, bytes sig)` from the gateway.
    /// @param extraData The original `callData` (the request the signature covers).
    function resolveWithProof(bytes calldata response, bytes calldata extraData) external view returns (bytes memory) {
        (bytes memory result, uint64 expires, bytes memory sig) = abi.decode(response, (bytes, uint64, bytes));
        if (expires < block.timestamp) revert SignatureExpired(expires);
        address signer = ECDSA.recover(makeSignatureHash(address(this), expires, extraData, result), sig);
        if (!signers[signer]) revert UntrustedSigner(signer);
        return result;
    }

    function makeSignatureHash(address target, uint64 expires, bytes memory request, bytes memory result)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(hex"1900", target, expires, keccak256(request), keccak256(result)));
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IExtendedResolver).interfaceId // 0x9061b923
            || interfaceId == 0x01ffc9a7; // ERC-165
    }
}
