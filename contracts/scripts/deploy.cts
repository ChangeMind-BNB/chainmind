const { ethers } = require('hardhat');

async function main() {
  const USDC_BSC = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';

  console.log('Deploying ChainMindDeposit...');

  const ChainMindDeposit = await ethers.getContractFactory('ChainMindDeposit');
  const contract = await ChainMindDeposit.deploy(USDC_BSC);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`ChainMindDeposit deployed to: ${address}`);
  console.log(`USDC token: ${USDC_BSC}`);
  console.log('');
  console.log('Add this to your .env:');
  console.log(`CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
