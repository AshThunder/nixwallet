import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getAddress } from "ethers";

/** Canonical WETH per Fhenix host-chain testnet. */
const WETH_BY_NETWORK: Record<string, string> = {
  sepolia: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
  baseSepolia: "0x4200000000000000000000000000000000000006",
  arbitrumSepolia: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const networkName = hre.network.name;

  const wethRaw = WETH_BY_NETWORK[networkName];
  if (!wethRaw) {
    throw new Error(`No WETH address configured for network: ${networkName}`);
  }
  const weth = getAddress(wethRaw);

  console.log(`Deploying native wrapper on ${networkName} with WETH ${weth}`);

  const nativeWrapper = await deploy("FHERC20NativeUnderlyingWrapper", {
    from: deployer,
    contract: "FHERC20NativeUnderlyingWrapper",
    args: [weth],
    log: true,
  });

  console.log(`FHERC20NativeUnderlyingWrapper deployed at: ${nativeWrapper.address}`);
  console.log(`Add to extension NATIVE_WRAPPER_ADDRESSES.${networkName}: '${nativeWrapper.address}'`);
};

export default func;
func.tags = ["FHERC20", "NativeWrapper"];
func.dependencies = [];
