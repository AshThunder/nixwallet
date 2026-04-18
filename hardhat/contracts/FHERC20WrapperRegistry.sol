// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { FHERC20UnderlyingWrapper } from "./fherc20/FHERC20UnderlyingWrapper.sol";

/// @title FHERC20WrapperRegistry
/// @notice Auto-deploys and indexes one FHERC20 wrapper per underlying ERC-20.
///         The first caller to interact with a new token pays the deploy gas.
contract FHERC20WrapperRegistry {
    mapping(address => address) public wrappers;
    address[] public underlyings;

    event WrapperDeployed(address indexed underlying, address indexed wrapper, address deployer);

    /// @notice Return the wrapper for `underlying`, deploying it on the fly if none exists.
    function getOrCreateWrapper(address underlying) external returns (address wrapper) {
        require(underlying != address(0), "underlying is zero address");
        wrapper = wrappers[underlying];
        if (wrapper != address(0)) return wrapper;

        (string memory name_, string memory symbol_, uint8 fherc20Decimals) = _resolveMetadata(underlying);

        FHERC20UnderlyingWrapper w = new FHERC20UnderlyingWrapper(
            IERC20(underlying),
            name_,
            symbol_,
            "",
            fherc20Decimals
        );
        wrapper = address(w);
        wrappers[underlying] = wrapper;
        underlyings.push(underlying);

        emit WrapperDeployed(underlying, wrapper, msg.sender);
    }

    /// @notice Read-only lookup — returns address(0) when no wrapper has been deployed yet.
    function getWrapper(address underlying) external view returns (address) {
        return wrappers[underlying];
    }

    /// @notice Number of wrappers deployed through this registry.
    function wrapperCount() external view returns (uint256) {
        return underlyings.length;
    }

    function _resolveMetadata(address underlying) internal view returns (string memory name_, string memory symbol_, uint8 fherc20Decimals) {
        uint8 underlyingDecimals = 18;
        string memory baseName = "Token";
        string memory baseSymbol = "TKN";

        try IERC20Metadata(underlying).decimals() returns (uint8 d) {
            underlyingDecimals = d;
        } catch {}
        try IERC20Metadata(underlying).name() returns (string memory n) {
            baseName = n;
        } catch {}
        try IERC20Metadata(underlying).symbol() returns (string memory s) {
            baseSymbol = s;
        } catch {}

        fherc20Decimals = underlyingDecimals > 6 ? 6 : underlyingDecimals;
        name_ = string.concat("Confidential ", baseName);
        symbol_ = string.concat("c", baseSymbol);
    }
}
