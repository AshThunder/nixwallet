import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  console.log(`Deploying with account: ${deployer}`);

  const registry = await deploy("FHERC20WrapperRegistry", {
    from: deployer,
    args: [],
    log: true,
  });

  console.log(`FHERC20WrapperRegistry deployed at: ${registry.address}`);
};

export default func;
func.tags = ["FHERC20"];
