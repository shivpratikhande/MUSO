// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MusoOffchainResolver, IExtendedResolver} from "../src/MusoOffchainResolver.sol";

contract MusoOffchainResolverTest is Test {
    MusoOffchainResolver resolver;
    address owner = makeAddr("owner");
    uint256 signerKey = 0xA11CE;
    address signer;
    string constant URL = "https://api.muso.test/v1/ens/gateway/{sender}/{data}.json";

    // DNS-encoded "shiv-beats.muso.eth" and an addr(bytes32) call for it.
    bytes name = hex"0a736869762d6265617473046d75736f0365746800";
    bytes data;

    function setUp() public {
        vm.warp(1_800_000_000);
        signer = vm.addr(signerKey);
        address[] memory s = new address[](1);
        s[0] = signer;
        resolver = new MusoOffchainResolver(owner, URL, s);
        data = abi.encodeWithSignature("addr(bytes32)", keccak256("node"));
    }

    function _request() internal view returns (bytes memory) {
        return abi.encodeWithSelector(IExtendedResolver.resolve.selector, name, data);
    }

    function _sign(uint256 key, uint64 expires, bytes memory request, bytes memory result)
        internal
        view
        returns (bytes memory)
    {
        bytes32 h = resolver.makeSignatureHash(address(resolver), expires, request, result);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, h);
        return abi.encodePacked(r, s, v);
    }

    function test_resolve_revertsWithOffchainLookup() public {
        string[] memory urls = new string[](1);
        urls[0] = URL;
        bytes memory req = _request();
        vm.expectRevert(
            abi.encodeWithSelector(
                MusoOffchainResolver.OffchainLookup.selector,
                address(resolver),
                urls,
                req,
                MusoOffchainResolver.resolveWithProof.selector,
                req
            )
        );
        resolver.resolve(name, data);
    }

    function test_resolveWithProof_returnsSignedResult() public view {
        bytes memory result = abi.encode(address(0xBEEF));
        uint64 expires = uint64(block.timestamp + 300);
        bytes memory req = _request();
        bytes memory response = abi.encode(result, expires, _sign(signerKey, expires, req, result));
        assertEq(resolver.resolveWithProof(response, req), result);
    }

    function test_resolveWithProof_rejectsExpired() public {
        bytes memory result = abi.encode(address(0xBEEF));
        uint64 expires = uint64(block.timestamp - 1);
        bytes memory req = _request();
        bytes memory response = abi.encode(result, expires, _sign(signerKey, expires, req, result));
        vm.expectRevert(abi.encodeWithSelector(MusoOffchainResolver.SignatureExpired.selector, expires));
        resolver.resolveWithProof(response, req);
    }

    function test_resolveWithProof_rejectsUntrustedSigner() public {
        bytes memory result = abi.encode(address(0xBEEF));
        uint64 expires = uint64(block.timestamp + 300);
        bytes memory req = _request();
        bytes memory response = abi.encode(result, expires, _sign(0xBAD, expires, req, result));
        vm.expectRevert(abi.encodeWithSelector(MusoOffchainResolver.UntrustedSigner.selector, vm.addr(0xBAD)));
        resolver.resolveWithProof(response, req);
    }

    function test_resolveWithProof_rejectsSwappedResult() public {
        bytes memory result = abi.encode(address(0xBEEF));
        uint64 expires = uint64(block.timestamp + 300);
        bytes memory req = _request();
        bytes memory sig = _sign(signerKey, expires, req, result);
        // A man in the middle swaps the address: the recovered signer no longer matches.
        bytes memory forged = abi.encode(abi.encode(address(0xBAD1)), expires, sig);
        vm.expectRevert();
        resolver.resolveWithProof(forged, req);
    }

    function test_resolveWithProof_rejectsAnswerForAnotherRequest() public {
        bytes memory result = abi.encode(address(0xBEEF));
        uint64 expires = uint64(block.timestamp + 300);
        bytes memory req = _request();
        bytes memory response = abi.encode(result, expires, _sign(signerKey, expires, req, result));
        bytes memory otherReq = abi.encodeWithSelector(
            IExtendedResolver.resolve.selector, hex"05616c696365046d75736f0365746800", data
        );
        vm.expectRevert();
        resolver.resolveWithProof(response, otherReq);
    }

    function test_onlyOwnerManagesUrlAndSigners() public {
        address stranger = makeAddr("stranger");
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        resolver.setUrl("https://evil.test/{sender}/{data}.json");
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        resolver.setSigner(stranger, true);
        vm.stopPrank();

        vm.startPrank(owner);
        resolver.setSigner(signer, false);
        resolver.setUrl("https://api2.muso.test/{sender}/{data}.json");
        vm.stopPrank();
        assertFalse(resolver.signers(signer));
        assertEq(resolver.url(), "https://api2.muso.test/{sender}/{data}.json");
    }

    function test_supportsInterface() public view {
        assertTrue(resolver.supportsInterface(0x9061b923));
        assertTrue(resolver.supportsInterface(0x01ffc9a7));
        assertFalse(resolver.supportsInterface(0xffffffff));
    }
}
