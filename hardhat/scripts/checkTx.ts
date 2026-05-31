import { ethers } from "hardhat";

async function main() {
  const txHash = "0xee5ad82b9548013e58119d0621fdafa31596d2573f215e1fd6785d4ee343a09a";
  const provider = ethers.provider;
  const tx = await provider.getTransaction(txHash);
  if (!tx) {
    console.log("Transaction not found");
    return;
  }
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    console.log("Receipt not found");
    return;
  }
  console.log("Receipt Status:", receipt.status);
  console.log("Receipt Logs:", receipt.logs);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
