// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MinimalFactoryRegistry {
    address public immutable approvedPoolFactory;

    constructor(address poolFactory_) {
        require(poolFactory_ != address(0), "ZERO_FACTORY");
        approvedPoolFactory = poolFactory_;
    }

    function isPoolFactoryApproved(address poolFactory) external view returns (bool) {
        return poolFactory == approvedPoolFactory;
    }
}
