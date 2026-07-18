// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFactoryRegistry {
    function isPoolFactoryApproved(address poolFactory) external view returns (bool);
}
