import promiseFactoryArtifact from "../../../contracts/out/PromiseFactory.sol/PromiseFactory.json" with { type: "json" };
import promiseEscrowArtifact from "../../../contracts/out/PromiseEscrow.sol/PromiseEscrow.json" with { type: "json" };
import namedAttestorAdapterArtifact from "../../../contracts/out/NamedAttestorAdapter.sol/NamedAttestorAdapter.json" with { type: "json" };
import mockUsdcArtifact from "../../../contracts/out/PromiseEscrow.t.sol/MockUSDC.json" with { type: "json" };

export const PromiseFactoryAbi = promiseFactoryArtifact.abi;
export const PromiseEscrowAbi = promiseEscrowArtifact.abi;
export const NamedAttestorAdapterAbi = namedAttestorAdapterArtifact.abi;
export const MockUsdcAbi = mockUsdcArtifact.abi;
