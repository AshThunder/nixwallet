import { ethers } from "hardhat";
import hre from "hardhat";

async function main() {
  const networkName = hre.network.name;
  console.log(`Executing on network: ${networkName}`);

  let registryAddress = "";
  let usdcAddress = "";

  if (networkName === "baseSepolia") {
    registryAddress = "0xfD4223809FE333FC23468F76bB38BE4169853761";
    usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  } else if (networkName === "arbitrumSepolia") {
    registryAddress = "0xe572ED5b27b44641Da441cE479643B30CF200E9c";
    usdcAddress = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
  } else if (networkName === "sepolia") {
    registryAddress = "0xEE098B005e1B979Ca32ac427c367C343879e502C";
    usdcAddress = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  } else {
    throw new Error(`Unsupported network: ${networkName}`);
  }

  const [signer] = await ethers.getSigners();
  console.log(`Using signer: ${signer.address}`);

  const registry = await ethers.getContractAt("FHERC20WrapperRegistry", registryAddress, signer);

  console.log(`Checking wrapper for USDC (${usdcAddress})...`);
  const existingWrapper = await registry.getWrapper(usdcAddress);
  if (existingWrapper && existingWrapper !== ethers.ZeroAddress) {
    console.log(`Wrapper already exists at: ${existingWrapper}`);
    return;
  }

  console.log(`Wrapper does not exist. Calling getOrCreateWrapper...`);
  const tx = await registry.getOrCreateWrapper(usdcAddress);
  console.log(`Transaction sent! Hash: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Transaction confirmed!`);

  const wrapperAddress = await registry.getWrapper(usdcAddress);
  console.log(`Wrapper address resolved: ${wrapperAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
