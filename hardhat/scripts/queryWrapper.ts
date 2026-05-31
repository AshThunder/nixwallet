import { ethers } from "hardhat";

async function main() {
  const registryAddress = "0xfD4223809FE333FC23468F76bB38BE4169853761";
  const usdcAddress = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt("FHERC20WrapperRegistry", registryAddress, signer);
  const wrapper = await registry.getWrapper(usdcAddress);
  console.log("Wrapper for USDC:", wrapper);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
